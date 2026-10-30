import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export const jobRootOf = (mainRoot) => path.join(path.dirname(mainRoot), `${path.basename(mainRoot)}.review-jobs`);

export function reviewJobRoot(cwd) {
  const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd, encoding: "utf8", windowsHide: true }).trim();
  return jobRootOf(fs.realpathSync.native(path.dirname(common)));
}

export function testScratch(prefix, from) {
  const root = reviewJobRoot(from);
  fs.mkdirSync(root, { recursive: true });
  const dir = fs.mkdtempSync(path.join(root, `test-${prefix}-`));
  fs.writeFileSync(path.join(dir, "owner.jsonl"), JSON.stringify({ event: "test-owner", pid: process.pid }) + "\n");
  return dir;
}

export const NOT_JOB_STATE = /^(?:reviewer-.*|codex-home-.*|gh-config-.*|\.git|node_modules|npm-cache|\.npm|_cacache)$/;
const vanished = (error) => error.code === "ENOENT" || error.code === "ENOTDIR";
export function reviewJobFiles(jobDir) {
  const files = [];
  const walk = (directory) => {
    let entries;
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); }
    catch (error) { if (vanished(error)) return; throw error; }
    if (directory !== jobDir && entries.some((entry) => entry.name === ".git")) return;
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) { if (!NOT_JOB_STATE.test(entry.name)) walk(file); continue; }
      if (!entry.isFile()) continue;
      let size;
      try { size = fs.statSync(file).size; }
      catch (error) { if (vanished(error)) continue; throw error; }
      files.push({ file, size });
    }
  };
  walk(jobDir);
  return files;
}

const lexicallyInside =(child, parent) => {
  const relative = path.relative(parent, child);
  return relative !== "" && !relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative);
};

const resolvedExisting = (p) => {
  let existing = p;
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) return null;
    existing = parent;
  }
  return path.join(fs.realpathSync.native(existing), path.relative(existing, p));
};

export function isInsideJobRoot(p, root) {
  const resolvedRoot = resolvedExisting(path.resolve(root));
  const resolved = resolvedExisting(path.resolve(p));
  return !!resolvedRoot && !!resolved && lexicallyInside(resolved, resolvedRoot);
}

export function assertInsideJobRoot(entries, root, where) {
  const outside = entries.filter(([, p]) => typeof p !== "string" || !isInsideJobRoot(p, root));
  if (outside.length) throw new Error(`Review job paths must lie under ${root} (${where}): ${outside.map(([label, p]) => `${label} ${p}`).join("; ")}`);
}

function skippedByWalk(p, root, kind) {
  const resolvedRoot = resolvedExisting(path.resolve(root));
  const resolved = resolvedExisting(path.resolve(p));
  if (!resolvedRoot || !resolved) return false;
  const parts = path.relative(resolvedRoot, resolved).split(path.sep);
  if (!/^pr-\d+$/.test(parts[0])) return false;
  const directories = kind === "directory" ? parts.slice(1) : parts.slice(1, -1);
  let directory = path.join(resolvedRoot, parts[0]);
  for (const name of directories) {
    directory = path.join(directory, name);
    if (NOT_JOB_STATE.test(name) || fs.existsSync(path.join(directory, ".git"))) return true;
  }
  return false;
}

export function assertWalkedJobState(entries, root) {
  const hidden = entries.filter(([, p, kind]) => typeof p === "string" && skippedByWalk(p, root, kind));
  if (hidden.length) throw new Error(`Review job state must not lie inside a reviewer workspace (reviewer-*), a reviewer tool home (codex-home-*, gh-config-*), a Git checkout, node_modules or a package cache (npm-cache, .npm, _cacache), which the review-job readers skip; use a launch-state directory such as launch-<reviewer-id>-<attempt>: ${hidden.map(([label, p]) => `${label} ${p}`).join("; ")}`);
}

export function assertReviewerDirectory(directory) {
  let resolved;
  try {
    resolved = fs.realpathSync.native(directory);
    if (!fs.statSync(resolved).isDirectory()) throw new Error("not a directory");
    fs.readdirSync(resolved);
  } catch (error) {
    throw new Error(`Reviewer directory ${directory} must be an existing readable directory; create a fresh empty directory before building the prompt or launching (${error.message})`);
  }
  return resolved;
}
