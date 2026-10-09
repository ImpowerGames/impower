import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { baseName, isShellCommandString, programBefore, readCommand } from "./typed-issue-hook.mjs";

const route = "Use node scripts/filer-worktree.mjs remove --record <absolute-owner.json> --owner <filing-session> for owned filing trees, or the guarded clean-worktrees --remove route for other trees.";
function git(cwd, args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true, timeout: 2000 });
  if (r.error || r.status !== 0) throw new Error(r.error?.message ?? r.stderr);
  return r.stdout.trim();
}
const under = (p, root) => { const r = path.relative(root, p); return r === "" || (r !== ".." && !r.startsWith(`..${path.sep}`) && !path.isAbsolute(r)); };
const real = p => fs.realpathSync.native(p);
const sourceCheckout = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
function exists(p) { try { fs.lstatSync(p); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; } }
function owned(tree) { return exists(path.join(git(tree, ["rev-parse", "--absolute-git-dir"]), "filer-owner.json")); }
function identity(target) {
  let nearest = null;
  const traversals = [];
  // Inspect every lexical ancestor before resolving the final target: a path
  // may enter owned T through A, then leave T through T/node_modules into E.
  for (let at = target; ; at = path.dirname(at)) {
    try {
      const stat = fs.lstatSync(at);
      if (stat.isSymbolicLink()) traversals.push({ link: at, target: real(at), source: path.join(real(path.dirname(at)), path.basename(at)) });
      if (!nearest) nearest = at;
    } catch (error) { if (error.code !== "ENOENT") throw error; }
    if (at === path.dirname(at)) break;
  }
  if (!nearest) throw new Error("No readable existing path ancestor");
  return { physical: path.resolve(real(nearest), path.relative(nearest, target)), traversals };
}
function links(p, budget = { deadline: Date.now() + 500, count: 0 }) {
  if (++budget.count > 10000 || Date.now() > budget.deadline) return `Direct cleanup inspection exceeded its bounded check. ${route}`;
  const stat = fs.lstatSync(p);
  // Even internal junctions are handed to the guard, which unlinks them
  // before removal. Do not skip a junction's possible external descendants.
  if (stat.isSymbolicLink()) return `Linked cleanup entry refused: ${p} -> ${real(p)}. ${route}`;
  if (stat.isDirectory()) for (const name of fs.readdirSync(p)) { const reason = links(path.join(p, name), budget); if (reason) return reason; }
  return null;
}
const gitValueOptions = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--super-prefix", "--config-env", "--attr-source"]);
// Reuse the established tokenizer; quoted prose/comments are not commands.
// Indirect runtimes and variable paths outside owned contexts remain outside
// coverage. Literal location changes and shell command strings are recognized.
function operations(command, shell, cwd, depth = 0) {
  if (depth > 3) return [];
  const { segments, subs } = readCommand(command, shell), found = [];
  for (const sub of subs) found.push(...operations(sub, shell, cwd, depth + 1));
  let location = cwd, locationError = null;
  for (const { tokens, positions } of segments) {
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i], name = baseName(token);
      if (token.quoted && isShellCommandString(tokens, i, positions)) {
        const before = programBefore(tokens, i - 1);
        const innerShell = before >= 0 && /^(pwsh|powershell)$/.test(baseName(tokens[before])) ? "powershell" : "bash";
        found.push(...operations(token.text, innerShell, location, depth + 1));
      }
      const method = !token.quoted && /(?:\.|::)Delete$/i.test(token.text) && command.slice(token.end).trimStart().startsWith("(");
      if (method) found.push({ kind: "delete", cwd: location, text: command, locationError });
      if (!positions.has(i)) continue;
      const args = tokens.slice(i + 1);
      if (["cd", "set-location", "pushd"].includes(name)) {
        const target = args.find(t => !t.text.startsWith("-"));
        if (target && !/[`$]/.test(target.text)) {
          const next = path.resolve(location, target.text);
          try { if (!fs.statSync(next).isDirectory()) throw new Error("not a directory"); location = next; }
          catch { locationError = `Literal location cannot be verified: ${next}`; }
        }
        continue;
      }
      if (["rm", "rmdir", "rd", "remove-item", "del", "erase"].includes(name)) found.push({ kind: "delete", cwd: location, text: command.slice(token.start), locationError });
      if (name === "git") {
        let k = 0;
        while (args[k]?.text.startsWith("-")) { const value = args[k].text; k += gitValueOptions.has(value) ? 2 : 1; }
        if (args[k]?.text.toLowerCase() === "worktree" && ["remove", "add"].includes(args[k + 1]?.text.toLowerCase())) found.push({ kind: args[k + 1].text.toLowerCase() === "remove" ? "remove" : "setup", cwd: location, text: command.slice(token.start), locationError });
      }
      if (name === "mklink" || (name === "ln" && args.some(t => /^-.*s/.test(t.text))) || (name === "new-item" && args.some(t => /^(junction|symboliclink)$/i.test(t.text))) || (name === "npm" && args.some(t => /^(install|ci)$/i.test(t.text)))) found.push({ kind: "setup", cwd: location, text: command.slice(token.start), locationError });
    }
  }
  return found;
}
function inspect(op) {
  if (op.locationError) return `${op.locationError}; cleanup is refused. ${route}`;
  if (op.kind === "remove") return `Direct git worktree remove is refused: it can follow dependency junctions. ${route}`;
  let roots, registryCwd = op.cwd, fromRepository = true;
  try { git(registryCwd, ["rev-parse", "--show-toplevel"]); }
  catch { registryCwd = sourceCheckout; fromRepository = false; }
  try {
    const top = real(git(registryCwd, ["rev-parse", "--show-toplevel"]));
    if (fromRepository && owned(top)) return `Direct setup or cleanup in owned filing checkout ${top} is refused, including ambiguous targets. ${route}`;
    roots = git(registryCwd, ["worktree", "list", "--porcelain"]).split(/\r?\n/).filter(line => line.startsWith("worktree ")).map(line => real(line.slice(9)));
  } catch (error) {
    // The source checkout is the only fallback inventory. Do not discover
    // arbitrary repositories or treat unreadable identity as unrelated.
    return `Cleanup ownership cannot be checked: ${error.message}. ${route}`;
  }
  const candidates = [...op.text.matchAll(/"([^"\n]+)"|'([^'\n]+)'|([^\s;|&()]+)/g)].map(m => m[1] ?? m[2] ?? m[3]).filter(s => !s.startsWith("-") && !/[`$]/.test(s));
  for (const candidate of candidates) {
    const target = path.resolve(op.cwd, candidate);
    try {
      const id = identity(target);
      const containing = roots.find(tree => under(id.physical, tree));
      const reachesCheckout = containing || roots.some(tree => under(tree, id.physical)) || id.traversals.some(link => roots.some(tree => under(link.source, tree) || under(link.target, tree)));
      if (!reachesCheckout) continue;
      if (id.traversals.length) { const link = id.traversals[0]; return `Linked cleanup/setup path refused: ${link.link} -> ${link.target}. ${route}`; }
      if (containing && owned(containing)) return `Direct setup or cleanup targeting owned filing tree ${containing} is refused. ${route}`;
      if (op.kind !== "delete") continue;
      if (roots.some(tree => under(tree, id.physical))) return `Direct cleanup contains registered checkout ${id.physical}. ${route}`;
      if (containing && exists(target)) { const reason = links(target); if (reason) return reason; }
    } catch (error) { return `Cleanup target identity cannot be checked: ${target}: ${error.message}. ${route}`; }
  }
  return null;
}
export function decide(command, shell, cwd = process.cwd()) {
  if (typeof command !== "string") return null;
  if (!["bash", "powershell"].includes(shell)) return decide(command, "bash", cwd) ?? decide(command, "powershell", cwd);
  const ops = operations(command, shell, cwd);
  if (ops.length) {
    try { if (owned(real(git(cwd, ["rev-parse", "--show-toplevel"])))) return `Direct setup/cleanup from an owned filing context is refused, including changed or ambiguous locations. ${route}`; }
    catch { /* inspect each operation's explicit location below */ }
  }
  for (const op of ops) { const reason = inspect(op); if (reason) return reason; }
  return null;
}
export async function main() {
  let raw = ""; for await (const chunk of process.stdin) raw += chunk;
  const event = JSON.parse(raw), input = event.tool_input;
  const reason = decide(input?.command, String(event.tool_name).toLowerCase(), event.cwd ?? process.env.CLAUDE_PROJECT_DIR);
  if (reason) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } }));
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href.toLowerCase() === import.meta.url.toLowerCase()) main().catch(error => { console.error(error); process.exitCode = 2; });
