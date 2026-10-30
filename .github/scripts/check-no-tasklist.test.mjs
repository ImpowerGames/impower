import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findTaskList } from "./check-no-tasklist.mjs";

const passes = [
  "",
  undefined,
  "## Summary\n\nType: bug fix\n",
  "Tests run: full suite, all green.",
  "-[ ] no space after the dash isn't a list item",
  "See the note about #465 for background.",
  "<!--\n- [ ] Bug fix\n-->",
  "```md\n- [ ] Bug fix\n```",
];

const fails = [
  "- [ ] Bug fix",
  "- [x] Bug fix",
  "* [ ] Bug fix",
  "+ [ ] Bug fix",
  "1. [ ] Bug fix",
  "2) [X] Bug fix",
  "  - [ ] indented under another line",
  "## Checklist\n\n- [ ] Tests pass locally",
];

for (const body of passes) {
  const found = findTaskList(body);
  assert.equal(found, null, `expected no match for ${JSON.stringify(body)}, got ${JSON.stringify(found)}`);
}
for (const body of fails) {
  const found = findTaskList(body);
  assert.ok(found, `expected a match for ${JSON.stringify(body)}`);
}

console.log(`ok: ${passes.length} clean bodies, ${fails.length} bodies with task-list syntax`);

const scriptSource = readFileSync(
  fileURLToPath(new URL("./check-no-tasklist.mjs", import.meta.url)),
  "utf8",
);
const spaceDir = mkdtempSync(join(tmpdir(), "check no tasklist "));
const scriptCopy = join(spaceDir, "check-no-tasklist.mjs");
writeFileSync(scriptCopy, scriptSource);

function runScript(prBody) {
  return spawnSync(process.execPath, [scriptCopy], {
    encoding: "utf8",
    windowsHide: true,
    env: { ...process.env, PR_BODY: prBody },
  });
}

try {
  const failing = runScript("- [ ] do the thing");
  assert.equal(
    failing.status,
    1,
    `expected the script run as a subprocess to exit 1 on a body with task-list syntax, got ${failing.status} (stdout: ${JSON.stringify(failing.stdout)}, stderr: ${JSON.stringify(failing.stderr)})`,
  );
  assert.match(
    failing.stdout,
    /^FAIL/,
    `expected the subprocess to print a FAIL line, got stdout ${JSON.stringify(failing.stdout)}`,
  );

  const passing = runScript("Tests run: full suite, all green.");
  assert.equal(
    passing.status,
    0,
    `expected the script run as a subprocess to exit 0 on a clean body, got ${passing.status} (stdout: ${JSON.stringify(passing.stdout)}, stderr: ${JSON.stringify(passing.stderr)})`,
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
