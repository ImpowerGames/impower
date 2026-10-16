// Run: node .github/scripts/check-linked-issue.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkLinkedIssue } from "./check-linked-issue.mjs";
import { readRepos } from "../../.agents/repos.mjs";

// Both positions of the cutover switch, whatever the committed file says.
const OFF = { ...readRepos(), cutover: false };
const ON = { ...readRepos(), cutover: true };

const passes = [
  "## Summary\n\nDoes a thing.\n\nCloses #394\n",
  "Fixes #394 -- the planner guard was dead code.",
  "resolves #12",
  "Closes: #7",
  "Closed #7",
  `Fixed ${OFF.code}#394`,
  `Resolves https://github.com/${OFF.code}/issues/394`,
  "Closes #12, closes #34",
  "## Summary\n\nTemplate chore.\n\nNo linked issue.\n",
  "no linked issue",
];

const fails = [
  "",
  undefined,
  "## Summary\n\nFixes the game preview freezing on the first click.\n",
  "fix(clock): preserve effective time (#394)",
  "See #394 for background.",
  "Closes #",
  'Closes #\n\n<!-- Keep the line above ... "Closes #12, closes #34" ... -->',
  "<!-- No linked issue. -->",
  "Fixes issue 394",
];

for (const body of passes) {
  const r = checkLinkedIssue(body, OFF);
  assert.ok(r.ok, `expected pass for ${JSON.stringify(body)}: ${r.reason}`);
}
for (const body of fails) {
  const r = checkLinkedIssue(body, OFF);
  assert.ok(!r.ok, `expected fail for ${JSON.stringify(body)}: ${r.reason}`);
}

console.log(
  `ok: switch off, ${passes.length} passing bodies, ${fails.length} failing bodies`,
);

// With the switch on, tickets live in the internal repository: a bare #N
// names a pull request in the code repository, so it passes only beside a
// closing reference to the internal repository.
const internalPasses = [
  `Closes ${ON.internal}#5`,
  `Closes #5\nCloses ${ON.internal}#5`,
  `Closes #5, closes ${ON.internal}#6`,
  `Fixes https://github.com/${ON.internal}/issues/5`,
  `resolves ${ON.internal.toUpperCase()}#5`,
  "No linked issue.",
];
const internalFails = [
  "Closes #5",
  "Closes #5, closes #6",
  `Fixed ${ON.code}#394`,
  `Resolves https://github.com/${ON.code}/issues/394`,
  `Closes ${ON.internal}-old#5`,
  `See ${ON.internal}#5`,
  `<!-- Closes ${ON.internal}#5 -->\nCloses #5`,
  "",
];
for (const body of internalPasses) {
  const r = checkLinkedIssue(body, ON);
  assert.ok(r.ok, `expected pass with the switch on for ${JSON.stringify(body)}: ${r.reason}`);
}
for (const body of internalFails) {
  const r = checkLinkedIssue(body, ON);
  assert.ok(!r.ok, `expected fail with the switch on for ${JSON.stringify(body)}: ${r.reason}`);
  assert.ok(r.reason.includes(`Closes ${ON.internal}#123`), `the failure names the internal form: ${r.reason}`);
}
assert.match(checkLinkedIssue("Closes #5", ON).reason, /found "Closes #5", which names no issue there/);

console.log(
  `ok: switch on, ${internalPasses.length} passing bodies, ${internalFails.length} failing bodies`,
);

// The entry-point guard (`import.meta.url === pathToFileURL(process.argv[1]).href`)
// only runs when the script is invoked as a subprocess, the way CI and the
// documented local check both run it — importing checkLinkedIssue above never
// exercises it. Run the real on-disk script for real, from a copy in a
// directory whose name has a space in it: a plain path collapses a raw
// `file://${argv[1]}` template and pathToFileURL(argv[1]).href to the same
// string on POSIX, which would let a broken guard pass here on Linux even
// though it is exactly what leaves the guard silently no-op on Windows; a
// space forces the two to diverge (one percent-encodes it, the other does
// not) on every platform, so this exercises the real bug wherever it runs,
// not only on the platform this suite happens to execute on.
const scriptSource = readFileSync(
  fileURLToPath(new URL("./check-linked-issue.mjs", import.meta.url)),
  "utf8",
);
// The script reads the switch from .agents/repos.json two levels up, so the
// copy keeps that layout.
const spaceDir = mkdtempSync(join(tmpdir(), "check linked issue "));
mkdirSync(join(spaceDir, ".github", "scripts"), { recursive: true });
mkdirSync(join(spaceDir, ".agents"));
const scriptCopy = join(spaceDir, ".github", "scripts", "check-linked-issue.mjs");
writeFileSync(scriptCopy, scriptSource);
for (const name of ["repos.mjs", "repos.json"]) writeFileSync(join(spaceDir, ".agents", name), readFileSync(fileURLToPath(new URL(`../../.agents/${name}`, import.meta.url))));

function runScript(prBody) {
  return spawnSync(process.execPath, [scriptCopy], {
    encoding: "utf8",
    windowsHide: true,
    env: { ...process.env, PR_BODY: prBody },
  });
}

try {
  const failing = runScript("this body has no closing reference");
  assert.equal(
    failing.status,
    1,
    `expected the script run as a subprocess to exit 1 on a body with no closing reference, got ${failing.status} (stdout: ${JSON.stringify(failing.stdout)}, stderr: ${JSON.stringify(failing.stderr)})`,
  );
  assert.match(
    failing.stdout,
    /^FAIL/,
    `expected the subprocess to print a FAIL line, got stdout ${JSON.stringify(failing.stdout)}`,
  );

  const passing = runScript("No linked issue.");
  assert.equal(
    passing.status,
    0,
    `expected the script run as a subprocess to exit 0 on a body that says "No linked issue.", got ${passing.status} (stdout: ${JSON.stringify(passing.stdout)}, stderr: ${JSON.stringify(passing.stderr)})`,
  );
  assert.match(
    passing.stdout,
    /^PASS/,
    `expected the subprocess to print a PASS line, got stdout ${JSON.stringify(passing.stdout)}`,
  );
} finally {
  rmSync(spaceDir, { recursive: true, force: true });
}

console.log(
  "ok: entry-point guard runs main() when invoked as a subprocess, on a passing and a failing body, from a path with a space",
);
