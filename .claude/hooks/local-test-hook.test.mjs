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
import { MAX_FILES } from "../../.agents/hooks/local-test-hook.mjs";

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
// Enough existing files to spell out a run wider than the hook's bound.
const MANY = Array.from({ length: MAX_FILES + 1 }, (_, i) => `src/tests/compiler/Many${i}.test.ts`);
for (const file of MANY) put(`packages/sparkdown/${file}`, "");
const AT_BOUND = MANY.slice(1).join(" ");
const PAST_BOUND = MANY.join(" ");
const SEVEN = MANY.slice(2).join(" ");
// A package whose test script runs Node's own runner, as
// scripts/agent-notification-alerts does, and one whose test script hands
// off to another script.
put("packages/alerts/package.json", JSON.stringify({ scripts: { test: "node --test" } }));
put("packages/relay/package.json", JSON.stringify({ scripts: { test: "npm run test:unit", "test:unit": "node --test" } }));
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
  ["the suite runner start", "node scripts/test-suite.mjs start packages/sparkdown"],
  ["the suite runner start with --wait", "node scripts/test-suite.mjs start packages/sparkdown --wait 600"],
  ["the suite runner start by a Windows path", "node .\\scripts\\test-suite.mjs start packages/sparkdown"],
  ["the suite runner start by an absolute path", "node C:/repo/scripts/test-suite.mjs start packages/sparkdown"],
  ["the suite runner start through node.exe", "node.exe scripts/test-suite.mjs start packages/sparkdown"],
  ["node options before the suite runner start", "node --max-old-space-size=1024 --require node:path scripts/test-suite.mjs start packages/sparkdown"],
  ["the suite runner start after a cd", "cd packages/sparkdown && node ../../scripts/test-suite.mjs start ."],
  ["the suite runner start after Set-Location", "Set-Location packages/sparkdown; node ../../scripts/test-suite.mjs start ."],
  ["the suite runner start through cmd /c", 'cmd /c "node scripts/test-suite.mjs start packages/sparkdown"'],
  ["the suite runner start through unquoted cmd /c", "cmd /c node scripts/test-suite.mjs start packages/sparkdown"],
  ["the suite runner start through pwsh -Command", 'pwsh -Command "node scripts/test-suite.mjs start packages/sparkdown"'],
  ["the suite runner start inside bash -c", "bash -c 'node scripts/test-suite.mjs start packages/sparkdown'"],
  ["the suite runner start in a substitution", 'OUT="$(node scripts/test-suite.mjs start packages/sparkdown)"'],
  ["the suite runner start after another command", "git status && node scripts/test-suite.mjs start packages/sparkdown"],
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
  // Review round 2 (PR #767): unlisted option values, npm test commands, wrappers.
  ["npm run with an unlisted --cache value before test:run", "cd packages/sparkdown && npm run --cache C:/tmp/npm-cache test:run"],
  ["npm with an unlisted --registry value before test", "npm --registry https://registry.npmjs.org test"],
  ["npm run with an unlisted --registry value before test", "npm run --registry https://registry.npmjs.org test"],
  ["pnpm with an unlisted --reporter value before test", "pnpm --reporter append-only test"],
  ["npx with a --workspace value before vitest", "npx --workspace packages/sparkdown vitest run"],
  ["npm with an unlisted value before the root typecheck", "npm --registry https://registry.npmjs.org run typecheck"],
  ["npm install-test", "npm install-test"],
  ["npm it", "npm it"],
  ["npm install-ci-test", "npm install-ci-test"],
  ["npm cit", "npm cit"],
  ["npm clean-install-test", "npm clean-install-test"],
  ["npm sit", "npm sit"],
  ["npm tes", "npm tes"],
  ["npm run-s test", "npm run-s test"],
  ["cmd /c call npm run test:run", "cd packages/sparkdown && cmd /c call npm run test:run"],
  ["cmd /c with a quoted npm test", 'cmd /c "npm test"'],
  ["corepack with a quoted package manager", 'corepack "pnpm" test'],
  // Review round 3 (PR #767): values that read as management words, cmd prefixes, separators, specs, preloads.
  ["an npm option value that reads as install before exec vitest", "cd packages/sparkdown && npm --cache install exec -- vitest run"],
  ["npm exec with an option value that reads as install", "cd packages/sparkdown && npm exec --cache install -- vitest run"],
  ["cmd /c @call npm run test:run", "cd packages/sparkdown && cmd /c @call npm run test:run"],
  ["cmd /c @npm test", "cd packages/sparkdown && cmd /c @npm test"],
  ["npm -- test", "cd packages/sparkdown && npm -- test"],
  ["npm -- run typecheck at the root", "npm -- run typecheck"],
  ["npx with a versioned vitest spec", "cd packages/sparkdown && npx vitest@2.1.9 run"],
  ["npm exec with a versioned vitest spec", "cd packages/sparkdown && npm exec -- vitest@2.1.9 run"],
  ["pnpm dlx with a versioned vitest spec", "cd packages/sparkdown && pnpm dlx vitest@2.1.9 run"],
  ["the typecheck script as an --import preload before -e", "node --import ./scripts/typecheck.mjs -e 0"],
  ["the typecheck script as a glued --import preload", "node --import=./scripts/typecheck.mjs -e 0"],
  ["cmd cd /d to the root before the typecheck", 'cd packages/sparkdown && cmd /c "cd /d ../.. && npm run typecheck"'],
  ["a test script that hands off to another script", "cd packages/relay && npm test"],
  // A package run spelled out as a list of existing files.
  ["vitest on more existing files than the bound", `cd packages/sparkdown && npx vitest run ${PAST_BOUND}`],
  ["the suite runner run on more files than the bound", `node scripts/test-suite.mjs run packages/sparkdown ${PAST_BOUND} --wait 600`],
  ["the suite runner run past the bound with --wait first", `node scripts/test-suite.mjs run packages/sparkdown --wait 600 ${PAST_BOUND}`],
  ["the suite runner run past the bound through cmd /c", `cmd /c "node scripts/test-suite.mjs run packages/sparkdown ${PAST_BOUND}"`],
  ["the suite runner run past the bound inside bash -c", `bash -c 'node scripts/test-suite.mjs run packages/sparkdown ${PAST_BOUND}'`],
  // A genuine extra file is still counted past a redirect or a pipe.
  ["the suite runner past the bound with a redirect", `node scripts/test-suite.mjs run packages/sparkdown ${PAST_BOUND} --wait 600 > run.log 2>&1`],
  ["the suite runner past the bound with a PowerShell redirect", `node scripts/test-suite.mjs run packages/sparkdown ${PAST_BOUND} --wait 600 *> run.log`],
  ["the suite runner past the bound with a redirect attached to the last file", `node scripts/test-suite.mjs run packages/sparkdown ${PAST_BOUND}> run.log 2>&1`, "bash"],
  ["the suite runner at the bound plus a quoted word that only looks like a redirect", `node scripts/test-suite.mjs run packages/sparkdown ${AT_BOUND} ">x.test.ts" --wait 600`],
  ["the suite runner past the bound with a quoted last file and an attached redirect", `node scripts/test-suite.mjs run packages/sparkdown ${SEVEN} "My file8.test.ts" "More.test.ts"> run.log`, "bash"],
  ["the suite runner with a Bash escaped apostrophe that is not a quote", `node scripts/test-suite.mjs run packages/sparkdown ${SEVEN} O\\'Neil.test.ts More.test.ts --wait 600`, "bash"],
  ["the suite runner at the bound with a Bash star glob before a redirect", `node scripts/test-suite.mjs run packages/sparkdown ${AT_BOUND} *> /dev/null`, "bash"],
  ["the suite runner at the bound plus a PowerShell doubled-quote word that only looks like --wait", `node scripts/test-suite.mjs run packages/sparkdown ${AT_BOUND} '--wa''it' ${MANY[0]} > run.log`, "powershell"],
  ["the suite runner at the bound plus a PowerShell word that only ends in an angle bracket", `node scripts/test-suite.mjs run packages/sparkdown ${AT_BOUND}> run.log`, "powershell"],
  ["a quoted executable after a wrapper option value that looks like an assignment", "env -C = 'vitest' run"],
  ["a quoted npm test after a wrapper option value that looks like an assignment", "env -C = 'npm' test"],
  ["a quoted suite runner start after a wrapper option value that looks like an assignment", "env -C = 'node' scripts/test-suite.mjs start packages/sparkdown"],
  ["the suite runner at the bound plus a literal quoted file", `node scripts/test-suite.mjs run packages/sparkdown ${AT_BOUND} "${MANY[0]}" --wait 600 > run.log`],
  ["the suite runner with a file after the redirect pushing it past the bound", `node scripts/test-suite.mjs run packages/sparkdown ${AT_BOUND} > run.log ${MANY[0]} --wait 600`],
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
  ["node with a --require value before the suite runner's run", `node --require node:path scripts/test-suite.mjs run packages/sparkdown ${FILE} --wait 600`],
  ["the suite runner run on a file", `node scripts/test-suite.mjs run packages/sparkdown ${FILE} --wait 600`],
  ["the suite runner run through cmd /c", `cmd /c "node scripts/test-suite.mjs run packages/sparkdown ${FILE}"`],
  ["vitest on exactly the bound of existing files", `cd packages/sparkdown && npx vitest run ${AT_BOUND}`],
  ["the suite runner run on exactly the bound of files", `node scripts/test-suite.mjs run packages/sparkdown ${AT_BOUND} --wait 600`],
  ["the suite runner run at the bound with --wait first", `node scripts/test-suite.mjs run packages/sparkdown --wait 600 ${AT_BOUND}`],
  ["the suite runner resume", "node scripts/test-suite.mjs resume .git/test-suites/run-1 --wait 600"],
  ["the suite runner resume with a retry", "node scripts/test-suite.mjs resume .git/test-suites/run-1 --retry src/tests/a.test.ts"],
  ["the suite runner status by absolute path", "node C:/repo/scripts/test-suite.mjs status .git/test-suites/run-1"],
  ["start only as data for node -e", 'node -e "0" scripts/test-suite.mjs start packages/sparkdown'],
  ["the suite runner start inside a quoted string", "echo 'node scripts/test-suite.mjs start packages/sparkdown'"],
  ["vitest with a valueless flag outside the old list", `cd packages/sparkdown && npx vitest run --disableConsoleIntercept ${FILE} ${CAPS}`],
  ["vitest with a --no- negation before the file", `cd packages/sparkdown && npx vitest run --no-isolate ${FILE}`],
  ["node -e with the typecheck path only as data", 'node -e "console.log(process.argv[1])" scripts/typecheck.mjs'],
  ["a yarn workspace package typecheck", "yarn workspace @impower/sparkdown typecheck"],
  ["a yarn workspace package typecheck through run", "yarn workspace @impower/sparkdown run typecheck"],
  ["an npm install of a package", "npm install --save-dev vitest-environment-x"],
  ["npm view of a package named test", "npm view test"],
  ["npm install of a package named test", "npm install test"],
  ["npm view of a package named typecheck at the root", "npm view typecheck"],
  ["npm exec with vitest only as --package", "npm exec --package vitest -- eslint --version"],
  ["node -pe with the typecheck path only as data", 'node -pe "process.argv[1]" scripts/typecheck.mjs'],
  ["npm test in a package whose test script runs node --test", "cd packages/alerts && npm test"],
  ["an npm install of vitest itself", "cd packages/sparkdown && npm install -D vitest"],
  ["a pnpm add of vitest", "pnpm add -D vitest"],
  ["cmd /c on a single file", `cmd /c "cd packages/sparkdown && npx vitest run ${FILE}"`],
  ["an install", "PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install"],
  ["the tooling checks", "node scripts/check-agent-tooling.mjs"],
  ["a hook test", "node .claude/hooks/local-test-hook.test.mjs"],
  ["the phrase inside a quoted string", "echo 'npx vitest run is refused here'"],
  ["the phrase inside a here-doc body", "cat > note.md <<'EOF'\nnpm test\nnpm run typecheck\nEOF"],
  ["the phrase in a comment", "git status # then npm test"],
  ["a grep for vitest", "grep -rn 'vitest run' .agents"],
  ["a process listing that names vitest", "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*vitest*' }"],
  // Redirections after a bounded run are not test files.
  ["the suite runner at the bound with a redirect and merged stderr", `node scripts/test-suite.mjs run packages/sparkdown ${AT_BOUND} --wait 600 > run.log 2>&1`],
  ["the suite runner at the bound with a redirect, a chained echo and a grep", `node scripts/test-suite.mjs run packages/sparkdown ${AT_BOUND} --wait 600 > run.log 2>&1; echo exit $?; grep -E "Tests" run.log`],
  ["the suite runner at the bound with separate stdout and stderr redirects", `node scripts/test-suite.mjs run packages/sparkdown ${AT_BOUND} --wait 600 1> out.log 2> err.log`],
  ["the suite runner at the bound with glued redirect targets", `node scripts/test-suite.mjs run packages/sparkdown ${AT_BOUND} --wait 600 >out.log 2>err.log`],
  ["the suite runner at the bound with a merged-stderr pipe", `node scripts/test-suite.mjs run packages/sparkdown ${AT_BOUND} --wait 600 2>&1 | grep -E "Tests"`],
  ["the suite runner at the bound with a quoted redirect target", `node scripts/test-suite.mjs run packages/sparkdown ${AT_BOUND} --wait 600 > "my run.log" 2>&1`],
  ["the suite runner at the bound with a PowerShell all-streams redirect and chained filter", `node scripts/test-suite.mjs run packages/sparkdown ${AT_BOUND} --wait 900 *> run.log; "exit $LASTEXITCODE"; Select-String -Path run.log -Pattern "Tests"`, "powershell"],
  ["the suite runner at the bound with a redirect before the files", `node scripts/test-suite.mjs run packages/sparkdown > run.log ${AT_BOUND} --wait 600`],
  // A command that only mentions the vitest binary's path is not a Vitest call.
  ["a PowerShell wait on the installed vitest.cmd", "$p = 'C:/w/node_modules/.bin/vitest.cmd'; $i=0; while (-not (Test-Path $p) -and $i -lt 110) { Start-Sleep 5; $i++ }; Test-Path $p"],
  ["a PowerShell assignment of a double-quoted vitest path", '$p = "C:/w/node_modules/.bin/vitest.cmd"; Test-Path $p'],
  ["the suite runner at the bound with a glued quoted redirect destination", `node scripts/test-suite.mjs run packages/sparkdown ${AT_BOUND} --wait 600 >"my run.log" 2>&1`],
  ["the suite runner at the bound with a glued quoted descriptor redirect", `node scripts/test-suite.mjs run packages/sparkdown ${AT_BOUND} --wait 600 2>"err log.txt"`],
  ["the suite runner at the bound with a redirect attached to the last file", `node scripts/test-suite.mjs run packages/sparkdown ${AT_BOUND}> run.log 2>&1`, "bash"],
  ["the suite runner at the bound with a redirect and target attached to the last file", `node scripts/test-suite.mjs run packages/sparkdown ${AT_BOUND}>run.log`, "bash"],
  ["the suite runner at the bound with a merged-stderr duplication attached to the last file", `node scripts/test-suite.mjs run packages/sparkdown ${AT_BOUND}>&2`, "bash"],
  ["the suite runner at the bound with a quoted target after an attached redirect", `node scripts/test-suite.mjs run packages/sparkdown ${AT_BOUND}> "my run.log"`, "bash"],
  ["the suite runner at the bound with a redirect attached to the last file before --wait", `node scripts/test-suite.mjs run packages/sparkdown ${AT_BOUND} --wait 600> run.log`, "bash"],
  ["the suite runner at the bound with a quoted last file and an attached redirect", `node scripts/test-suite.mjs run packages/sparkdown ${SEVEN} "My file8.test.ts"> run.log`, "bash"],
  ["the suite runner at the bound with a partly quoted last file and an attached redirect", `node scripts/test-suite.mjs run packages/sparkdown ${SEVEN} My" file8".test.ts> run.log`, "bash"],
  ["the suite runner at the bound with a quoted --wait value and an attached redirect", `node scripts/test-suite.mjs run packages/sparkdown ${AT_BOUND} --wait "600"> run.log`, "bash"],
  ["the suite runner at the bound with two redirects in one word", `node scripts/test-suite.mjs run packages/sparkdown ${AT_BOUND}>other.log> run.log`, "bash"],
  ["the suite runner at the bound with a redirect between --wait and its value", `node scripts/test-suite.mjs run packages/sparkdown ${AT_BOUND} --wait > run.log 600`],
  ["the suite runner at the bound with an input redirect and a descriptor duplication", `node scripts/test-suite.mjs run packages/sparkdown ${AT_BOUND} --wait 600 < in.txt 2>&1`],
  ["the suite runner at the bound with a Bash line continuation", `node scripts/test-suite.mjs run packages/sparkdown ${SEVEN} \\\n${MANY[1]} --wait 600`, "bash"],
  ["the suite runner at the bound with a PowerShell line continuation", `node scripts/test-suite.mjs run packages/sparkdown ${SEVEN} \`\n${MANY[1]} --wait 600`, "powershell"],
  ["the suite runner at the bound with an escaped space in a Bash redirect target", `node scripts/test-suite.mjs run packages/sparkdown ${AT_BOUND} > my\\ run.log`, "bash"],
  ["the suite runner at the bound with an escaped space in a PowerShell redirect target", `node scripts/test-suite.mjs run packages/sparkdown ${AT_BOUND} > my\` run.log`, "powershell"],
  ["the suite runner at the bound with a Bash redirect target after a continuation", `node scripts/test-suite.mjs run packages/sparkdown ${AT_BOUND} > \\\n    run.log`, "bash"],
  ["the suite runner at the bound with a PowerShell redirect target after a continuation", `node scripts/test-suite.mjs run packages/sparkdown ${AT_BOUND} > \`\n    run.log`, "powershell"],
  ["the suite runner at the bound with a Bash redirect target after a CRLF continuation", `node scripts/test-suite.mjs run packages/sparkdown ${AT_BOUND} > \\\r\n    run.log`, "bash"],
  ["the suite runner at the bound with a Bash escape before an ordinary letter in --wait", `node scripts/test-suite.mjs run packages/sparkdown ${AT_BOUND} --w\\ait 600 > run.log`, "bash"],
  ["the suite runner at the bound with a Bash continuation inside double quotes", `node scripts/test-suite.mjs run packages/sparkdown ${AT_BOUND} "--wa\\\nit" 600 > run.log`, "bash"],
  ["a Bash star redirect that expands to a program-less word before a vitest path argument", "*> run.log C:/w/node_modules/.bin/vitest.cmd", "bash"],
  ["the suite runner at the bound with a PowerShell star redirect", `node scripts/test-suite.mjs run packages/sparkdown ${AT_BOUND} *> run.log`, "powershell"],
  ["a glued PowerShell assignment of a quoted vitest path", "$p='C:/w/node_modules/.bin/vitest.cmd'; Write-Output $p"],
  ["a PowerShell assignment with the operator glued to the target", "$p= 'C:/w/node_modules/.bin/vitest.cmd'; Test-Path $p"],
  ["a PowerShell append assignment of a quoted vitest path", "$p += 'C:/w/node_modules/.bin/vitest.cmd'"],
  ["Test-Path on the vitest.cmd path", "Test-Path 'C:/w/node_modules/.bin/vitest.cmd'"],
  ["Get-Item on the vitest.cmd path", "Get-Item C:/w/node_modules/.bin/vitest.cmd"],
  ["an empty command", ""],
  ["a non-string command", null],
];

for (const [label, command, shell] of denies) {
  const reason = decide(command, shell, tree);
  check(typeof reason === "string" && reason.length > 0, `denied: ${label}`, JSON.stringify(reason));
}
for (const [label, command, shell] of allows) {
  const reason = decide(command, shell, tree);
  check(reason === null, `allowed: ${label}`, JSON.stringify(reason));
}

// The reasons name what to run instead and where the wider result comes from.
{
  const test = decide("cd packages/sparkdown && npx vitest run", "bash", tree);
  check(/scripts\/test-suite\.mjs run packages\/\S+ src\/tests\/\S+\.test\.ts --wait \d+/.test(test), "the test reason names the single-file command", JSON.stringify(test));
  check(/references\/vitest\.md/.test(test), "the test reason names the reference it comes from", JSON.stringify(test));
  check(/Test Suite workflow/.test(test), "the test reason names the Test Suite workflow", JSON.stringify(test));
  check(/scripts\/test-suite\.mjs/.test(test), "the test reason names the suite runner", JSON.stringify(test));
  check(!/\bstart\b/.test(test), "the test reason does not offer the suite runner's start", JSON.stringify(test));
  const start = decide("node scripts/test-suite.mjs start packages/sparkdown", "bash", tree);
  check(/no override/.test(start) && /Test Suite workflow/.test(start), "the start reason names the refusal and the workflow", JSON.stringify(start));
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
      wire("Bash suite runner start", payload("Bash", { command: "node scripts/test-suite.mjs start packages/sparkdown" }), true);
      wire("PowerShell suite runner start", payload("PowerShell", { command: "node scripts/test-suite.mjs start packages/sparkdown --wait 600" }), true);
      wire("Bash suite runner run", payload("Bash", { command: `node scripts/test-suite.mjs run packages/sparkdown ${FILE} --wait 600` }), false);
      wire("Bash suite runner status", payload("Bash", { command: "node scripts/test-suite.mjs status .git/test-suites/run-1" }), false);
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
