// Exercises the local-test hook two ways: the decision table runs against
// decide() directly, and a set of payloads run through the literal
// PreToolUse "command" string that .claude/settings.json ships, under bash
// and, when one is installed, under dash. Commands start in a temporary tree
// shaped like this repository (a root typecheck script with no filter, a
// package whose script filters to itself, and its test files), because the
// hook-tests workflow checks out only the tooling directories. Run:
//   node .claude/hooks/local-test-hook.test.mjs

import { testShell } from "../../.agents/skills/drive-web-editor/redgreen.mjs";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decide } from "./local-test-hook.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
// The directory name avoids the settings prefilter's words, so a wired case
// passes the prefilter only through its command.
const tree = mkdtempSync(join(tmpdir(), "lth-"));
process.on("exit", () => rmSync(tree, { recursive: true, force: true }));
const put = (path, text) => {
  mkdirSync(dirname(join(tree, path)), { recursive: true });
  writeFileSync(join(tree, path), text);
};
put("package.json", JSON.stringify({ scripts: { typecheck: "node scripts/typecheck.mjs" } }));
put("scripts/typecheck.mjs", "");
put("packages/sparkdown/package.json", JSON.stringify({ scripts: { test: "vitest", "test:run": "vitest run", typecheck: "node ../../scripts/typecheck.mjs packages/sparkdown/" } }));
put("packages/sparkdown/src/tests/compiler/constDeclarationValidity.test.ts", "");
put("packages/sparkdown/src/tests/compiler/FilterImageLayers.test.ts", "");
let failed = 0;

function check(ok, label, detail) {
  if (ok) console.log(`PASS: ${label}`);
  else {
    failed++;
    console.log(`FAIL: ${label}${detail ? ` -- ${detail}` : ""}`);
  }
}

// FILE exists in the temporary tree under packages/sparkdown.
const FILE = "src/tests/compiler/constDeclarationValidity.test.ts";
const CAPS = "--pool=forks --poolOptions.forks.minForks=1 --poolOptions.forks.maxForks=1";

const denies = [
  ["npx vitest run with no file", "cd packages/sparkdown && npx vitest run"],
  ["a bare npx vitest", "cd packages/sparkdown && npx vitest"],
  ["a bare vitest", "cd packages/sparkdown; vitest"],
  ["vitest run with only the caps", `cd packages/sparkdown && NODE_OPTIONS=--max-old-space-size=1024 npx vitest run ${CAPS}`],
  ["vitest run on a directory", "cd packages/sparkdown && npx vitest run src/tests"],
  ["vitest run on a glob", "cd packages/sparkdown && npx vitest run 'src/tests/**/*.test.ts'"],
  ["vitest run on a bare word filter", "cd packages/sparkdown && npx vitest run compiler"],
  ["vitest run on a test file that does not exist", "cd packages/sparkdown && npx vitest run src/tests/compiler/NoSuchFile.test.ts"],
  ["vitest run on the right file from the wrong directory", `npx vitest run ${FILE}`],
  ["one existing file and one directory", `cd packages/sparkdown && npx vitest run ${FILE} src/tests`],
  ["a value option's value is not a file", `cd packages/sparkdown && npx vitest run --pool forks ${CAPS.split(" ").slice(1).join(" ")}`],
  ["npm exec vitest", "cd packages/sparkdown && npm exec vitest run"],
  ["pnpm exec vitest", "cd packages/sparkdown && pnpm exec vitest run"],
  ["yarn vitest", "cd packages/sparkdown && yarn vitest run"],
  ["node running vitest.mjs", "cd packages/sparkdown && node ../../node_modules/vitest/vitest.mjs run"],
  ["vitest through Set-Location", "Set-Location packages/sparkdown; npx vitest run"],
  ["vitest inside bash -c", 'bash -c "cd packages/sparkdown && npx vitest run"'],
  ["vitest inside a command substitution", 'OUT="$(npx vitest run)"'],
  ["package npm test", "cd packages/sparkdown && npm test"],
  ["package npm t", "cd packages/sparkdown && npm t"],
  ["package npm run test", "cd packages/sparkdown && npm run test"],
  ["package npm run test:run", "cd packages/sparkdown && npm run test:run"],
  ["npm test with a file after --", `cd packages/sparkdown && npm test -- ${FILE}`],
  ["npm test by prefix", "npm --prefix packages/sparkdown test"],
  ["npm test by workspace", "npm -w packages/sparkdown test"],
  ["npm test at the root", "npm test"],
  ["pnpm test", "cd packages/sparkdown && pnpm test"],
  ["pnpm recursive test", "pnpm -r test"],
  ["yarn test", "cd packages/sparkdown && yarn test"],
  ["yarn workspace test", "yarn workspace @impower/sparkdown test"],
  ["npm test in mixed case", "NPM TEST"],
  ["the bare root typecheck", "npm run typecheck"],
  ["the root typecheck with only a jobs setting", "npm run typecheck -- --jobs 4"],
  ["the root typecheck after a cd to the root", "cd packages/sparkdown && cd ../.. && npm run typecheck"],
  ["the typecheck script directly", "node scripts/typecheck.mjs"],
  ["the typecheck script from a package", "cd packages/sparkdown && node ../../scripts/typecheck.mjs --jobs=2"],
  ["the root typecheck through pnpm", "pnpm typecheck"],
  // Review round 1 (PR #767): option values, Windows shims, runner wrappers.
  ["npm run with --prefix before the test script", "npm run --prefix packages/sparkdown test"],
  ["npm run with --workspace before the test script", "npm run --workspace packages/sparkdown test"],
  ["npm run with -w before the test script", "npm run -w packages/sparkdown test"],
  ["pnpm run with --filter before the test script", "pnpm run --filter @impower/sparkdown test"],
  ["node with a --require value before the typecheck script", "node --require node:path scripts/typecheck.mjs"],
  ["node with a -r value before vitest.mjs", "cd packages/sparkdown && node -r ./preload.cjs ../../node_modules/vitest/vitest.mjs run"],
  ["an unknown vitest option whose value is a test file", `cd packages/sparkdown && npx vitest run --coverage.ignoreClassMethods ${FILE}`],
  ["npm.cmd test", "cd packages/sparkdown; npm.cmd test"],
  ["npx.cmd vitest run", "cd packages/sparkdown; npx.cmd vitest run"],
  ["vitest.cmd from node_modules/.bin", "cd packages/sparkdown; .\\node_modules\\.bin\\vitest.cmd run"],
  ["cmd /c npm test", "cmd /c npm test"],
  ["an unquoted pwsh -Command npm test", "pwsh -Command npm test"],
  ["corepack pnpm test", "corepack pnpm test"],
];

const allows = [
  ["vitest run on one existing file with the caps", `cd packages/sparkdown && NODE_OPTIONS=--max-old-space-size=1024 npx vitest run ${FILE} ${CAPS}`],
  ["the acceptance command from the package directory", `cd packages/sparkdown && npx vitest run ${FILE} --pool=forks --poolOptions.forks.minForks=1 --poolOptions.forks.maxForks=1`],
  ["vitest on two existing files", `cd packages/sparkdown && npx vitest run ${FILE} src/tests/compiler/FilterImageLayers.test.ts`],
  ["vitest with a separate value option before the file", `cd packages/sparkdown && npx vitest run --pool forks ${FILE}`],
  ["vitest with a name filter and a file", `cd packages/sparkdown && npx vitest run -t "declares a const" ${FILE}`],
  ["vitest through Set-Location on a file", `Set-Location packages/sparkdown; npx vitest run ${FILE} ${CAPS}`],
  ["vitest on a file given by a variable", 'cd packages/sparkdown && npx vitest run "$TEST_FILE.test.ts"'],
  ["vitest after a cd to a variable directory", `cd "$PKG" && npx vitest run ${FILE}`],
  ["vitest list", "cd packages/sparkdown && npx vitest list"],
  ["the suite runner start", "node scripts/test-suite.mjs start packages/sparkdown"],
  ["the suite runner status", "node scripts/test-suite.mjs status .git/test-suite/run-1"],
  ["the filtered root typecheck", "npm run typecheck -- packages/sparkdown/tsconfig.json"],
  ["the root typecheck list", "npm run typecheck -- --list"],
  ["the typecheck script with a filter", "node scripts/typecheck.mjs packages/sparkdown/tsconfig.json --jobs 2"],
  ["a package's own typecheck", "cd packages/sparkdown && npm run typecheck"],
  ["a package's own typecheck by prefix", "npm --prefix packages/sparkdown run typecheck"],
  ["a package build", "cd packages/sparkdown && npm run build"],
  ["a package's typecheck by -w", "npm -w packages/sparkdown run typecheck"],
  ["a package's typecheck by --workspace", "npm --workspace packages/sparkdown run typecheck"],
  ["a package's typecheck with --workspace after the script", "npm run typecheck --workspace packages/sparkdown"],
  ["a package's typecheck by pnpm --filter", "pnpm --filter @impower/sparkdown typecheck"],
  ["vitest with a known flag before the file", `cd packages/sparkdown && npx vitest run --run ${FILE}`],
  ["node with a --require value before the suite runner", "node --require node:path scripts/test-suite.mjs start packages/sparkdown"],
  ["cmd /c on a single file", `cmd /c "cd packages/sparkdown && npx vitest run ${FILE}"`],
  ["an install", "PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install"],
  ["the tooling checks", "node scripts/check-agent-tooling.mjs"],
  ["a hook test", "node .claude/hooks/local-test-hook.test.mjs"],
  ["the phrase inside a quoted string", "echo 'npx vitest run is refused here'"],
  ["the phrase inside a here-doc body", "cat > note.md <<'EOF'\nnpm test\nnpm run typecheck\nEOF"],
  ["the phrase in a comment", "git status # then npm test"],
  ["a grep for vitest", "grep -rn 'vitest run' .agents"],
  ["a process listing that names vitest", "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*vitest*' }"],
  ["an empty command", ""],
  ["a non-string command", null],
];

for (const [label, command] of denies) {
  const reason = decide(command, undefined, tree);
  check(typeof reason === "string" && reason.length > 0, `denied: ${label}`, JSON.stringify(reason));
}
for (const [label, command] of allows) {
  const reason = decide(command, undefined, tree);
  check(reason === null, `allowed: ${label}`, JSON.stringify(reason));
}

// The reasons name what to run instead and where the wider result comes from.
{
  const test = decide("cd packages/sparkdown && npx vitest run", "bash", tree);
  check(/npx vitest run src\/tests\/\S+\.test\.ts/.test(test), "the test reason names the single-file command", JSON.stringify(test));
  check(/references\/vitest\.md/.test(test), "the test reason names the reference it comes from", JSON.stringify(test));
  check(/Test Suite workflow/.test(test), "the test reason names the Test Suite workflow", JSON.stringify(test));
  check(/scripts\/test-suite\.mjs/.test(test), "the test reason names the suite runner", JSON.stringify(test));
  const tc = decide("npm run typecheck", "powershell", tree);
  check(/npm run typecheck -- \S+tsconfig\.json/.test(tc), "the typecheck reason names the filtered form", JSON.stringify(tc));
  check(/typecheck workflow/.test(tc), "the typecheck reason names the workflow", JSON.stringify(tc));
}

// A directory the command starts in is where file arguments resolve.
{
  const pkg = resolve(tree, "packages", "sparkdown");
  check(decide(`npx vitest run ${FILE}`, "bash", pkg) === null, "a file resolves against the starting directory");
  check(typeof decide("npm run typecheck", "bash", resolve(tree, "scripts")) === "string", "a subdirectory without its own package.json uses the root script");
}

// The wired command string, under bash and under a plain POSIX shell.
{
  const settings = JSON.parse(readFileSync(resolve(root, ".claude", "settings.json"), "utf8"));
  const entry = (settings.hooks?.PreToolUse ?? []).find(
    (e) => /\bBash\b/.test(e.matcher) && /\bPowerShell\b/.test(e.matcher) && e.hooks.some((h) => h.command.includes("local-test-hook.mjs")),
  );
  const hook = entry?.hooks.find((h) => h.command.includes("local-test-hook.mjs"));
  check(Boolean(hook), "settings.json wires local-test-hook.mjs for Bash|PowerShell");
  if (hook) {
    const shells = [process.platform === "win32" ? testShell() : "bash"];
    if (spawnSync("dash", ["-c", "true"], { windowsHide: true }).status === 0) shells.push("dash");
    else console.log("NOTE: dash is not installed; the POSIX-shell pass is skipped");
    for (const shell of shells) {
      const run = (payload) =>
        spawnSync(shell, ["-c", hook.command], {
          windowsHide: true,
          input: payload,
          encoding: "utf8",
          env: { ...process.env, CLAUDE_PROJECT_DIR: root },
        });
      const wire = (label, payload, expectDeny) => {
        const r = run(payload);
        const out = r.stdout ?? "";
        let parsed = null;
        try {
          parsed = out ? JSON.parse(out) : null;
        } catch {}
        const denied = parsed?.hookSpecificOutput?.permissionDecision === "deny";
        const ok =
          r.status === 0 &&
          !(r.stderr ?? "").trim() &&
          denied === expectDeny &&
          (expectDeny ? typeof parsed.hookSpecificOutput.permissionDecisionReason === "string" : out === "");
        check(ok, `[${shell}] ${expectDeny ? "wired deny" : "wired allow"}: ${label}`, `status=${r.status} stderr=${JSON.stringify(r.stderr)} stdout=${JSON.stringify(out)}`);
      };
      const payload = (tool_name, tool_input, cwd = tree) => JSON.stringify({ tool_name, tool_input, cwd });
      wire("Bash whole-package vitest", payload("Bash", { command: "cd packages/sparkdown && npx vitest run" }), true);
      wire("PowerShell package npm test", payload("PowerShell", { command: "Set-Location packages/sparkdown; npm test" }), true);
      wire("PowerShell bare typecheck", payload("PowerShell", { command: "npm run typecheck" }), true);
      wire("Bash single file", payload("Bash", { command: `cd packages/sparkdown && npx vitest run ${FILE} ${CAPS}` }), false);
      wire("Bash single file from the payload's cwd", payload("Bash", { command: `npx vitest run ${FILE}` }, resolve(tree, "packages", "sparkdown")), false);
      wire("Bash npm t, whose payload has no test or typecheck word", payload("Bash", { command: "cd packages/sparkdown && npm t" }, tree), true);
      wire("PowerShell npm tst", payload("PowerShell", { command: "npm --prefix packages/sparkdown tst" }, tree), true);
      wire("Bash suite runner", payload("Bash", { command: "node scripts/test-suite.mjs start packages/sparkdown" }), false);
      wire("PowerShell filtered typecheck", payload("PowerShell", { command: "npm run typecheck -- packages/sparkdown/tsconfig.json" }), false);
      wire("the phrase only in the description", payload("Bash", { command: "git status", description: "before npm test" }), false);
      wire("payload without tool_input", payload("Bash", undefined), false);
      wire("unparseable payload mentioning vitest", "{not json npx vitest run", true);
      wire("unparseable payload without a test run", "{not json", false);
    }
  }
}

console.log(failed === 0 ? "all checks passed" : `${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
