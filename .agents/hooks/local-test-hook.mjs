// PreToolUse hook for the Bash and PowerShell tools: refuses a local test or
// typecheck run that is wider than the files under work.
//
// The Test Suite workflow runs every touched package with one worker under a
// 1 GB heap on each pull request, and the typecheck workflow runs all 41
// projects. Several sessions share this machine, so a whole-package Vitest
// run or the unfiltered typecheck here duplicates that work while competing
// with every other session for memory and cores. Refused: a Vitest call whose
// positional arguments are missing, or are not all test files that exist (a
// directory, a glob or a bare word is a filter over the whole package); a
// package `npm test`, `npm run test`, `pnpm test` or `yarn test`, including
// the `test:*` scripts; and the typecheck with no project filter, whether
// through `npm run typecheck` in a directory whose script is unfiltered (the
// repository root) or through `scripts/typecheck.mjs` directly. Allowed: a
// Vitest call naming existing test files, `node scripts/test-suite.mjs`, a
// package's own `npm run typecheck`, which its script filters to that
// package, and the typecheck with a filter or `--list`.
//
// The command is read with the typed-issue hook's tokenizer, so a mention in
// a quoted string, a comment or a here-doc body does not count, and a call
// counts only at command position. Directory changes written literally in
// the same command (`cd`, `Set-Location`, `pushd`, npm's `--prefix`) are
// followed so a file argument is checked where Vitest will look for it, and
// so are npm's `-w`/`--workspace` and pnpm's `--filter` when they name a
// package directory. Windows shims (`npm.cmd`, `vitest.cmd`) count as their
// programs, and `cmd /c`, an unquoted `pwsh -Command` and `corepack` have
// the rest of their line read as a command. Like
// the other hooks this reads command text statically: an invocation built
// from a variable, an alias, a wrapper script or a command string handed to
// another program (such as the redgreen driver's `--test`) is not seen, and a
// directory given by a variable is not followed. The skill text states the
// rule for those cases.

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { baseName, isShellCommandString, programBefore, readCommand } from "./typed-issue-hook.mjs";

const SINGLE_FILE =
  "cd packages/sparkdown && NODE_OPTIONS=--max-old-space-size=1024 npx vitest run src/tests/compiler/constDeclarationValidity.test.ts " +
  "--pool=forks --poolOptions.forks.minForks=1 --poolOptions.forks.maxForks=1";

export const TEST_REASON =
  "Run only the test files under work locally, one Vitest process at a time with a 1024 MB heap and one fork, for example: " +
  SINGLE_FILE +
  " (from .agents/skills/write-regression-test/references/vitest.md). The package result comes from the Test Suite workflow " +
  "on the pushed head, which runs every touched package on each pull request; a whole-package run here duplicates it while " +
  "competing with the other sessions on this machine. When you need a package result the workflow cannot give, such as a " +
  "baseline on a base commit, use `node scripts/test-suite.mjs start <package-directory>`, which reserves the machine.";

export const TYPECHECK_REASON =
  "The unfiltered typecheck checks all 41 projects for about four minutes, and the typecheck workflow runs it on every pull " +
  "request that touches code. Locally, check the projects you touched with a filter, each a substring of a tsconfig path: " +
  "`npm run typecheck -- packages/sparkdown/tsconfig.json`. The whole gate is the workflow's result on the pushed head.";

const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/i;
const GLOB = /[*?[\]{}]/;
// Text a static reading cannot resolve: a variable, a substitution, a home
// directory or a PowerShell drive other than a filesystem path.
const DYNAMIC = /[$%`~]/;

// Vitest 2.1.9's options that take no value, as its own CLI declares them
// (options whose cac name has no `<value>` or `[value]`); a `--no-` negation
// takes none either. Every other option not glued to its value with `=` is
// read as taking the next token, so that token never counts as a test file:
// an option this list misses, including one whose value is optional, can
// only make a call look unconfined, never confined.
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

// Package-manager options whose value names the package a command runs in.
const PM_DIRECTORY_OPTIONS = new Set(["--prefix", "-C", "--dir", "--cwd"]);
const PM_WORKSPACE_OPTIONS = new Set(["-w", "--workspace", "--filter", "-F"]);

// Package-manager words that run a package's test script: npm's `test` with
// its aliases and unambiguous abbreviations, the install-then-test commands
// and their aliases, and a `test` or `test:*` script named to `run`.
const TEST_COMMAND = /^(?:t|te|tes|test|tst|it|install-test|cit|clean-install-test|install-ci-test|sit|test:.*)$/i;

function isDynamic(text) {
  return DYNAMIC.test(text) || text.startsWith("(");
}

/** The directory a literal path names from `dir`, or null when either is unknown. */
function follow(dir, text) {
  if (dir === null || typeof text !== "string" || text.length === 0 || isDynamic(text) || text === "-") return null;
  return isAbsolute(text) ? resolve(text) : resolve(dir, text);
}

/** The nearest package.json's typecheck script from `dir` upward, or null. */
function typecheckScript(dir) {
  for (let d = dir; d; ) {
    const file = resolve(d, "package.json");
    if (existsSync(file)) {
      try {
        const script = JSON.parse(readFileSync(file, "utf8"))?.scripts?.typecheck;
        return typeof script === "string" ? script : null;
      } catch {
        return null;
      }
    }
    const up = dirname(d);
    if (up === d) return null;
    d = up;
  }
  return null;
}

/** True when the typecheck.mjs arguments name no project and do not only list. */
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

/** Arguments of a script string after its typecheck.mjs, or null when it does not run one. */
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

/**
 * Checks the tokens after `vitest`. Returns TEST_REASON unless every
 * positional argument is an existing test file (a file-shaped argument whose
 * directory the reading could not resolve is taken as written).
 */
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
  for (const f of files) {
    if (GLOB.test(f) || !TEST_FILE.test(f)) return TEST_REASON;
    if (isDynamic(f)) continue;
    const known = roots.filter((r) => r !== null);
    if (known.length < roots.length && !isAbsolute(f)) continue;
    if (!known.some((r) => isFile(isAbsolute(f) ? f : resolve(r, f)))) return TEST_REASON;
  }
  return null;
}

/**
 * Checks a package-manager call (npm, pnpm, yarn, or the npx family, which
 * runs a package binary). `args` are the tokens after the program.
 * Returns a reason, or null.
 */
function packageManagerReason(program, args, dir) {
  const texts = args.map((a) => a.text);
  // Which tokens are option values depends on every option's type, which
  // this reading does not know, so it does not locate the subcommand by
  // position: a test word anywhere among the package manager's own tokens
  // (those before `--`) refuses the call, and a `typecheck` word there is
  // checked as the script.
  const end = texts.indexOf("--");
  const own = end < 0 ? texts : texts.slice(0, end);
  // A directory or workspace option moves the package the script runs in; a
  // workspace named by package name rather than path leaves it unknown.
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
  // `npx vitest`, `npm exec [--] vitest`, `pnpm exec vitest`, `pnpm dlx vitest`, `yarn vitest`.
  // A command that installs, removes or describes packages names vitest as a
  // package, not a run.
  const manages = own.some((t) => /^(?:i|in|install|add|ci|remove|rm|uninstall|un|update|up|upgrade|view|info|why|ls|list|outdated)$/i.test(t));
  const vitest = manages ? -1 : texts.findIndex((t) => t.toLowerCase() === "vitest");
  if (vitest >= 0) return vitestReason(args.slice(vitest + 1), at);
  if (own.some((t) => !t.startsWith("-") && TEST_COMMAND.test(t))) return TEST_REASON;
  const script = own.findIndex((t) => t.toLowerCase() === "typecheck");
  if (script < 0) return null;
  // npm hands the script only what follows `--`; pnpm and yarn also hand it
  // the words after the script name.
  const extra = program === "npm" ? (end < 0 ? [] : texts.slice(end + 1)) : texts.slice(script + 1).filter((t) => t !== "--");
  if (!unfilteredTypecheck(extra)) return null;
  if (at === null) return null;
  const ownScript = typecheckScript(at);
  const ownArgs = ownScript === null ? null : scriptTypecheckArgs(ownScript);
  return ownArgs !== null && unfilteredTypecheck(ownArgs) ? TYPECHECK_REASON : null;
}

const CD = new Set(["cd", "chdir", "pushd", "set-location", "sl", "push-location"]);

/**
 * Returns a deny reason for the command, or null to allow it. `shell` is
 * "powershell" or "bash"; when omitted the command is read both ways and
 * refused if either reading refuses it. `cwd` is the directory the command
 * starts in; when omitted, file arguments are checked against this
 * process's directory. Substitutions and -c strings are analysed to a depth
 * of three, as in the typed-issue hook.
 */
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
      // `npm.cmd`, `vitest.cmd` and `npx.ps1` are the same programs as
      // their bare names on Windows.
      const name = baseName(tok).replace(/\.(?:cmd|bat|ps1)$/i, "");
      const args = seg.slice(i + 1);
      if (CD.has(name)) {
        const target = args.find((a) => !a.text.startsWith("-"));
        dir = target ? follow(dir, target.text) : null;
        continue;
      }
      // A program that runs the rest of its line as a command: `cmd /c`
      // (and `cmd /c call`), `pwsh -Command`, and `corepack <package
      // manager>`. A tail that is one quoted token is read without its quotes.
      let rest = -1;
      if (name === "cmd") {
        rest = args.findIndex((a) => /^\/[ck]$/i.test(a.text));
        if (rest >= 0) rest++;
        while (rest >= 0 && args[rest]?.text.toLowerCase() === "call") rest++;
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
        const inner = decide(text.replace(/^\s*call\s+/i, ""), /^(pwsh|powershell)$/.test(name) ? "powershell" : undefined, dir, depth + 1);
        if (inner) return inner;
        continue;
      }
      let reason = null;
      if (name === "vitest") reason = vitestReason(args, dir);
      else if (["npm", "pnpm", "yarn", "npx", "pnpx", "bunx"].includes(name)) reason = packageManagerReason(name, args, dir);
      else if (name === "node") {
        // Node's own options may take separate values, so the script is the
        // first argument naming a guarded entry point, not the first
        // non-option. With `-e` or `-p` Node runs that code instead, and
        // every later argument is only data for it.
        const code = args.findIndex((a) => /^(?:-e|--eval|-p|--print)(?:=|$)/.test(a.text));
        const script = args.findIndex((a, k) => (code < 0 || k < code) && /(?:^|[\\/])(?:typecheck\.mjs|vitest(?:\.mjs)?)$/i.test(a.text));
        const target = args[script]?.text ?? "";
        if (/(?:^|[\\/])typecheck\.mjs$/i.test(target) && unfilteredTypecheck(args.slice(script + 1).map((a) => a.text))) reason = TYPECHECK_REASON;
        else if (/(?:^|[\\/])vitest(?:\.mjs)?$/i.test(target)) reason = vitestReason(args.slice(script + 1), dir);
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
    // An unparseable payload is refused only when it looks like it carries a
    // test or typecheck call, so a broken harness cannot let one through and
    // cannot block unrelated commands either.
    if (/\b(?:vitest|typecheck)\b|\b(?:npm|pnpm|yarn)\s+(?:run\s+)?test\b/i.test(raw)) {
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
