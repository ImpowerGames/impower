import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkLinkedIssue } from "./check-linked-issue.mjs";
import { readRepos } from "../../.agents/repos.mjs";

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

const scriptSource = readFileSync(
  fileURLToPath(new URL("./check-linked-issue.mjs", import.meta.url)),
  "utf8",
);
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
