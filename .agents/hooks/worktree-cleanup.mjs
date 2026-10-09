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
const singlePowerShellLiteral = /^(?:'(?:[^']|'')*'|"[^"$`]*")$/;
function literalArguments(tokens, shell, command) {
  const values = [];
  for (const token of tokens) {
    let text = token.text;
    if (shell === "powershell") {
      const raw = command.slice(token.start, token.end).trim().replace(/,$/, "");
      const rawValue = raw.replace(/^-[A-Za-z][\w-]*:/, "");
      if (raw.startsWith("-")) text = text.replace(/^-[A-Za-z][\w-]*:/, "");
      if (!token.quoted && (text.startsWith("@") || /[‘’“”]/.test(text))) values.error = "Splat or shell quote syntax cannot be verified";
      if (token.quoted && /^["']/.test(rawValue) && !singlePowerShellLiteral.test(rawValue)) values.error = "Combined cleanup/setup literals cannot be verified";
      if (!token.quoted && text.includes(",")) values.error = "Multiple cleanup/setup targets cannot be verified";
      if (token.group || /^@?\(/.test(text)) {
        const inner = text.replace(/^@?\(/, "").replace(/\)$/, "").trim();
        const { segments } = readCommand(inner, "powershell"), literal = segments[0]?.tokens[0];
        if (!/^@?\([\s\S]*\)$/.test(text) || segments.length !== 1 || segments[0].tokens.length !== 1 || !literal.quoted || literal.group || literal.start !== 0 || literal.end !== inner.length || !singlePowerShellLiteral.test(inner) || /[`$]/.test(inner)) {
          values.error = "Grouped cleanup/setup argument is not a verified single literal";
        } else text = literal.text;
      }
      const provider = /^(?:Microsoft\.PowerShell\.Core\\)?FileSystem::/i;
      if (provider.test(text)) {
        text = text.replace(provider, "");
        if (!path.isAbsolute(text)) values.error = "Provider-qualified path is not absolute";
      } else if (/^[\w.\\]+::/.test(text) || (/^[A-Za-z][\w]*:/.test(text) && !/^[A-Za-z]:[\/\\]/.test(text))) {
        values.error = "Cleanup/setup drive or provider identity cannot be verified";
      }
    } else if (!token.quoted && /^~|[{}]/.test(text)) {
      values.error = "Shell-expanded cleanup/setup target cannot be verified";
    }
    values.push(text);
  }
  return values;
}
// Reuse the established tokenizer; quoted prose/comments are not commands.
// Indirect runtimes and computed paths outside known repositories remain outside
// coverage. Literal location changes and shell command strings are recognized.
function operations(command, shell, cwd, depth = 0) {
  if (depth > 3) return [];
  const { segments, subs } = readCommand(command, shell), found = [];
  const possibleCwds = new Set([cwd]);
  let locationError = null, hasLocation = false;
  const addCwd = next => {
    if (possibleCwds.size >= 8 && !possibleCwds.has(next)) locationError = "Possible location states exceed the supported bound";
    else possibleCwds.add(next);
  };
  const emit = op => found.push({ ...op, cwd, cwds: [...possibleCwds], locationError });
  for (const sub of subs) {
    const nested = operations(sub, shell, cwd, depth + 1);
    found.push(...nested);
    if (nested.hasLocation) { hasLocation = true; locationError = "Nested location flow cannot be verified"; }
  }
  const locationStack = [];
  for (const { tokens, positions } of segments) {
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i], name = baseName(token);
      if (token.quoted && isShellCommandString(tokens, i, positions)) {
        const before = programBefore(tokens, i - 1);
        const innerShell = before >= 0 && /^(pwsh|powershell)$/.test(baseName(tokens[before])) ? "powershell" : "bash";
        for (const possible of possibleCwds) found.push(...operations(token.text, innerShell, possible, depth + 1));
      }
      const method = !token.quoted && /(?:\.|::)Delete$/i.test(token.text) && command.slice(token.end).trimStart().startsWith("(");
      if (method) {
        const methodTokens = segments.flatMap(segment => segment.tokens).filter(t => t.quoted || (t.text.includes("$") && !/^\$(true|false)$/i.test(t.text))).map(t => command.slice(t.start, t.end).endsWith(",") ? { ...t, text: t.text.replace(/,$/, "") } : t);
        const targets = literalArguments(methodTokens, shell, command);
        if (!targets.length) targets.error = "Delete method target cannot be verified";
        emit({ kind: "delete", targets });
      }
      if (!positions.has(i)) continue;
      const args = tokens.slice(i + 1);
      const targets = literalArguments(args, shell, command);
      if (["popd", "pop-location"].includes(name)) {
        hasLocation = true;
        if (locationStack.length) for (const previous of locationStack.pop()) addCwd(previous);
        // A preceding push could fail or be skipped; never assume the shell's
        // pre-existing stack is known merely because a push appears in text.
        locationError = "Location stack restore cannot be verified";
        continue;
      }
      if (["cd", "set-location", "pushd", "push-location"].includes(name)) {
        hasLocation = true;
        const operands = targets.filter(text => !text.startsWith("-")), target = operands[0];
        if (operands.length !== 1) locationError = "Location argument cardinality cannot be verified";
        if (targets.error || args.some(t => /^-stackname(?::|$)/i.test(t.text))) locationError = targets.error ?? "Named location stack cannot be verified";
        const allowedFlag = shell === "powershell" ? /^-(?:path|literalpath)(?::|$)|^-passthru$/i : name === "cd" ? /^(?:--|-L|-P)$/ : /$^/;
        if (args.some(t => t.text.startsWith("-") && !allowedFlag.test(t.text))) locationError = "Location options cannot be verified";
        if (!target || /[`$*?\[]/.test(target)) locationError = "Effective location cannot be verified";
        if (target && !locationError) {
          const prior = [...possibleCwds];
          if (["pushd", "push-location"].includes(name)) locationStack.push(prior);
          for (const possible of prior) {
            const next = path.resolve(possible, target);
            try { if (!fs.statSync(next).isDirectory()) throw new Error("not a directory"); addCwd(next); }
            catch { locationError = `Literal location cannot be verified: ${next}`; }
          }
        }
        continue;
      }
      if (["rm", "rmdir", "rd", "remove-item", "del", "erase"].includes(name)) emit({ kind: "delete", targets });
      if (name === "git") {
        let k = 0;
        while (args[k]?.text.startsWith("-")) { const value = args[k].text; k += gitValueOptions.has(value) ? 2 : 1; }
        if (args[k]?.text.toLowerCase() === "worktree" && ["remove", "add"].includes(args[k + 1]?.text.toLowerCase())) emit({ kind: args[k + 1].text.toLowerCase() === "remove" ? "remove" : "setup", targets });
      }
      if (name === "mklink" || (name === "ln" && args.some(t => /^-.*s/.test(t.text))) || (name === "new-item" && targets.some(text => /^(junction|symboliclink)$/i.test(text))) || (name === "npm" && targets.some(text => /^(install|ci)$/i.test(text)))) emit({ kind: "setup", targets });
    }
  }
  found.hasLocation = hasLocation;
  return found;
}
function inspectAt(op) {
  if (op.kind === "remove") return `Direct git worktree remove is refused: it can follow dependency junctions. ${route}`;
  let roots, registryCwd = op.contextKnown ? op.registryCwd : op.cwd, fromRepository = true;
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
  if (op.targets.error || op.locationError) return (fromRepository || op.contextKnown) ? `${op.targets.error ?? op.locationError}; direct operation is refused. ${route}` : null;
  if ((fromRepository || op.contextKnown) && op.targets.some(text => !text.startsWith("-") && /[`$*?\[]/.test(text))) return `Cleanup/setup target syntax cannot be verified in this repository. ${route}`;
  const candidates = op.targets.filter(s => !s.startsWith("-") && !/[`$]/.test(s));
  if (op.kind === "delete" && !candidates.length && (fromRepository || op.contextKnown)) return `Cleanup target is missing or cannot be verified. ${route}`;
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
function inspect(op) {
  const relative = op.kind === "setup" || op.targets.some(text => !text.startsWith("-") && !path.isAbsolute(text));
  for (const cwd of relative ? op.cwds : [op.cwd]) {
    const reason = inspectAt({ ...op, cwd, locationError: relative ? op.locationError : null });
    if (reason) return reason;
  }
  return null;
}
export function decide(command, shell, cwd = process.cwd()) {
  if (typeof command !== "string") return null;
  if (!["bash", "powershell"].includes(shell)) {
    const { segments } = readCommand(command, "powershell");
    const cmdlets = new Set(["remove-item", "set-location", "push-location", "pop-location", "new-item"]);
    if (segments.some(({ tokens, positions }) => tokens.some((token, i) => positions.has(i) && cmdlets.has(baseName(token))))) return decide(command, "powershell", cwd);
    return decide(command, "bash", cwd) ?? decide(command, "powershell", cwd);
  }
  const ops = operations(command, shell, cwd);
  if (ops.length) {
    try {
      const top = real(git(cwd, ["rev-parse", "--show-toplevel"]));
      for (const op of ops) { op.contextKnown = true; op.registryCwd = cwd; }
      if (owned(top)) return `Direct setup/cleanup from an owned filing context is refused, including changed or ambiguous locations. ${route}`;
    }
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
