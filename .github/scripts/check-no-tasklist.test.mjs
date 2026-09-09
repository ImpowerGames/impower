// Run: node .github/scripts/check-no-tasklist.test.mjs
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

// The entry-point guard (`import.meta.url === pathToFileURL(process.argv[1]).href`)
// only runs when the script is invoked as a subprocess, the way CI and the
// documented local check both run it — importing findTaskList above never
// exercises it. Run the real on-disk script for real, from a copy in a
// directory whose name has a space in it: a plain path collapses a raw
// `file://${argv[1]}` template and pathToFileURL(argv[1]).href to the same
// string on POSIX, which would let a broken guard pass here on Linux even
// though it is exactly what leaves the guard silently no-op on Windows; a
// space forces the two to diverge (one percent-encodes it, the other does
// not) on every platform, so this exercises the real bug wherever it runs,
// not only on the platform this suite happens to execute on.
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
