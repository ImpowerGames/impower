import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { scanTree, linkReason, parseWorktreeList } from "../.agents/skills/clean-worktrees/clean-worktrees.mjs";

const guard = fileURLToPath(new URL("../.agents/skills/clean-worktrees/clean-worktrees.mjs", import.meta.url));
export const markerName = "filer-owner.json";
const same = (a, b) => process.platform === "win32" ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b);
const under = (p, dir) => { const r = path.relative(dir, p); return r !== "" && r !== ".." && !r.startsWith(`..${path.sep}`) && !path.isAbsolute(r); };
function run(executable, args, cwd, env = process.env) {
  const result = spawnSync(executable, args, { cwd, env, encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`${executable} failed: ${result.error?.message ?? result.stderr ?? result.stdout}`);
  return result.stdout.trim();
}
function gitEnvironment() {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key) && !/^(?:LC_ALL|LANG|LANGUAGE)$/i.test(key)));
  return { ...env, LC_ALL: "C", LANG: "C", LANGUAGE: "C" };
}
// Every repository/ownership query and mutation is anchored to its explicit
// cwd. Ambient Git settings must not redirect a per-worktree admin marker.
const git = (cwd, args) => run("git", args, cwd, gitEnvironment());
function noLinks(p) {
  for (let at = path.resolve(p); ; at = path.dirname(at)) {
    try { if (fs.lstatSync(at).isSymbolicLink()) throw new Error(`Linked path is refused: ${at}`); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    if (at === path.dirname(at)) break;
  }
}
function absolute(p) { if (!p || !path.isAbsolute(p)) throw new Error("Supply an absolute path"); noLinks(p); return path.resolve(p); }
function read(p) { noLinks(p); return JSON.parse(fs.readFileSync(p, "utf8")); }
function entries(root) { return parseWorktreeList(git(root, ["worktree", "list", "--porcelain"])); }
function mainRoot(root) {
  root = fs.realpathSync.native(absolute(root));
  if (!same(git(root, ["rev-parse", "--show-toplevel"]), root) || !same(entries(root)[0]?.path ?? ".", root)) throw new Error("Root must name the main checkout");
  return fs.realpathSync(root);
}
function jobs(root) { return `${root}.filer-jobs`; }
function marker(tree) { return path.join(git(tree, ["rev-parse", "--absolute-git-dir"]), markerName); }
export async function checkLinks(tree) {
  noLinks(tree);
  const scan = await scanTree(tree);
  const reason = linkReason(scan, tree);
  if (reason) throw new Error(`${tree}: ${reason}`);
  for (const { link } of scan.links) {
    let target;
    try { target = fs.realpathSync(link); } catch (error) { throw new Error(`Unreadable link ${link}: ${error.message}`); }
    if (!same(target, tree) && !under(target, tree)) throw new Error(`External dependency link refused: ${link} -> ${target}`);
  }
}
function owned(recordPath, owner) {
  recordPath = absolute(recordPath);
  const r = read(recordPath);
  if (r.version !== 1 || !owner || r.owner !== owner || r.state !== "active" || typeof r.id !== "string" || !/^[a-f0-9-]{36}$/.test(r.id)) throw new Error("Missing, inactive or ambiguous filer ownership");
  const root = mainRoot(r.root);
  const expectedRecord = path.join(jobs(root), r.id, "owner.json");
  const tree = path.join(`${root}.worktrees`, "repro", `filer-${r.id}`);
  if (!same(expectedRecord, recordPath) || !same(tree, r.tree) || r.branch !== `repro/filer-${r.id}`) throw new Error("Ownership path or branch identity changed");
  noLinks(tree);
  const match = entries(root).filter(e => same(e.path, tree));
  if (match.length !== 1 || match[0].branch !== r.branch || match[0].locked || !same(git(tree, ["rev-parse", "--show-toplevel"]), tree)) throw new Error("Worktree registration or branch ownership changed");
  const gitdir = absolute(git(tree, ["rev-parse", "--absolute-git-dir"]));
  if (!same(gitdir, r.gitdir) || JSON.stringify(read(path.join(gitdir, markerName))) !== JSON.stringify({ id: r.id, owner, record: recordPath })) throw new Error("Worktree ownership marker changed");
  return { ...r, root, tree, recordPath };
}
export async function create({ root, owner, toolingOnly = false }) {
  root = mainRoot(root);
  if (typeof owner !== "string" || !owner.trim() || owner.length > 500) throw new Error("Supply the stable filing session identity as --owner");
  const id = randomUUID(), branch = `repro/filer-${id}`, tree = path.join(`${root}.worktrees`, "repro", `filer-${id}`);
  const artifacts = path.join(jobs(root), id), recordPath = path.join(artifacts, "owner.json");
  noLinks(tree); noLinks(artifacts);
  if (entries(root).some(e => same(e.path, tree) || under(tree, e.path) || under(e.path, tree))) throw new Error("Proposed filer tree overlaps a registered checkout");
  fs.mkdirSync(artifacts, { recursive: true });
  git(root, ["worktree", "add", "-b", branch, tree, "origin/main"]);
  const gitdir = absolute(git(tree, ["rev-parse", "--absolute-git-dir"]));
  const record = { version: 1, id, owner, root, tree, branch, gitdir, head: git(tree, ["rev-parse", "HEAD"]), state: "active", toolingOnly, installed: false };
  fs.writeFileSync(recordPath, JSON.stringify(record, null, 2) + "\n", { flag: "wx" });
  fs.writeFileSync(marker(tree), JSON.stringify({ id, owner, record: recordPath }) + "\n", { flag: "wx" });
  if (!toolingOnly) {
    try { await install(recordPath, owner); }
    catch (error) { throw new Error(`${error.message}; preserve owned tree ${tree} and record ${recordPath}`); }
  }
  return { record: recordPath, tree, artifacts, branch };
}
async function exclusive(recordPath, owner, action) {
  owned(recordPath, owner);
  const lock = `${recordPath}.lock`;
  noLinks(lock);
  let fd;
  try { fd = fs.openSync(lock, "wx"); }
  catch (error) { throw new Error(`Ownership operation already active or uncertain at ${lock}: ${error.message}`); }
  try { fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, owner }) + "\n"); return await action(); }
  finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}
export async function install(recordPath, owner) {
  return exclusive(recordPath, owner, () => installOwned(recordPath, owner));
}
async function installOwned(recordPath, owner) {
  const r = owned(recordPath, owner);
  await checkLinks(r.tree);
  // Use the npm CLI JS entrypoint so Windows needs neither cmd interpolation nor shell quoting.
  const npm = process.env.npm_execpath || run(process.platform === "win32" ? "where.exe" : "which", ["npm"], r.root).split(/\r?\n/)[0];
  const realNpm = fs.realpathSync(npm);
  const cli = realNpm.endsWith(".js") ? realNpm : path.join(path.dirname(npm), "node_modules", "npm", "bin", "npm-cli.js");
  if (!fs.existsSync(cli)) throw new Error(`npm CLI unavailable at ${cli}; preserve ${recordPath} and repair the independent install route`);
  const manifest = path.join(r.tree, "package.json"); noLinks(manifest);
  if (!fs.statSync(manifest).isFile()) throw new Error("Owned checkout must contain a root package.json before an independent install");
  // Preserve prefix and config-file inputs: changing them can relocate system
  // registry/auth configuration. CLI mode flags keep the operation local/real.
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^npm_config_(?:global|location|dry[-_]run|package[-_]lock[-_]only)$/i.test(key))), PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1" };
  const flags = ["--global=false", "--location=project", "--dry-run=false", "--package-lock-only=false"];
  const localPrefix = run(process.execPath, [cli, "prefix", ...flags], r.tree, env);
  if (!path.isAbsolute(localPrefix) || !same(fs.realpathSync.native(localPrefix), r.tree)) throw new Error("npm local prefix is not the exact owned checkout; repair npm configuration before retrying the supported helper");
  let globalPrefix;
  try { globalPrefix = run(process.execPath, [cli, "config", "get", "prefix", ...flags], r.tree, env); }
  catch (cause) { throw new Error(`npm global prefix cannot be verified; repair npm configuration while preserving registry/auth settings, then retry the supported helper: ${cause.message}`, { cause }); }
  if (!path.isAbsolute(globalPrefix)) throw new Error("npm global prefix cannot be verified; repair npm configuration before retrying the supported helper");
  const globalTop = process.platform === "win32" ? globalPrefix : path.join(globalPrefix, "lib");
  const physicalGlobalTop = fs.existsSync(globalTop) ? fs.realpathSync.native(globalTop) : globalTop;
  // npm install treats local/globalTop equality as a self-install even with
  // global=false. Refuse it rather than changing config or the root manifest.
  if (same(physicalGlobalTop, r.tree)) throw new Error("npm global prefix collides with the owned local checkout; configure a separate global prefix while preserving registry/auth settings, then retry the supported helper");
  run(process.execPath, [cli, "install", ...flags], r.tree, env);
  await checkLinks(r.tree);
  const saved = read(recordPath); saved.installed = true;
  fs.writeFileSync(recordPath, JSON.stringify(saved, null, 2) + "\n");
}
export async function remove(recordPath, owner) {
  return exclusive(recordPath, owner, () => removeOwned(recordPath, owner));
}
async function removeOwned(recordPath, owner) {
  const r = owned(recordPath, owner);
  if (git(r.tree, ["rev-parse", "HEAD"]) !== r.head) throw new Error("Filer has committed work; preserve it for a person");
  await checkLinks(r.tree);
  const result = spawnSync(process.execPath, [guard, "--apply", "--root", r.root, "--remove", r.tree], { cwd: r.root, env: gitEnvironment(), encoding: "utf8", windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(`Guarded cleanup refused or failed; preserve ownership and artifacts: ${result.error?.message ?? result.stdout + result.stderr}`);
  if (fs.existsSync(r.tree) || entries(r.root).some(e => same(e.path, r.tree))) throw new Error("Cleanup result could not be verified; preserve ownership and artifacts");
  // Delete only the unchanged owned branch, after verifying no other checkout holds it.
  if (git(r.root, ["rev-parse", `refs/heads/${r.branch}`]) !== r.head) throw new Error("Owned branch moved; preserve it");
  git(r.root, ["branch", "-D", r.branch]);
  const saved = read(recordPath); saved.state = "removed";
  fs.writeFileSync(recordPath, JSON.stringify(saved, null, 2) + "\n");
  return result.stdout.trim();
}
export async function main(argv) {
  const command = argv.shift(), options = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--tooling-only") options.toolingOnly = true;
    else if (["--root", "--owner", "--record"].includes(argv[i]) && argv[i + 1]) options[argv[i].slice(2)] = argv[++i];
    else throw new Error(`Unknown or incomplete option ${argv[i]}`);
  }
  if (command === "create") return create(options);
  if (command === "install") return install(options.record, options.owner);
  if (command === "check") { const r = owned(options.record, options.owner); await checkLinks(r.tree); return { tree: r.tree, safe: true }; }
  if (command === "remove") return remove(options.record, options.owner);
  throw new Error("Use create, install, check or remove");
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href.toLowerCase() === import.meta.url.toLowerCase()) {
  main(process.argv.slice(2)).then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
