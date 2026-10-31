import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { baseName, isShellCommandString, programBefore, readCommand } from "./typed-issue-hook.mjs";

const route = "Use node scripts/filer-worktree.mjs remove --record <absolute-owner.json> --owner <filing-session> for owned filing trees, or the guarded clean-worktrees --remove route for other trees.";
const literalCleanupRoute = "For scratch cleanup, replace variables or expansions with a quoted absolute literal target and retry the identity checks. Single-file forms: rm -f -- '/absolute/scratch/file.log' (Bash), or Remove-Item -LiteralPath 'C:/absolute/scratch/file.log' -Force (PowerShell). A temporary location does not exempt repositories, worktrees, ownership or links from protection. " + route;
const setupRoute = "For an ordinary writer worktree, use direct Git Bash: cd \"C:/absolute/worktree\" && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install; or direct PowerShell: Set-Location 'C:/absolute/worktree'; $env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD='1'; npm install. To create it, use direct PowerShell: git worktree add -b fix/N-slug 'C:/absolute/worktree' origin/main. Use literal paths; do not wrap these commands in cmd /c.";
function hasAncestorMetadata(cwd) {
  // workaround(git): discovery silently skips incomplete repository metadata (e.g. a missing HEAD) and reports not a git repository
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
const absoluteLiteral = (cwd, target) => path.isAbsolute(target) ? target : `${cwd}${path.sep}${target}`;
const volumeLessRooted = target => process.platform === "win32" && typeof target === "string" && path.isAbsolute(target) && path.parse(target).root.length === 1;
const hasParentComponent = target => target.split(process.platform === "win32" ? /[\/\\]/ : /\//).includes("..");
const sourceCheckout = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
function exists(p) { try { fs.lstatSync(p); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; } }
function owned(tree) { return exists(path.join(git(tree, ["rev-parse", "--absolute-git-dir"]), "filer-owner.json")); }
function entrySpelling(candidate) {
  const rootLength = path.parse(candidate).root.length;
  const separator = process.platform === "win32" ? /[\/\\]/ : /\//;
  let end = candidate.length;
  while (end > rootLength && separator.test(candidate[end - 1])) end--;
  return candidate.slice(0, end);
}
function identity(target) {
  let nearest = null;
  const traversals = [];
  const visitedLinks = new Set();
  const inspectAncestors = (candidate, initial = false) => {
    for (let at = entrySpelling(candidate); ; at = entrySpelling(path.dirname(at))) {
      try {
        const stat = fs.lstatSync(at);
        if (stat.isSymbolicLink()) {
          const key = process.platform === "win32" ? at.toLowerCase() : at;
          if (!visitedLinks.has(key)) {
            if (visitedLinks.size >= 64) throw new Error("Cleanup link-chain identity exceeds its supported bound");
            visitedLinks.add(key);
            traversals.push({ link: at, target: real(at), source: path.join(real(path.dirname(at)), path.basename(at)) });
            inspectAncestors(absoluteLiteral(path.dirname(at), fs.readlinkSync(at)));
          }
        }
        if (initial && !nearest) nearest = at;
      } catch (error) { if (error.code !== "ENOENT") throw error; }
      if (at === entrySpelling(path.dirname(at))) break;
    }
  };
  inspectAncestors(target, true);
  if (!nearest) throw new Error("No readable existing path ancestor");
  return { physical: path.resolve(real(nearest), path.relative(nearest, target)), traversals };
}
function links(p, budget = { deadline: Date.now() + 500, count: 0 }) {
  if (++budget.count > 10000 || Date.now() > budget.deadline) return `Direct cleanup inspection exceeded its bounded check. ${route}`;
  const stat = fs.lstatSync(p);
  if (stat.isSymbolicLink()) return `Linked cleanup entry refused: ${p} -> ${real(p)}. ${route}`;
  if (stat.isDirectory()) for (const name of fs.readdirSync(p)) { const reason = links(path.join(p, name), budget); if (reason) return reason; }
  return null;
}
const gitValueOptions = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--super-prefix", "--config-env", "--attr-source"]);
const singlePowerShellLiteral = /^(?:'(?:[^']|'')*'|"[^"$`]*")$/;
const singleBashLiteral = /^(?:'[^']*'|"(?:[^"$`\\]|\\[^\r\n])*")$/;
const canonicalCmdlets = new Set(["remove-item", "set-location", "push-location", "pop-location", "new-item"]);
const powerShellAliases = new Map([
  ...["del", "erase", "rd", "ri", "rm", "rmdir"].map(name => [name, "remove-item"]),
  ...["cd", "chdir", "sl"].map(name => [name, "set-location"]),
  ["ni", "new-item"], ["pushd", "push-location"], ["popd", "pop-location"],
]);
const commandName = (name, shell) => shell === "powershell" ? powerShellAliases.get(name) ?? name : name;
const shellPrograms = new Set(["bash", "sh", "zsh", "dash", "ksh", "ash", "busybox", "pwsh", "powershell", "cmd", "env", "eval"]);
const wrappers = new Set(["sudo", "doas", "env", "xargs", "time", "timeout", "nice", "stdbuf", "npx", "nohup", "command", "builtin", "exec", "winpty"]);
const supportedPrograms = new Set([...shellPrograms, ...wrappers, ...canonicalCmdlets, "fish", "rm", "rmdir", "rd", "del", "erase", "cd", "pushd", "popd", "git", "npm", "ln", "mklink"]);
const npmValueOptions = new Set(["--prefix", "-C", "--workspace", "-w", "--registry", "--cache", "--userconfig", "--globalconfig", "--loglevel"]);
const npmDestinationOptions = new Set(["--prefix", "-C", "--workspace", "-w"]);
const npmBooleanOptions = new Set(["--global", "-g", "--silent", "-s", "--yes", "-y", "--no-audit", "--no-fund", "--ignore-scripts"]);
const npmSetupSelectors = new Set(["install", "add", "i", "in", "ins", "inst", "insta", "instal", "isnt", "isnta", "isntal", "isntall", "ci", "clean-install", "ic", "install-clean", "isntall-clean"]);
const rawCandidate = (token, command) => token ? command.slice(token.start, token.end).replace(/["']/g, "").replace(/\\(.)/g, "$1") : "";
const encodedLiteral = (token, command) => token && /\$['"]/.test(command.slice(token.start, token.end));
function literalArguments(tokens, shell, command) {
  const values = [];
  for (const token of tokens) {
    let text = token.text;
    if (shell === "powershell") {
      const raw = command.slice(token.start, token.end).trim().replace(/,$/, "");
      const rawValue = raw.replace(/^[-\u2013\u2014\u2015][A-Za-z][\w-]*:/, "");
      if (powerShellParameter(token, command)) text = text.replace(/^[-\u2013\u2014\u2015][A-Za-z][\w-]*:/, "");
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
    values.push(process.platform === "win32" && shell === "bash" ? text.replace(/^\/([a-z])\//i, (_, drive) => `${drive.toUpperCase()}:/`) : text);
  }
  return values;
}
const powerShellParameter = (token, command) => /^[-\u2013\u2014\u2015]/.test(command.slice(token.start, token.end));
const powerShellFlag = token => token.text.replace(/^[-\u2013\u2014\u2015]/, "-");
function pathArguments(args, shell, command) {
  const values = literalArguments(args, shell, command), paths = [];
  paths.pathOperands = true; paths.options = [];
  if (values.error) paths.error = values.error;
  let ended = false;
  for (let at = 0; at < args.length; at++) {
    const token = args[at], value = values[at], parameter = shell === "powershell" && powerShellParameter(token, command);
    const flag = parameter ? powerShellFlag(token) : token.text;
    if (ended) { paths.push(value); continue; }
    if (token.text === "--" && (shell === "bash" || !token.quoted)) { ended = true; paths.options.push("--"); continue; }
    if (parameter && /^-(?:literalpath|path)(?::|$)/i.test(flag)) {
      paths.options.push(flag);
      if (token.text.includes(":")) paths.push(value);
      else {
        const next = args[++at];
        if (!next || powerShellParameter(next, command)) paths.error = "Path parameter operand cannot be verified";
        else paths.push(values[at]);
      }
      continue;
    }
    if (parameter && /^-(?:p|pa|pat|l|li|lit|lite|liter|litera|literal|literalp|literalpa|literalpat)(?::|$)/i.test(flag)) { paths.error = "Abbreviated path parameter cannot be verified"; continue; }
    if (shell === "powershell" ? parameter : value.startsWith("-")) {
      paths.options.push(flag);
      continue;
    }
    if (parameter && /^-[\w-]+:/.test(flag)) { paths.error = "Path parameter role cannot be verified"; continue; }
    paths.push(value);
  }
  return paths;
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
function setupArguments(args, shell, command) {
  const operands = [], redirects = [];
  for (let at = 0; at < args.length; at++) {
    const token = args[at], raw = command.slice(token.start, token.end);
    if (/^\d*>&\d+$/.test(raw) || (shell === "powershell" && /^\*>&\d+$/.test(raw))) continue;
    const operator = raw.match(shell === "powershell" ? /^(?:\d*|\*)>>?/ : /^(?:\d*|&)>>?/);
    if (!operator) { operands.push(token); continue; }
    const prefix = operator[0];
    const target = raw.length === prefix.length ? args[++at] : { ...token, text: token.text.slice(prefix.length), start: token.start + prefix.length, quoted: /^["']/.test(raw.slice(prefix.length)) };
    if (!target) { redirects.error = "Setup output redirection target is missing"; continue; }
    const literal = literalArguments([target], shell, command);
    if (literal.error) redirects.error = literal.error;
    const value = literal[0];
    if ((shell === "bash" && value === "/dev/null") || (shell === "powershell" && !target.quoted && value.toLowerCase() === "$null")) continue;
    if (!value || /[`$*?\[<>|&]/.test(value)) redirects.error = "Setup output redirection target cannot be verified";
    redirects.push(value);
  }
  return { operands, redirects };
}
function setupTargets(args, shell, command, npm = false) {
  const { operands, redirects } = setupArguments(args, shell, command);
  const targets = npm ? npmSetupTargets(operands, shell, command) : literalArguments(operands, shell, command);
  targets.redirects = redirects;
  targets.error ??= redirects.error;
  return targets;
}
const targetCandidates = targets => [...(targets.pathOperands ? targets : targets.filter(text => !text.startsWith("-"))), ...(targets.redirects ?? [])];
function itemLinkTargets(args, targets, command) {
  const selectors = args.flatMap((arg, at) => powerShellParameter(arg, command) && /^-(?:itemtype|type)(?::|$)/i.test(powerShellFlag(arg)) ? [at] : []);
  if (!selectors.length) {
    const prefixes = new Set(["-i", "-it", "-ite", "-item", "-itemt", "-itemty", "-itemtyp", "-t", "-ty", "-typ"]);
    if (args.some((arg, at) => powerShellParameter(arg, command) && prefixes.has(powerShellFlag(arg).split(":")[0].toLowerCase()) && /^(junction|symboliclink)$/i.test(targets[arg.text.includes(":") ? at : at + 1] ?? ""))) {
      const paths = [...targets]; paths.error = targets.error ?? "Link setup ItemType selector cannot be verified"; return paths;
    }
    return null;
  }
  const excluded = new Set(), types = [];
  for (const at of selectors) {
    excluded.add(at);
    const inline = args[at].text.includes(":");
    if (!inline) excluded.add(at + 1);
    types.push(targets[inline ? at : at + 1]);
  }
  const uncertainType = !types[0] || types[0].startsWith("-") || /[`$*?\[]/.test(types[0]);
  if (!targets.error && selectors.length === 1 && !uncertainType && !/^(junction|symboliclink)$/i.test(types[0])) return null;
  const paths = targets.filter((_, at) => !excluded.has(at));
  if (targets.error) paths.error = targets.error;
  if (selectors.length !== 1 || uncertainType) paths.error = "Link setup ItemType cannot be verified";
  return paths;
}
function lnLink(args, shell, command) {
  const values = literalArguments(args, shell, command), operands = [];
  let symbolic = false, directory = null, noDirectory = false, noDereference = false, relative = false, ended = false, error;
  for (let at = 0; at < args.length; at++) {
    const value = values[at];
    if (ended || !value.startsWith("--target-directory=")) error ??= literalArguments([args[at]], shell, command).error;
    if (ended || !value.startsWith("-")) { operands.push(value); continue; }
    if (value === "--") { ended = true; continue; }
    if (value.startsWith("--")) {
      const [flag] = value.split("=");
      if (/^--s(?:y(?:m(?:b(?:o(?:l(?:i(?:c)?)?)?)?)?)?)?$/.test(flag)) {
        symbolic = true;
        if (flag !== "--symbolic") error = "Abbreviated symbolic-link selector cannot be verified";
      }
      else if (flag === "--relative") relative = true;
      else if (flag === "--no-target-directory") noDirectory = true;
      else if (flag === "--no-dereference") noDereference = true;
      else if (flag === "--target-directory") {
        if (directory !== null) error = "Repeated link destination cannot be verified";
        if (value.includes("=")) {
          const raw = command.slice(args[at].start, args[at].end), prefix = `${flag}=`;
          const literal = raw.startsWith(prefix) ? literalArguments([{ ...args[at], text: value.slice(prefix.length), start: args[at].start + prefix.length, quoted: /^["']/.test(raw.slice(prefix.length)) }], shell, command) : literalArguments([args[at]], shell, command);
          if (!raw.startsWith(prefix)) literal[0] = literal[0]?.slice(prefix.length);
          directory = literal[0]; error ??= literal.error;
        } else { directory = values[++at]; if (args[at]) error ??= literalArguments([args[at]], shell, command).error; }
      } else if (!["--force", "--interactive", "--verbose", "--logical", "--physical"].includes(flag)) error = "Link setup options cannot be verified";
      continue;
    }
    for (let index = 1; index < value.length; index++) {
      const flag = value[index];
      if (flag === "s") symbolic = true;
      else if (flag === "r") relative = true;
      else if (flag === "T") noDirectory = true;
      else if (flag === "n") noDereference = true;
      else if (flag === "t") {
        if (directory !== null) error = "Repeated link destination cannot be verified";
        directory = value.slice(index + 1);
        if (!directory) { directory = values[++at]; if (args[at]) error ??= literalArguments([args[at]], shell, command).error; }
        break;
      } else if (!"fivLP".includes(flag)) error = "Link setup options cannot be verified";
    }
  }
  if (!symbolic) return null;
  if (!operands.length || (directory !== null && !directory) || (directory !== null && noDirectory) || (noDirectory && operands.length !== 2)) error = "Link setup destination cannot be verified";
  return { form: "ln", operands, directory, noDirectory, noDereference, relative, error };
}
function itemLink(args, values, command) {
  const recognized = itemLinkTargets(args, values, command);
  if (!recognized) return null;
  const roles = {}, positional = []; let error = recognized.error, ended = false;
  for (let at = 0; at < args.length; at++) {
    const token = args[at], value = values[at];
    if (!token.quoted && token.text === "--") { ended = true; continue; }
    if (!ended && powerShellParameter(token, command)) {
      const flag = powerShellFlag(token).split(":")[0].toLowerCase();
      if (["-force", "-whatif", "-confirm"].includes(flag)) continue;
      const role = ({ "-itemtype": "type", "-type": "type", "-path": "destination", "-name": "name", "-target": "target", "-value": "target" })[flag];
      if (!role || roles[role] !== undefined) { error = "Link setup parameter roles cannot be verified"; continue; }
      roles[role] = token.text.includes(":") ? value : values[++at];
      if (!roles[role]) error = "Link setup parameter operand cannot be verified";
    } else positional.push(value);
  }
  if (positional.length) {
    if (roles.destination !== undefined || positional.length !== 1) error = "Link setup positional roles cannot be verified";
    else roles.destination = positional[0];
  }
  if (!roles.target || (!roles.destination && !roles.name)) error ??= "Link setup destination cannot be verified";
  return { form: "item", ...roles, error };
}
function linkPaths(spec, cwd) {
  const paths = []; paths.pathOperands = true;
  if (spec.error) { paths.error = spec.error; return paths; }
  const add = (destination, target, anchor) => {
    paths.push(destination);
    const parent = identity(path.dirname(entrySpelling(destination))).physical;
    paths.push(absoluteLiteral(anchor === "parent" ? parent : cwd, target));
  };
  if (spec.form === "ln") {
    const sources = [...spec.operands]; let destination;
    if (spec.directory !== null) destination = absoluteLiteral(cwd, spec.directory);
    else if (sources.length === 1) destination = cwd;
    else destination = absoluteLiteral(cwd, sources.pop());
    let directory = spec.directory !== null || spec.operands.length === 1;
    if (!directory && !spec.noDirectory) {
      try { directory = (!spec.noDereference || !fs.lstatSync(destination).isSymbolicLink()) && fs.statSync(destination).isDirectory(); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
    }
    if ((sources.length > 1 && !directory) || (spec.directory !== null && !fs.statSync(destination).isDirectory())) throw new Error("Link destination directory cannot be verified");
    for (const source of sources) add(directory ? `${entrySpelling(destination)}${path.sep}${path.basename(entrySpelling(source))}` : destination, source, spec.relative ? "cwd" : "parent");
  } else {
    if (spec.name && (path.isAbsolute(spec.name) || spec.name === "." || spec.name === ".." || /[\/\\]/.test(spec.name))) { paths.error = "Non-leaf link Name destination cannot be verified"; return paths; }
    const destination = spec.name ? `${entrySpelling(absoluteLiteral(cwd, spec.destination || "."))}${path.sep}${spec.name}` : absoluteLiteral(cwd, spec.destination);
    if (!path.isAbsolute(spec.target) && !["junction", "hardlink"].includes(spec.type?.toLowerCase())) paths.error = "Relative SymbolicLink target semantics cannot be verified";
    else add(destination, spec.target, "cwd");
  }
  return paths;
}
function operations(command, shell, cwd, depth = 0, locationState = null) {
  if (depth > 3) return [{ kind: "analysis-limit", cwd, cwds: locationState?.cwds ?? [cwd], targets: Object.assign([], { error: "Supported cleanup/setup analysis nesting exceeded" }) }];
  const { segments, subs } = readCommand(command, shell), found = [];
  const possibleCwds = new Set(locationState?.cwds ?? [cwd]), substitutionOps = [];
  let locationError = locationState?.error ?? null, childLocationError = null, hasLocation = false;
  const addCwd = next => {
    if (possibleCwds.size >= 8 && !possibleCwds.has(next)) locationError = "Possible location states exceed the supported bound";
    else possibleCwds.add(next);
  };
  const emit = op => {
    found.push({ ...op, cwd, cwds: [...possibleCwds], locationError: locationError ?? childLocationError });
  };
  for (const sub of subs) {
    const nested = operations(sub, shell, cwd, depth + 1, { cwds: [...possibleCwds], error: locationError });
    found.push(...nested);
    substitutionOps.push(...nested);
    if (nested.hasLocation) { hasLocation = true; locationError = "Nested location flow cannot be verified"; }
  }
  const locationStack = [];
  for (const { tokens, positions } of segments) {
    childLocationError = null;
    const recognitionTokens = tokens.map((token, i) => shell === "bash" && positions.has(i) && token.quoted && shellPrograms.has(baseName(token)) && !literalArguments([token], shell, command).error ? { ...token, quoted: false } : token);
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i], name = commandName(baseName(token), shell);
      if (isShellCommandString(recognitionTokens, i, positions)) {
        const literal = literalArguments([token], shell, command);
        if (literal.error) { emit({ kind: "analysis-limit", targets: literal }); continue; }
        const before = programBefore(recognitionTokens, i - 1);
        const childProgram = before >= 0 ? baseName(tokens[before]) : "";
        if (childProgram === "cmd") { emit({ kind: "cmd-boundary", targets: [] }); continue; }
        const innerShell = /^(pwsh|powershell)$/.test(childProgram) ? "powershell" : "bash";
        found.push(...operations(token.text, innerShell, cwd, depth + 1, { cwds: [...possibleCwds], error: locationError ?? childLocationError }));
      }
      const method = !token.quoted && /(?:\.|::)Delete$/i.test(token.text) && command.slice(token.end).trimStart().startsWith("(");
      if (method) {
        const methodTokens = segments.flatMap(segment => segment.tokens).filter(t => t.quoted || (t.text.includes("$") && !/^\$(true|false)$/i.test(t.text))).map(t => command.slice(t.start, t.end).endsWith(",") ? { ...t, text: t.text.replace(/,$/, "") } : t);
        const targets = literalArguments(methodTokens, shell, command);
        targets.pathOperands = true;
        if (!targets.length) targets.error = "Delete method target cannot be verified";
        emit({ kind: "delete", targets });
      }
      if (!positions.has(i)) continue;
      if (name === "cmd") { emit({ kind: "cmd-boundary", targets: [] }); continue; }
      if (shell === "bash") {
        if (encodedLiteral(token, command)) {
          emit({ kind: "analysis-limit", targets: Object.assign([], { error: "Encoded command literal cannot be verified" }) });
          continue;
        }
        const literal = literalArguments([token], shell, command);
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
        locationError = "Location stack restore cannot be verified";
        continue;
      }
      if (["cd", "set-location", "pushd", "push-location"].includes(name)) {
        hasLocation = true;
        const operands = pathArguments(args, argumentShell, command), target = operands[0];
        if (operands.length !== 1) locationError = "Location argument cardinality cannot be verified";
        if (operands.error || operands.options.some(text => /^-stackname(?::|$)/i.test(text))) locationError = operands.error ?? "Named location stack cannot be verified";
        const allowedFlag = argumentShell === "powershell" ? /^-(?:path|literalpath)(?::|$)|^-passthru$/i : name === "cd" ? /^(?:--|-L|-P)$/ : /$^/;
        if (operands.options.some(text => !allowedFlag.test(text))) locationError = "Location options cannot be verified";
        if (!target || /[`$*?\[]/.test(target)) locationError = "Effective location cannot be verified";
        if (volumeLessRooted(target)) locationError = "Windows rooted location has no volume and cannot be verified";
        if (target && !locationError) {
          const prior = [...possibleCwds];
          if (["pushd", "push-location"].includes(name)) locationStack.push(prior);
          for (const possible of prior) {
            const next = absoluteLiteral(possible, target);
            try {
              const id = identity(next);
              if (!fs.statSync(next).isDirectory()) throw new Error("not a directory");
              if (hasParentComponent(next) && id.traversals.length) throw new Error("linked parent location");
              if (id.traversals.length) addCwd(next);
              addCwd(id.physical);
            }
            catch { locationError = `Literal location cannot be verified: ${next}`; }
          }
        }
        continue;
      }
      if (["rm", "rmdir", "rd", "remove-item", "del", "erase"].includes(name)) emit({ kind: "delete", targets: pathArguments(args, argumentShell, command) });
      if (name === "git") {
        let k = 0;
        while (args[k]?.text.startsWith("-")) { const value = args[k].text; k += gitValueOptions.has(value) ? 2 : 1; }
        if (shell === "bash" && (encodedLiteral(args[k], command) || (args[k]?.text.toLowerCase() === "worktree" && encodedLiteral(args[k + 1], command)))) emit({ kind: "analysis-limit", targets: Object.assign([], { error: "Encoded Git operation selector literal cannot be verified" }) });
        else if (args[k]?.text.toLowerCase() === "worktree" && ["remove", "add"].includes(args[k + 1]?.text.toLowerCase())) {
          const removing = args[k + 1].text.toLowerCase() === "remove";
          emit({ kind: removing ? "remove" : "setup", targets: removing ? targets : setupTargets(args, argumentShell, command) });
        }
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
          else emit({ kind: "setup", targets: setupTargets(args, argumentShell, command, true) });
        }
      }
      if (name === "ln") { const linkSpec = lnLink(args, argumentShell, command); if (linkSpec) emit({ kind: "link-setup", targets: [], linkSpec }); }
      if (name === "mklink") {
        const operands = [...targets], mode = /^\/[DJH]$/i.test(operands[0]) ? operands.shift().toLowerCase() : "/d";
        emit({ kind: "link-setup", targets: [], linkSpec: { form: "item", type: mode === "/j" ? "junction" : mode === "/h" ? "hardlink" : "symboliclink", destination: operands[0], target: operands[1], error: targets.error ?? (operands.length !== 2 ? "mklink parameter roles cannot be verified" : null) } });
      }
      if (name === "new-item") { const linkSpec = itemLink(args, targets, command); if (linkSpec) emit({ kind: "link-setup", targets: [], linkSpec }); }
    }
  }
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
    return `Cleanup ownership cannot be checked: ${error.message}. ${route}`;
  }
  if (op.kind === "cmd-boundary") return (fromRepository || op.contextKnown) ? `Explicit CMD execution is refused in a known repository; use direct PowerShell/Bash or the guarded lifecycle. ${route}` : null;
  const originalPaths = op.linkSpec ? [...(op.linkSpec.operands ?? []), op.linkSpec.directory, op.linkSpec.destination, op.linkSpec.target, op.linkSpec.name] : [...op.targets, ...(op.targets.redirects ?? [])];
  if ((fromRepository || op.contextKnown) && originalPaths.some(volumeLessRooted)) return `Windows rooted cleanup/setup path has no volume and cannot be verified; use a fully qualified path. ${route}`;
  if (op.linkSpec) {
    try { op = { ...op, targets: linkPaths(op.linkSpec, op.cwd) }; }
    catch (error) { op = { ...op, targets: Object.assign([], { error: `Link setup identity cannot be checked: ${error.message}` }) }; }
  }
  if (op.targets.error || op.locationError) return (fromRepository || op.contextKnown) ? `${op.targets.error ?? op.locationError}; direct operation is refused. ${op.kind === "delete" ? literalCleanupRoute : route}` : null;
  const candidates = targetCandidates(op.targets);
  if ((fromRepository || op.contextKnown) && candidates.some(text => /[`$*?\[]/.test(text))) return `Cleanup/setup target syntax cannot be verified in this repository. ${op.kind === "delete" ? literalCleanupRoute : route}`;
  if (op.kind === "delete" && !candidates.length && (fromRepository || op.contextKnown)) return `Cleanup target is missing or cannot be verified. ${route}`;
  for (const candidate of candidates) {
    const target = absoluteLiteral(op.cwd, candidate);
    try {
      const id = identity(target);
      const containing = roots.find(tree => under(id.physical, tree));
      const reachesCheckout = containing || roots.some(tree => under(tree, id.physical)) || id.traversals.some(link => roots.some(tree => under(link.source, tree) || under(link.target, tree)));
      if (!reachesCheckout) continue;
      if (op.kind === "link-setup") return `Direct link setup touches registered checkout ${target}. ${route}`;
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
  const candidates = targetCandidates(op.targets);
  const independentAbsolute = text => path.isAbsolute(text) && !volumeLessRooted(text);
  const relative = ["setup", "link-setup"].includes(op.kind) || candidates.some(text => !independentAbsolute(text));
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
  const refusal = reason => reason && !ops.some(op => ["delete", "remove", "link-setup"].includes(op.kind)) ? `${reason} ${setupRoute}` : reason;
  if (ops.length) {
    try {
      const top = real(git(cwd, ["rev-parse", "--show-toplevel"]));
      for (const op of ops) { op.contextKnown = true; op.registryCwd = cwd; }
      if (owned(top)) return refusal(`Direct setup/cleanup from an owned filing context is refused, including changed or ambiguous locations. ${route}`);
    }
    catch (error) {
      if (!error.outsideRepository) return refusal(`Cleanup repository discovery cannot be checked: ${error.message}. ${route}`);
    }
  }
  for (const op of ops) { const reason = inspect(op); if (reason) return refusal(reason); }
  return null;
}
export async function main() {
  let raw = ""; for await (const chunk of process.stdin) raw += chunk;
  const event = JSON.parse(raw), input = event.tool_input;
  const reason = decide(input?.command, String(event.tool_name).toLowerCase(), event.cwd ?? process.env.CLAUDE_PROJECT_DIR);
  if (reason) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } }));
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href.toLowerCase() === import.meta.url.toLowerCase()) main().catch(error => { console.error(error); process.exitCode = 2; });
