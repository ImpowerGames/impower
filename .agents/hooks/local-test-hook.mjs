import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { baseName, isShellCommandString, programBefore, readCommand } from "./typed-issue-hook.mjs";

const SINGLE_FILE =
  "node scripts/test-suite.mjs run packages/sparkdown src/tests/compiler/constDeclarationValidity.test.ts --wait 600";

export const TEST_REASON =
  "Run only the test files under work locally, through the runner that sets the heap and worker caps and queues behind other runs, for example: " +
  SINGLE_FILE +
  " (from .agents/skills/write-regression-test/references/vitest.md). For the package result, push and read the Test Suite " +
  "workflow on the pushed head, which runs every touched package on each pull request; a base-branch baseline likewise comes " +
  "from that workflow's runs on the base branch. A whole-package run here duplicates it while competing with the other " +
  "sessions on this machine.";

export const START_REASON =
  "`node scripts/test-suite.mjs start` runs a whole package suite locally, which is refused with no override. " + TEST_REASON;

export const MAX_FILES = 8;

export const wideReason = (count, names = []) =>
  `This run names ${count} test files${names.length ? ` (counted: ${names.join(" ")})` : ""}, more than the ${MAX_FILES} a local run may take: a long list of existing files is a ` +
  "package run spelled out, and the suite runner refuses it at the same bound with no override. " + TEST_REASON;

export const TYPECHECK_REASON =
  "The unfiltered typecheck checks all 41 projects for about four minutes, and the typecheck workflow runs it on every pull " +
  "request that touches code. Locally, check the projects you touched with a filter, each a substring of a tsconfig path: " +
  "`npm run typecheck -- packages/sparkdown/tsconfig.json`. The whole gate is the workflow's result on the pushed head.";

const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/i;
const GLOB = /[*?[\]{}]/;
const DYNAMIC = /[$%`~]/;
const PS_TARGET_OP = /^\$(?:[A-Za-z_][A-Za-z0-9_:]*|\{[^}]+\})[+-]?=$/;
const PS_OP = /^[+-]?=$/;
const PS_TARGET = /^\$(?:[A-Za-z_][A-Za-z0-9_:]*|\{[^}]+\})$/;
const PS_GLUED = /^\$(?:[A-Za-z_][A-Za-z0-9_:]*|\{[^}]+\})[+-]?=/;

const opensQuoted = (tok, command) => (Number.isInteger(tok.start) ? /^["']/.test(command[tok.start] ?? "") : tok.quoted);

function isAssignedValue(seg, i, positions, command) {
  const tok = seg[i];
  if (PS_GLUED.test(tok.text) && !opensQuoted(tok, command)) return true;
  if (!tok.quoted) return false;
  const prev = seg[i - 1];
  if (!prev || prev.quoted) return false;
  if (PS_TARGET_OP.test(prev.text)) return positions.has(i - 1);
  const target = seg[i - 2];
  return PS_OP.test(prev.text) && !!target && !target.quoted && PS_TARGET.test(target.text) && positions.has(i - 2);
}

const VITEST_FLAGS = new Set([
  "-v", "--version", "-u", "--update", "-w", "--watch", "--ui", "--open", "--api.strictPort", "--silent",
  "--hideSkippedTests", "--coverage", "--coverage.all", "--coverage.enabled", "--coverage.clean",
  "--coverage.cleanOnRerun", "--coverage.reportOnFailure", "--coverage.allowExternal", "--coverage.skipFull",
  "--coverage.thresholds.100", "--coverage.thresholds.perFile", "--coverage.thresholds.autoUpdate", "--isolate",
  "--globals", "--dom", "--browser.enabled", "--browser.headless", "--browser.api.strictPort", "--browser.isolate",
  "--browser.ui", "--browser.fileParallelism", "--poolOptions.threads.isolate", "--poolOptions.threads.singleThread",
  "--poolOptions.threads.useAtomics", "--poolOptions.vmThreads.isolate", "--poolOptions.vmThreads.singleThread",
  "--poolOptions.vmThreads.useAtomics", "--poolOptions.forks.isolate", "--poolOptions.forks.singleFork",
  "--poolOptions.vmForks.isolate", "--poolOptions.vmForks.singleFork", "--fileParallelism", "--passWithNoTests",
  "--logHeapUsage", "--allowOnly", "--dangerouslyIgnoreUnhandledErrors", "--sequence.shuffle",
  "--sequence.shuffle.files", "--sequence.shuffle.tests", "--sequence.concurrent", "--expandSnapshotDiff",
  "--disableConsoleIntercept", "--typecheck", "--typecheck.enabled", "--typecheck.only", "--typecheck.allowJs",
  "--typecheck.ignoreSourceErrors", "--cache", "--expect", "--expect.requireAssertions", "--expect.poll",
  "--printConsoleTrace", "--run", "--no-color", "--clearScreen", "--standalone", "-h", "--help",
]);
const isVitestFlag = (name) => VITEST_FLAGS.has(name) || name.startsWith("--no-");
const VITEST_COMMANDS = new Set(["run", "watch", "dev", "related"]);

const PM_DIRECTORY_OPTIONS = new Set(["--prefix", "-C", "--dir", "--cwd"]);
const PM_WORKSPACE_OPTIONS = new Set(["-w", "--workspace", "--filter", "-F"]);

const TEST_COMMAND = /^(?:t|te|tes|test|tst|it|install-test|cit|clean-install-test|install-ci-test|sit|test:.*)$/i;

function isDynamic(text) {
  return DYNAMIC.test(text) || text.startsWith("(");
}

function follow(dir, text) {
  if (dir === null || typeof text !== "string" || text.length === 0 || isDynamic(text) || text === "-") return null;
  return isAbsolute(text) ? resolve(text) : resolve(dir, text);
}

function packageScript(dir, name) {
  for (let d = dir; d; ) {
    const file = resolve(d, "package.json");
    if (existsSync(file)) {
      try {
        const script = JSON.parse(readFileSync(file, "utf8"))?.scripts?.[name];
        return typeof script === "string" ? script : null;
      } catch {
        return undefined;
      }
    }
    const up = dirname(d);
    if (up === d) return undefined;
    d = up;
  }
  return undefined;
}

const typecheckScript = (dir) => packageScript(dir, "typecheck") ?? null;

function runsVitest(dir, name) {
  const script = dir === null ? undefined : packageScript(dir, name);
  return typeof script !== "string" || /\b(?:vitest|npm|pnpm|yarn|npx|run)\b/i.test(script);
}

function unfilteredTypecheck(args) {
  for (let i = 0; i < args.length; i++) {
    const t = args[i];
    if (t === "--list") return false;
    if (t === "--jobs" || t === "-j") {
      i++;
      continue;
    }
    if (t.startsWith("-")) continue;
    return false;
  }
  return true;
}

function scriptTypecheckArgs(script) {
  const words = script.trim().split(/\s+/);
  const at = words.findIndex((w) => /(?:^|[\\/])typecheck\.mjs$/i.test(w));
  return at < 0 ? null : words.slice(at + 1);
}

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function vitestReason(args, dir) {
  const texts = args.map((a) => a.text);
  let i = 0;
  if (texts[0] === "list") return null;
  if (VITEST_COMMANDS.has(texts[0])) i = 1;
  const roots = [dir];
  const files = [];
  for (; i < texts.length; i++) {
    const t = texts[i];
    if (t === "--") continue;
    if (t.startsWith("-")) {
      const name = t.split("=")[0];
      const glued = t.includes("=");
      const value = glued ? t.slice(name.length + 1) : isVitestFlag(name) ? undefined : texts[++i];
      if (["-r", "--root", "--dir"].includes(name) && value !== undefined) roots.push(follow(dir, value));
      continue;
    }
    files.push(t);
  }
  if (files.length === 0) return TEST_REASON;
  if (files.length > MAX_FILES) return wideReason(files.length, files);
  for (const f of files) {
    if (GLOB.test(f) || !TEST_FILE.test(f)) return TEST_REASON;
    if (isDynamic(f)) continue;
    const known = roots.filter((r) => r !== null);
    if (known.length < roots.length && !isAbsolute(f)) continue;
    if (!known.some((r) => isFile(isAbsolute(f) ? f : resolve(r, f)))) return TEST_REASON;
  }
  return null;
}

function wordsWithoutRedirects(raw, shell) {
  const powershell = shell === "powershell";
  const escape = powershell ? "`" : "\\";
  const words = [];
  let word = "";
  let started = false;
  let quotedPart = false;
  let i = 0;
  const isOperator = (c) => c === "<" || c === ">";
  const escapes = (c) => c === escape && i + 1 < raw.length;
  const skipContinuation = () => {
    if (raw[i] !== escape) return false;
    if (raw[i + 1] === "\n") i += 2;
    else if (raw[i + 1] === "\r" && raw[i + 2] === "\n") i += 3;
    else return false;
    return true;
  };
  const readQuoted = () => {
    const q = raw[i++];
    let out = "";
    while (i < raw.length) {
      if (raw[i] === q) {
        if (powershell && raw[i + 1] === q) {
          out += q;
          i += 2;
          continue;
        }
        break;
      }
      if (q === '"' && skipContinuation()) continue;
      if (raw[i] === escape && q === '"' && i + 1 < raw.length && (powershell || /["\\]/.test(raw[i + 1]))) i++;
      out += raw[i++];
    }
    i++;
    return out;
  };
  const readWord = () => {
    let out = "";
    while (i < raw.length && !/\s/.test(raw[i]) && !isOperator(raw[i])) {
      if (raw[i] === "'" || raw[i] === '"') out += readQuoted();
      else if (escapes(raw[i])) {
        i++;
        if (raw[i] !== "\n" && raw[i] !== "\r") out += raw[i];
        i++;
      } else out += raw[i++];
    }
    return out;
  };
  const flush = () => {
    if (started) words.push(word);
    word = "";
    started = false;
    quotedPart = false;
  };
  while (i < raw.length) {
    const c = raw[i];
    if (/\s/.test(c)) {
      flush();
      i++;
    } else if (escapes(c)) {
      i++;
      if (raw[i] === "\r" && raw[i + 1] === "\n") i += 2;
      else if (raw[i] === "\n") i++;
      else {
        word += raw[i++];
        started = true;
      }
    } else if (isOperator(c) && !(powershell && started && !(!quotedPart && /^(?:\d+|\*)$/.test(word)))) {
      if (started && !quotedPart && (powershell ? /^(?:\d+|\*)$/ : /^(?:\d+|&)$/).test(word)) {
        word = "";
        started = false;
      } else flush();
      while (i < raw.length && isOperator(raw[i])) i++;
      if (raw[i] === "&" && /[\d-]/.test(raw[i + 1] ?? "")) {
        i++;
        while (/[\d-]/.test(raw[i] ?? "")) i++;
      } else {
        if (raw[i] === "&" || raw[i] === "|") i++;
        while (/[ \t]/.test(raw[i] ?? "") || skipContinuation()) if (/[ \t]/.test(raw[i] ?? "")) i++;
        readWord();
      }
    } else if (c === "'" || c === '"') {
      word += readQuoted();
      started = true;
      quotedPart = true;
    } else {
      word += c;
      started = true;
      i++;
    }
  }
  flush();
  return words;
}

function suiteRunReason(args, command, shell) {
  if (args.length === 0) return null;
  const located = args.every((a) => Number.isInteger(a.start) && Number.isInteger(a.end));
  const words = located ? wordsWithoutRedirects(command.slice(args[0].start, args[args.length - 1].end), shell) : args.map((a) => a.text);
  const files = [];
  for (let i = 0; i < words.length; i++) {
    if (["--wait", "--file-timeout", "--internal-receipt"].includes(words[i])) {
      i++;
      continue;
    }
    files.push(words[i]);
  }
  return files.length > MAX_FILES ? wideReason(files.length, files) : null;
}

function packageManagerReason(program, args, dir) {
  const texts = args.map((a) => a.text);
  let start = 0;
  let end = texts.indexOf("--");
  if (end >= 0 && !texts.slice(0, end).some((t) => !t.startsWith("-"))) {
    start = end + 1;
    end = texts.indexOf("--", start);
  }
  const own = end < 0 ? texts.slice(start) : texts.slice(start, end);
  let at = dir;
  const toPackage = (value) => {
    const pkg = follow(dir, value);
    return pkg !== null && existsSync(resolve(pkg, "package.json")) ? pkg : null;
  };
  for (let k = 0; k < own.length; k++) {
    const t = own[k];
    if (program === "yarn" && t.toLowerCase() === "workspace") at = toPackage(own[k + 1]);
    if (!t.startsWith("-")) continue;
    const name = t.split("=")[0];
    const value = t.includes("=") ? t.slice(name.length + 1) : own[k + 1];
    if (PM_DIRECTORY_OPTIONS.has(name)) at = follow(dir, value);
    else if (PM_WORKSPACE_OPTIONS.has(name)) at = toPackage(value);
  }
  const runsBinary = own.some((t) => /^(?:exec|dlx|x)$/i.test(t)) || ["npx", "pnpx", "bunx"].includes(program);
  const manages = !runsBinary && own.some((t) => /^(?:i|in|install|add|ci|remove|rm|uninstall|un|update|up|upgrade|view|v|info|show|why|ls|list|outdated|search|home|docs|repo|bugs)$/i.test(t));
  if (manages) return null;
  const vitest = texts.findIndex((t, k) => /^vitest(?:@.*)?$/i.test(t) && !/^(?:--package|-p)$/.test(texts[k - 1] ?? ""));
  if (vitest >= 0) return vitestReason(args.slice(vitest + 1), at);
  const test = own.find((t) => !t.startsWith("-") && TEST_COMMAND.test(t));
  if (test !== undefined && runsVitest(at, /^test:/i.test(test) ? test : "test")) return TEST_REASON;
  const script = own.findIndex((t) => t.toLowerCase() === "typecheck");
  if (script < 0) return null;
  const extra = program === "npm" ? (end < 0 ? [] : texts.slice(end + 1)) : texts.slice(start + script + 1).filter((t) => t !== "--");
  if (!unfilteredTypecheck(extra)) return null;
  if (at === null) return null;
  const ownScript = typecheckScript(at);
  const ownArgs = ownScript === null ? null : scriptTypecheckArgs(ownScript);
  return ownArgs !== null && unfilteredTypecheck(ownArgs) ? TYPECHECK_REASON : null;
}

const CD = new Set(["cd", "chdir", "pushd", "set-location", "sl", "push-location"]);

export function decide(command, shell, cwd = process.cwd(), depth = 0) {
  if (typeof command !== "string" || command.length === 0 || depth > 3) return null;
  if (shell !== "powershell" && shell !== "bash") return decide(command, "bash", cwd, depth) ?? decide(command, "powershell", cwd, depth);
  const { segments, subs } = readCommand(command, shell);
  for (const sub of subs) {
    const inner = decide(sub, shell, cwd, depth + 1);
    if (inner) return inner;
  }
  let dir = cwd;
  for (const { tokens: seg, positions } of segments) {
    for (let i = 0; i < seg.length; i++) {
      const tok = seg[i];
      if (tok.quoted && isShellCommandString(seg, i, positions)) {
        const program = programBefore(seg, i - 1);
        const innerShell = program >= 0 && /^(pwsh|powershell)$/.test(baseName(seg[program])) ? "powershell" : program >= 0 ? "bash" : shell;
        const inner = decide(tok.text, innerShell, dir, depth + 1);
        if (inner) return inner;
      }
      if (!positions.has(i)) continue;
      if (isAssignedValue(seg, i, positions, command)) continue;
      const name = baseName(tok).replace(/\.(?:cmd|bat|ps1)$/i, "");
      const args = seg.slice(i + 1);
      if (CD.has(name)) {
        const target = args.find((a) => !a.text.startsWith("-") && !/^\/d$/i.test(a.text));
        dir = target ? follow(dir, target.text) : null;
        continue;
      }
      let rest = -1;
      if (name === "cmd") {
        rest = args.findIndex((a) => /^\/[ck]$/i.test(a.text));
        if (rest >= 0) rest++;
        while (rest >= 0 && /^@?call$/i.test(args[rest]?.text ?? "")) rest++;
      } else if (/^(pwsh|powershell)$/.test(name)) {
        rest = args.findIndex((a) => /^-(?:c|command)$/i.test(a.text));
        if (rest >= 0) rest++;
      } else if (name === "corepack") rest = 0;
      if (rest >= 0 && rest < args.length) {
        const tail = args.slice(rest);
        const text = tail.length === 1 && tail[0].quoted
          ? tail[0].text
          : tail.every((a) => Number.isInteger(a.start) && Number.isInteger(a.end))
            ? command.slice(tail[0].start, tail[tail.length - 1].end)
            : tail.map((a) => a.text).join(" ");
        const inner = decide(name === "cmd" ? text.replace(/^\s*@?(?:call\s+@?)?/i, "") : text,/^(pwsh|powershell)$/.test(name) ? "powershell" : undefined, dir, depth + 1);
        if (inner) return inner;
        continue;
      }
      let reason = null;
      if (name === "vitest") reason = vitestReason(args, dir);
      else if (["npm", "pnpm", "yarn", "npx", "pnpx", "bunx"].includes(name)) reason = packageManagerReason(name, args, dir);
      else if (name === "node") {
        const guarded = /(?:^|[\\/=])(?:typecheck\.mjs|test-suite\.mjs|vitest(?:\.mjs)?)$/i;
        const preload = /^(?:--import|--require|-r|--loader|--experimental-loader)(?:=|$)/;
        const code = args.findIndex((a) => /^(?:-[a-z]*[ep][a-z]*|--eval|--print)(?:=|$)/.test(a.text));
        const script = args.findIndex((a, k) => (code < 0 || k < code || preload.test(a.text) || preload.test(args[k - 1]?.text ?? "")) && guarded.test(a.text));
        const target = args[script]?.text ?? "";
        const scriptArgs = script < 0 || preload.test(target) || preload.test(args[script - 1]?.text ?? "") ? [] : args.slice(script + 1);
        if (/typecheck\.mjs$/i.test(target) && unfilteredTypecheck(scriptArgs.map((a) => a.text))) reason = TYPECHECK_REASON;
        else if (/vitest(?:\.mjs)?$/i.test(target)) reason = vitestReason(scriptArgs, dir);
        else if (/test-suite\.mjs$/i.test(target) && /^start$/i.test(scriptArgs[0]?.text ?? "")) reason = START_REASON;
        else if (/test-suite\.mjs$/i.test(target) && /^run$/i.test(scriptArgs[0]?.text ?? "")) reason = suiteRunReason(scriptArgs.slice(2), command, shell);
      }
      if (reason) return reason;
    }
  }
  return null;
}

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    }),
  );
}

export async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    if (/\b(?:vitest|typecheck)\b|test-suite\.mjs\W+start\b|\b(?:npm|pnpm|yarn)\s+(?:run\s+)?test\b/i.test(raw)) {
      deny("The local-test hook could not parse the tool payload, so it cannot tell how wide this run is. " + TEST_REASON);
    }
    return;
  }
  const command = payload?.tool_input?.command;
  const tool = String(payload?.tool_name ?? "").toLowerCase();
  const shell = tool === "powershell" ? "powershell" : tool === "bash" ? "bash" : undefined;
  const cwd = typeof payload?.cwd === "string" && payload.cwd ? payload.cwd : process.cwd();
  const reason = decide(command, shell, cwd);
  if (reason) deny(reason);
}

const invokedDirectly =
  process.argv[1] && pathToFileURL(process.argv[1]).href.toLowerCase() === import.meta.url.toLowerCase();
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`local-test-hook: ${err?.stack ?? err}\n`);
    process.exit(1);
  });
}
