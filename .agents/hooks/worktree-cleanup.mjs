import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const route = "Use node scripts/filer-worktree.mjs remove --record <absolute-owner.json> --owner <filing-session> for owned filing trees, or the guarded clean-worktrees --remove route for other trees.";
function git(cwd, args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true, timeout: 10000 });
  if (r.error || r.status !== 0) throw new Error(r.error?.message ?? r.stderr);
  return r.stdout.trim();
}
const under = (p, root) => { const r = path.relative(root, p); return r === "" || (r !== ".." && !r.startsWith(`..${path.sep}`) && !path.isAbsolute(r)); };
function links(p, root, budget = { deadline: Date.now() + 500, count: 0 }) {
  if (++budget.count > 10000 || Date.now() > budget.deadline) return `Direct cleanup inspection exceeded its bounded check; use guarded cleanup. ${route}`;
  const stat = fs.lstatSync(p);
  if (stat.isSymbolicLink()) {
    const target = fs.realpathSync(p);
    if (!under(target, root)) return `External cleanup target refused: ${p} -> ${target}. ${route}`;
    return null;
  }
  if (stat.isDirectory()) for (const name of fs.readdirSync(p)) { const reason = links(path.join(p, name), root, budget); if (reason) return reason; }
  return null;
}
// This policy covers recognized direct tool-shell forms, not scripts evaluated
// by another runtime. Only relevant commands cause Git or directory inspection.
export function decide(command, shell, cwd = process.cwd()) {
  if (typeof command !== "string") return null;
  const worktreeRemove = /\bgit\b[^\n;|&]*\bworktree\s+remove\b/i.test(command);
  const deletion = /\b(?:rm|rmdir|rd|Remove-Item|del|erase)\b|(?:\.|::)Delete\s*\(/i.test(command);
  const setup = /\b(?:mklink|ln\s+-\S*s|New-Item\b[^\n]*\b(?:Junction|SymbolicLink)|npm\s+(?:install|ci)|git\b[^\n]*\bworktree\s+add)\b/i.test(command);
  if (!worktreeRemove && !deletion && !setup) return null;
  if (worktreeRemove) return `Direct git worktree remove is refused: it can follow dependency junctions. ${route}`;
  let root, owned;
  try {
    root = git(cwd, ["rev-parse", "--show-toplevel"]);
    const marker = path.join(git(cwd, ["rev-parse", "--absolute-git-dir"]), "filer-owner.json");
    owned = fs.existsSync(marker);
  } catch { return null; } // Outside a repository is outside this repository policy.
  if (owned) return `Direct ${deletion ? "deletion" : "worktree/dependency setup"} in an owned filing checkout is refused, including ambiguous targets. Use the checked filer-worktree lifecycle. ${route}`;
  // Literal paths only. Expressions, aliases and indirect code are not parsed.
  // All such deletion forms are refused once inside an owned filer checkout.
  const candidates = [...command.matchAll(/"([^"\n]+)"|'([^'\n]+)'|([^\s;|&()]+)/g)].map(m => m[1] ?? m[2] ?? m[3]).filter(s => !s.startsWith("-") && !/[`$]/.test(s));
  let list;
  try { list = git(cwd, ["worktree", "list", "--porcelain"]).split(/\r?\n/).filter(line => line.startsWith("worktree ")).map(line => line.slice(9)); }
  catch (error) { return `Cleanup ownership cannot be checked: ${error.message}. ${route}`; }
  for (const candidate of candidates) {
    const target = path.resolve(cwd, candidate);
    try {
      const containing = list.find(tree => under(target, tree));
      if (containing) {
        const ownership = path.join(git(containing, ["rev-parse", "--absolute-git-dir"]), "filer-owner.json");
        if (fs.existsSync(ownership)) return `Direct setup or cleanup targeting owned filing tree ${containing} is refused. ${route}`;
      }
      if (!fs.existsSync(target)) continue;
      const physical = fs.realpathSync(target);
      if (under(target, root) && !under(physical, root)) return `External cleanup target refused: ${target} -> ${physical}. ${route}`;
      // Never scan unrelated directories. A literal registered checkout target
      // is inspected, including the tree's links, before a direct deletion.
      if (containing) {
        if (!deletion) continue;
        if (!under(physical, containing)) return `External cleanup target refused: ${target} -> ${physical}. ${route}`;
        const reason = links(target, containing); if (reason) return reason;
      }
    } catch (error) { return `Cleanup target identity cannot be checked: ${target}: ${error.message}. ${route}`; }
  }
  return null;
}
export async function main() {
  let raw = ""; for await (const chunk of process.stdin) raw += chunk;
  const event = JSON.parse(raw), input = event.tool_input;
  const reason = decide(input?.command, String(event.tool_name).toLowerCase(), event.cwd ?? process.env.CLAUDE_PROJECT_DIR);
  if (reason) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } }));
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href.toLowerCase() === import.meta.url.toLowerCase()) main().catch(error => { console.error(error); process.exitCode = 2; });
