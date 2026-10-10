import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { baseName, isShellCommandString, programBefore, readCommand } from "./typed-issue-hook.mjs";

const route = "Use node scripts/filer-worktree.mjs remove --record <absolute-owner.json> --owner <filing-session> for owned filing trees, or the guarded clean-worktrees --remove route for other trees.";
function hasAncestorMetadata(cwd) {
  // Git can silently skip incomplete metadata (for example a missing HEAD).
  // Absence of a recognized repository is not absence of ownership evidence.
  for (const start of new Set([path.resolve(cwd), fs.realpathSync.native(cwd)])) {
    let count = 0;
    for (let at = start; ; at = path.dirname(at)) {
      if (++count > 512) throw new Error("Repository ancestor identity exceeds its supported bound");
      try { fs.lstatSync(path.join(at, ".git")); return true; }
      catch (error) { if (error.code !== "ENOENT") throw error; }
      if (at === path.dirname(at)) break;
    }
  }
  return false;
}
function git(cwd, args) {
  // Discovery concerns this cwd's repository. Inherited Git overrides can
  // redirect or hide it; locale aliases can translate the diagnostic below.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key) && !/^(?:LC_ALL|LANG|LANGUAGE)$/i.test(key)));
  Object.assign(env, { LC_ALL: "C", LANG: "C", LANGUAGE: "C" });
  const r = spawnSync("git", args, { cwd, env, encoding: "utf8", windowsHide: true, timeout: 2000 });
  if (r.error || r.status !== 0) {
    const error = new Error(r.error?.message ?? r.stderr);
    error.outsideRepository = !r.error && r.status === 128 && /^fatal: not a git repository \(or any of the parent directories\): \.git\s*$/.test(r.stderr) && !hasAncestorMetadata(cwd);
    throw error;
  }
  return r.stdout.trim();
}
const under = (p, root) => { const r = path.relative(root, p); return r === "" || (r !== ".." && !r.startsWith(`..${path.sep}`) && !path.isAbsolute(r)); };
const real = p => fs.realpathSync.native(p);
// path.resolve would erase link/.. before filesystem identity can inspect it.
const absoluteLiteral = (cwd, target) => path.isAbsolute(target) ? target : `${cwd}${path.sep}${target}`;
const hasParentComponent = target => target.split(process.platform === "win32" ? /[\/\\]/ : /\//).includes("..");
const sourceCheckout = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
function exists(p) { try { fs.lstatSync(p); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; } }
function owned(tree) { return exists(path.join(git(tree, ["rev-parse", "--absolute-git-dir"]), "filer-owner.json")); }
function identity(target) {
  let nearest = null;
  const traversals = [];
  const visitedLinks = new Set();
  const inspectAncestors = (candidate, initial = false) => {
    for (let at = candidate; ; at = path.dirname(at)) {
      try {
        const stat = fs.lstatSync(at);
        if (stat.isSymbolicLink()) {
          const key = process.platform === "win32" ? at.toLowerCase() : at;
          if (!visitedLinks.has(key)) {
            if (visitedLinks.size >= 64) throw new Error("Cleanup link-chain identity exceeds its supported bound");
            visitedLinks.add(key);
            traversals.push({ link: at, target: real(at), source: path.join(real(path.dirname(at)), path.basename(at)) });
            // realpath collapses A -> T/node_modules -> E into E. Inspect the
            // raw destination too, so the intermediate registered T survives.
            inspectAncestors(absoluteLiteral(path.dirname(at), fs.readlinkSync(at)));
          }
        }
        if (initial && !nearest) nearest = at;
      } catch (error) { if (error.code !== "ENOENT") throw error; }
      if (at === path.dirname(at)) break;
    }
  };
  // Inspect every lexical ancestor before resolving the final target: a path
  // may enter owned T through A, then leave T through T/node_modules into E.
  inspectAncestors(target, true);
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
const singleBashLiteral = /^(?:'[^']*'|"(?:[^"$`\\]|\\[^\r\n])*")$/;
const canonicalCmdlets = new Set(["remove-item", "set-location", "push-location", "pop-location", "new-item"]);
const shellPrograms = new Set(["bash", "sh", "zsh", "dash", "ksh", "ash", "busybox", "pwsh", "powershell", "cmd", "env", "eval"]);
// These are refusal boundaries for the existing reader's wrapper traversal;
// this policy does not implement another wrapper argument parser.
const wrappers = new Set(["sudo", "doas", "env", "xargs", "time", "timeout", "nice", "stdbuf", "npx", "nohup", "command", "builtin", "exec", "winpty"]);
// Preserve fish's existing raw-name uncertainty refusal without claiming that
// the established shell-string reader analyzes fish child scripts.
const supportedPrograms = new Set([...shellPrograms, ...wrappers, ...canonicalCmdlets, "fish", "rm", "rmdir", "rd", "del", "erase", "cd", "pushd", "popd", "git", "npm", "ln", "mklink"]);
const npmValueOptions = new Set(["--prefix", "-C", "--workspace", "-w", "--registry", "--cache", "--userconfig", "--globalconfig", "--loglevel"]);
const npmDestinationOptions = new Set(["--prefix", "-C", "--workspace", "-w"]);
const npmBooleanOptions = new Set(["--global", "-g", "--silent", "-s", "--yes", "-y", "--no-audit", "--no-fund", "--ignore-scripts"]);
// Explicit install/ci aliases reported by the installed npm CLI. This is not
// npm's general abbreviation resolver or recognition of arbitrary scripts.
const npmSetupSelectors = new Set(["install", "add", "i", "in", "ins", "inst", "insta", "instal", "isnt", "isnta", "isntal", "isntall", "ci", "clean-install", "ic", "install-clean", "isntall-clean"]);
const rawCandidate = (token, command) => token ? command.slice(token.start, token.end).replace(/["']/g, "").replace(/\\(.)/g, "$1") : "";
const encodedLiteral = (token, command) => token && /\$['"]/.test(command.slice(token.start, token.end));
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
    } else {
      const raw = command.slice(token.start, token.end);
      if (token.quoted && !singleBashLiteral.test(raw)) values.error = "Combined or escaped Bash cleanup/setup literal cannot be verified";
      if (!token.quoted && /\\[^ "'\\$`]/.test(raw)) values.error = "Bash cleanup/setup escape cannot be verified";
      if (!token.quoted && /^~|[{}]/.test(text)) values.error = "Shell-expanded cleanup/setup target cannot be verified";
    }
    values.push(text);
  }
  return values;
}
function npmSetupTargets(args, shell, command) {
  const targets = [];
  for (let at = 0; at < args.length; at++) {
    const token = args[at], equal = token.text.indexOf("="), flag = equal < 0 ? token.text : token.text.slice(0, equal);
    let values;
    if (npmDestinationOptions.has(flag)) {
      if (equal < 0) {
        const next = args[++at];
        if (!next || next.text.startsWith("-")) { targets.error = "npm setup destination is missing or cannot be verified"; continue; }
        values = literalArguments([next], shell, command);
      } else {
        const raw = command.slice(token.start, token.end), prefix = `${flag}=`;
        if (raw.startsWith(prefix)) {
          // Verify the value's original spelling, not a candidate assembled
          // from discarded option text. Ordinary inline quoting is supported.
          const valueRaw = raw.slice(prefix.length);
          values = literalArguments([{ ...token, text: token.text.slice(equal + 1), start: token.start + prefix.length, quoted: /^["']/.test(valueRaw) }], shell, command);
        } else {
          const whole = literalArguments([token], shell, command);
          values = [whole[0]?.slice(equal + 1)];
          if (whole.error) values.error = whole.error;
        }
      }
      if (!values[0] || values[0].startsWith("-")) values.error = "npm setup destination is missing or cannot be verified";
    } else values = literalArguments([token], shell, command);
    if (values.error) targets.error = values.error;
    targets.push(...values.filter(value => typeof value === "string"));
  }
  return targets;
}
// Reuse the established tokenizer; quoted prose/comments are not commands.
// Indirect runtimes and computed paths outside known repositories remain outside
// coverage. Literal location changes and shell command strings are recognized.
function operations(command, shell, cwd, depth = 0, locationState = null) {
  if (depth > 3) return [{ kind: "analysis-limit", cwd, cwds: locationState?.cwds ?? [cwd], targets: Object.assign([], { error: "Supported cleanup/setup analysis nesting exceeded" }) }];
  const { segments, subs } = readCommand(command, shell), found = [];
  const possibleCwds = new Set(locationState?.cwds ?? [cwd]), substitutionOps = [];
  let locationError = locationState?.error ?? null, childLocationError = null, hasLocation = false;
  const addCwd = next => {
    if (possibleCwds.size >= 8 && !possibleCwds.has(next)) locationError = "Possible location states exceed the supported bound";
    else possibleCwds.add(next);
  };
  const emit = op => found.push({ ...op, cwd, cwds: [...possibleCwds], locationError: locationError ?? childLocationError });
  for (const sub of subs) {
    const nested = operations(sub, shell, cwd, depth + 1, { cwds: [...possibleCwds], error: locationError });
    found.push(...nested);
    substitutionOps.push(...nested);
    if (nested.hasLocation) { hasLocation = true; locationError = "Nested location flow cannot be verified"; }
  }
  const locationStack = [];
  for (const { tokens, positions } of segments) {
    childLocationError = null;
    // Let the existing shell-string recognizer inspect verified quoted shell
    // names. Quoted command wrappers refuse independently below.
    const recognitionTokens = tokens.map((token, i) => shell === "bash" && positions.has(i) && token.quoted && shellPrograms.has(baseName(token)) && !literalArguments([token], shell, command).error ? { ...token, quoted: false } : token);
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i], name = baseName(token);
      if (isShellCommandString(recognitionTokens, i, positions)) {
        const literal = literalArguments([token], shell, command);
        if (literal.error) { emit({ kind: "analysis-limit", targets: literal }); continue; }
        const before = programBefore(recognitionTokens, i - 1);
        const innerShell = before >= 0 && /^(pwsh|powershell)$/.test(baseName(tokens[before])) ? "powershell" : "bash";
        found.push(...operations(token.text, innerShell, cwd, depth + 1, { cwds: [...possibleCwds], error: locationError ?? childLocationError }));
      }
      const method = !token.quoted && /(?:\.|::)Delete$/i.test(token.text) && command.slice(token.end).trimStart().startsWith("(");
      if (method) {
        const methodTokens = segments.flatMap(segment => segment.tokens).filter(t => t.quoted || (t.text.includes("$") && !/^\$(true|false)$/i.test(t.text))).map(t => command.slice(t.start, t.end).endsWith(",") ? { ...t, text: t.text.replace(/,$/, "") } : t);
        const targets = literalArguments(methodTokens, shell, command);
        if (!targets.length) targets.error = "Delete method target cannot be verified";
        emit({ kind: "delete", targets });
      }
      if (!positions.has(i)) continue;
      if (shell === "bash") {
        if (encodedLiteral(token, command)) {
          emit({ kind: "analysis-limit", targets: Object.assign([], { error: "Encoded command literal cannot be verified" }) });
          continue;
        }
        const literal = literalArguments([token], shell, command);
        // This candidate is only a refusal trigger, never a trusted decoded
        // command or pathname. Unsupported computed commands remain excluded.
        const candidate = baseName({ text: rawCandidate(token, command) });
        if (literal.error && supportedPrograms.has(candidate)) {
          emit({ kind: "analysis-limit", targets: Object.assign([], { error: "Cleanup/setup command literal cannot be verified" }) });
          continue;
        }
        if (token.quoted && wrappers.has(name)) {
          emit({ kind: "analysis-limit", targets: Object.assign([], { error: "Quoted wrapper child traversal cannot be verified" }) });
          continue;
        }
      }
      const args = tokens.slice(i + 1);
      const argumentShell = canonicalCmdlets.has(name) ? "powershell" : shell;
      const targets = literalArguments(args, argumentShell, command);
      const childPosition = [...positions].find(position => position > i) ?? tokens.length;
      if (shell === "bash" && (shellPrograms.has(name) || wrappers.has(name) || name === "ln") && args.some((arg, at) => encodedLiteral(arg, command) && i + at + 1 < childPosition && !isShellCommandString(recognitionTokens, i + at + 1, positions))) {
        emit({ kind: "analysis-limit", targets: Object.assign([], { error: "Encoded shell or setup selector literal cannot be verified" }) });
      }
      if (shellPrograms.has(name) && args.some(arg => {
        const candidate = rawCandidate(arg, command).toLowerCase();
        return literalArguments([arg], shell, command).error && (name === "env" ? /^(?:-s|--split-string)$/.test(candidate) : /^(?:\/c|-c|-comm\w*|-[a-z]*c[a-z]*)$/.test(candidate));
      })) emit({ kind: "analysis-limit", targets: Object.assign([], { error: "Shell command-string selector cannot be verified" }) });
      if (["env", "sudo"].includes(name) && args.some(arg => {
        const text = shell === "bash" ? rawCandidate(arg, command) : arg.text;
        return /^--chdir(?:=|$)/.test(text) || (name === "env" ? /^-C/.test(text) : /^-D/.test(text));
      })) childLocationError = "Wrapper child location cannot be verified";
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
        const allowedFlag = argumentShell === "powershell" ? /^-(?:path|literalpath)(?::|$)|^-passthru$/i : name === "cd" ? /^(?:--|-L|-P)$/ : /$^/;
        if (args.some(t => t.text.startsWith("-") && !allowedFlag.test(t.text))) locationError = "Location options cannot be verified";
        if (!target || /[`$*?\[]/.test(target)) locationError = "Effective location cannot be verified";
        if (target && !locationError) {
          const prior = [...possibleCwds];
          if (["pushd", "push-location"].includes(name)) locationStack.push(prior);
          for (const possible of prior) {
            const next = absoluteLiteral(possible, target);
            try {
              const id = identity(next);
              if (!fs.statSync(next).isDirectory()) throw new Error("not a directory");
              // Shell logical/physical cd modes can disagree after link/..
              // traversal. Retain uncertainty for relative child mutations.
              if (hasParentComponent(next) && id.traversals.length) throw new Error("linked parent location");
              addCwd(id.physical);
            }
            catch { locationError = `Literal location cannot be verified: ${next}`; }
          }
        }
        continue;
      }
      if (["rm", "rmdir", "rd", "remove-item", "del", "erase"].includes(name)) emit({ kind: "delete", targets });
      if (name === "git") {
        let k = 0;
        while (args[k]?.text.startsWith("-")) { const value = args[k].text; k += gitValueOptions.has(value) ? 2 : 1; }
        if (shell === "bash" && (encodedLiteral(args[k], command) || (args[k]?.text.toLowerCase() === "worktree" && encodedLiteral(args[k + 1], command)))) emit({ kind: "analysis-limit", targets: Object.assign([], { error: "Encoded Git operation selector literal cannot be verified" }) });
        else if (args[k]?.text.toLowerCase() === "worktree" && ["remove", "add"].includes(args[k + 1]?.text.toLowerCase())) emit({ kind: args[k + 1].text.toLowerCase() === "remove" ? "remove" : "setup", targets });
        else if (shell === "bash") {
          const candidates = args.map(arg => literalArguments([arg], shell, command).error ? rawCandidate(arg, command) : arg.text);
          let at = 0;
          while (candidates[at]?.startsWith("-")) { const value = candidates[at]; at += gitValueOptions.has(value) ? 2 : 1; }
          if (encodedLiteral(args[at], command) || (candidates[at]?.toLowerCase() === "worktree" && encodedLiteral(args[at + 1], command))) {
            emit({ kind: "analysis-limit", targets: Object.assign([], { error: "Encoded Git operation selector literal cannot be verified" }) });
          } else if (candidates[at]?.toLowerCase() === "worktree" && ["remove", "add"].includes(candidates[at + 1]?.toLowerCase())) {
            emit({ kind: "analysis-limit", targets: Object.assign([], { error: "Git worktree operation selector cannot be verified" }) });
          }
        }
      }
      if (name === "npm") {
        let at = 0, uncertain = false;
        const candidates = args.map(arg => shell === "bash" && literalArguments([arg], shell, command).error ? rawCandidate(arg, command) : arg.text);
        while (candidates[at]?.startsWith("-")) {
          const value = candidates[at], flag = value.split("=")[0];
          if (npmValueOptions.has(flag)) at += value.includes("=") ? 1 : 2;
          else { if (!npmBooleanOptions.has(flag)) uncertain = true; at++; }
        }
        if (shell === "bash" && (encodedLiteral(args[at], command) || (uncertain && args.slice(at).some(arg => encodedLiteral(arg, command))))) emit({ kind: "analysis-limit", targets: Object.assign([], { error: "Encoded npm operation selector literal cannot be verified" }) });
        else if (npmSetupSelectors.has(candidates[at]?.toLowerCase()) || (uncertain && candidates.slice(at).some(text => npmSetupSelectors.has(text.toLowerCase())))) {
          if (uncertain || args[at]?.text !== candidates[at]) emit({ kind: "analysis-limit", targets: Object.assign([], { error: "npm setup operation selector cannot be verified" }) });
          else emit({ kind: "setup", targets: npmSetupTargets(args, argumentShell, command) });
        }
      }
      if (name === "mklink" || (name === "ln" && args.some(t => /^-.*s/.test(t.text))) || (name === "new-item" && targets.some(text => /^(junction|symboliclink)$/i.test(text)))) emit({ kind: "setup", targets });
    }
  }
  // The tokenizer collects substitutions without their execution positions.
  // A location transition elsewhere in this command cannot give their relative
  // mutations an invented known cwd; verified absolute operands stay independent.
  if (hasLocation) for (const op of substitutionOps) op.locationError ??= "Substitution execution location cannot be verified";
  found.hasLocation = hasLocation;
  return found;
}
function inspectAt(op) {
  if (op.kind === "remove") return `Direct git worktree remove is refused: it can follow dependency junctions. ${route}`;
  let roots, registryCwd = op.contextKnown ? op.registryCwd : op.cwd, fromRepository = true;
  try { git(registryCwd, ["rev-parse", "--show-toplevel"]); }
  catch (error) {
    if (!error.outsideRepository) return `Cleanup repository discovery cannot be checked: ${error.message}. ${route}`;
    registryCwd = sourceCheckout; fromRepository = false;
  }
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
    const target = absoluteLiteral(op.cwd, candidate);
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
    return decide(command, "bash", cwd) ?? decide(command, "powershell", cwd);
  }
  const ops = operations(command, shell, cwd);
  if (ops.length) {
    try {
      const top = real(git(cwd, ["rev-parse", "--show-toplevel"]));
      for (const op of ops) { op.contextKnown = true; op.registryCwd = cwd; }
      if (owned(top)) return `Direct setup/cleanup from an owned filing context is refused, including changed or ambiguous locations. ${route}`;
    }
    catch (error) {
      if (!error.outsideRepository) return `Cleanup repository discovery cannot be checked: ${error.message}. ${route}`;
      /* inspect each operation's explicit location below */
    }
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
