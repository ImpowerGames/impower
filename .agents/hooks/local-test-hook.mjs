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
// followed so a file argument is checked where Vitest will look for it. Like
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

// Vitest options that take the next token as their value when it is not
// glued on with `=`. Every other option is read as a flag.
const VITEST_VALUE_OPTIONS = new Set([
  "-c", "--config", "-r", "--root", "--dir", "-t", "--testNamePattern", "--pool", "--project", "--reporter",
  "--outputFile", "--environment", "--shard", "--maxWorkers", "--minWorkers", "--testTimeout", "--hookTimeout",
  "--teardownTimeout", "--exclude", "--mode", "--workspace", "--sequence.seed", "--bail", "--retry", "--maxConcurrency",
  "--coverage.provider", "--coverage.reporter", "--coverage.reportsDirectory", "--poolOptions.forks.minForks",
  "--poolOptions.forks.maxForks", "--poolOptions.threads.minThreads", "--poolOptions.threads.maxThreads",
]);
const VITEST_COMMANDS = new Set(["run", "watch", "dev", "related"]);

// Package-manager options before the subcommand that take a value.
const PM_VALUE_OPTIONS = new Set([
  "--prefix", "-w", "--workspace", "-C", "--dir", "--filter", "-F", "--cwd", "--loglevel", "--userconfig",
]);

const RUN_WORDS = new Set(["run", "run-script", "rum", "urn"]);
const TEST_WORDS = new Set(["test", "t", "tst"]);
const isTestScript = (name) => /^test(?::|$)/i.test(name);

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
      const value = t.includes("=") ? t.slice(name.length + 1) : VITEST_VALUE_OPTIONS.has(name) ? texts[++i] : undefined;
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
 * Checks a package-manager call. `args` are the tokens after the program.
 * Returns a reason, or null.
 */
function packageManagerReason(program, args, dir) {
  const texts = args.map((a) => a.text);
  let i = 0;
  let at = dir;
  while (i < texts.length && texts[i].startsWith("-")) {
    const name = texts[i].split("=")[0];
    const glued = texts[i].includes("=");
    const value = glued ? texts[i].slice(name.length + 1) : PM_VALUE_OPTIONS.has(name) ? texts[i + 1] : undefined;
    if (["--prefix", "-C", "--dir", "--cwd"].includes(name)) at = follow(dir, value);
    i += PM_VALUE_OPTIONS.has(name) && !glued ? 2 : 1;
  }
  let sub = texts[i]?.toLowerCase();
  // `yarn workspace <name> <script>` runs the script in that workspace.
  if (program === "yarn" && sub === "workspace") {
    i += 2;
    sub = texts[i]?.toLowerCase();
  }
  // `npx vitest`, `npm exec vitest`, `pnpm exec vitest`, `pnpm dlx vitest`, `yarn vitest`.
  if (sub === "exec" || sub === "dlx" || sub === "x") {
    i++;
    while (i < texts.length && texts[i].startsWith("-")) i++;
    if (texts[i] === "--") i++;
    sub = texts[i]?.toLowerCase();
  }
  if (sub === "vitest") return vitestReason(args.slice(i + 1), at);
  if (sub === undefined) return null;
  let script = null;
  if (TEST_WORDS.has(sub)) script = "test";
  else if (RUN_WORDS.has(sub)) {
    i++;
    while (i < texts.length && texts[i].startsWith("-")) i++;
    script = texts[i] ?? null;
  } else if (program !== "npm") script = texts[i];
  if (script === null) return null;
  if (isTestScript(script)) return TEST_REASON;
  if (script.toLowerCase() === "typecheck") {
    const rest = texts.slice(i + 1);
    const dashes = rest.indexOf("--");
    const extra = dashes < 0 ? (program === "npm" ? [] : rest) : rest.slice(dashes + 1);
    if (!unfilteredTypecheck(extra)) return null;
    if (at === null) return null;
    const own = typecheckScript(at);
    const ownArgs = own === null ? null : scriptTypecheckArgs(own);
    if (ownArgs !== null && unfilteredTypecheck(ownArgs)) return TYPECHECK_REASON;
  }
  return null;
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
      const name = baseName(tok);
      const args = seg.slice(i + 1);
      if (CD.has(name)) {
        const target = args.find((a) => !a.text.startsWith("-"));
        dir = target ? follow(dir, target.text) : null;
        continue;
      }
      let reason = null;
      if (name === "vitest") reason = vitestReason(args, dir);
      else if (name === "npx" || name === "pnpx" || name === "bunx") {
        let k = 0;
        while (k < args.length && args[k].text.startsWith("-")) k += ["-p", "--package"].includes(args[k].text) ? 2 : 1;
        if (args[k]?.text.toLowerCase() === "vitest") reason = vitestReason(args.slice(k + 1), dir);
      } else if (name === "npm" || name === "pnpm" || name === "yarn") reason = packageManagerReason(name, args, dir);
      else if (name === "node") {
        const script = args.findIndex((a) => !a.text.startsWith("-"));
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
