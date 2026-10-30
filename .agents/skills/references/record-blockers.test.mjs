import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readRepos } from "../../repos.mjs";
import { statedBlockers, recordBlockers, describe } from "./record-blockers.mjs";

assert.deepEqual(statedBlockers("Split from #676. Unblocked."), []);
assert.deepEqual(statedBlockers("Split from #720. Not blocked."), []);
assert.deepEqual(statedBlockers("Split from #720. Blocked by #721 (a `>` anywhere in a line) and #722 (the spacing of `..`).\n\nBody mentions #9."), [721, 722]);
assert.deepEqual(statedBlockers("- Split from #720, the design of record. Blocked by #721 and #722.\n\nSee #1."), [721, 722]);
assert.deepEqual(statedBlockers("Blocked by #5, #6 and #5. Related to #7."), [5, 6]);
assert.deepEqual(statedBlockers("Blocked by #5 (see PR #8. It explains) and #6"), [5, 8, 6]);
assert.deepEqual(statedBlockers("Split from #1.\r\nBlocked by #2.\r\n"), [2]);
assert.deepEqual(statedBlockers("Blocked by #721 and\n#722."), [721, 722]);
assert.deepEqual(statedBlockers("Blocked by #721\r\n\r\n#722 is related."), [721]);
assert.deepEqual(statedBlockers("- Blocked by #721\n- #722 is related"), [721]);
assert.deepEqual(statedBlockers("1. Blocked by #721\n2) #722 is related"), [721]);
assert.deepEqual(statedBlockers("> Blocked by #721\n## #722 notes"), [721]);
assert.deepEqual(statedBlockers("This Task is not Blocked by #5. Blocked by #6."), [6]);
assert.deepEqual(statedBlockers("Dependencies: Blocked by #7."), [7]);
assert.deepEqual(statedBlockers("Blocked by #721.Related note mentions #999."), [721]);
assert.deepEqual(statedBlockers("Blocked by #721 and `#999`."), [721]);
assert.deepEqual(statedBlockers("Blocked by #900 (matches the `#1`-prefixed scheme)."), [900]);
assert.deepEqual(statedBlockers("Blocked by #5 (`a. B`) and #6."), [5, 6]);
assert.deepEqual(statedBlockers("Blocked by #721 and ``#999 `literal` ``."), [721]);
assert.deepEqual(statedBlockers("Blocked by ``a`` #5 and `b` #6."), [5, 6]);
assert.deepEqual(statedBlockers("```\nBlocked by #3.\n```\nText."), []);
assert.deepEqual(statedBlockers("Blocked by other/repo#4 and #5."), [5]);

function fakeTracker(bodies, links) {
  const posted = [];
  return {
    posted,
    body: (n) => bodies[n],
    id: (n) => 1000 + n,
    blockedBy: (n) => (links[n] ?? []).map((number) => ({ number })),
    add: (n, id) => {
      posted.push([n, id]);
      (links[n] ??= []).push(id - 1000);
    },
  };
}

{
  const tracker = fakeTracker({ 723: "Split from #720. Blocked by #721 and #722." }, { 723: [721] });
  const result = recordBlockers(723, tracker);
  assert.deepEqual(tracker.posted, [[723, 1722]]);
  assert.deepEqual(result.added, [722]);
  assert.deepEqual(result.after, [721, 722]);
  assert.deepEqual(result.absent, []);
  assert.match(describe(result), /added #722/);
}

{
  const tracker = fakeTracker({ 10: "Blocked by #11." }, {});
  const result = recordBlockers(10, tracker, { dryRun: true });
  assert.deepEqual(tracker.posted, []);
  assert.match(describe(result), /would add #11/);
}

{
  const tracker = fakeTracker({ 20: "Blocked by #21." }, { 20: [99] });
  tracker.add = () => {};
  const result = recordBlockers(20, tracker);
  assert.deepEqual(result.absent, [21]);
  assert.deepEqual(result.unstated, [99]);
  assert.match(describe(result), /still missing after posting: #21/);
}

assert.throws(() => recordBlockers(30, fakeTracker({ 30: "Blocked by #30." }, {})), /states itself/);

{
  const repos = readRepos();
  const scratch = mkdtempSync(join(tmpdir(), "record-blockers-repos-"));
  console.log(`Scratch directory: ${scratch}`);
  try {
    for (const [cutover, expected] of [[false, repos.code], [true, repos.internal]]) {
      const dir = join(scratch, cutover ? "on" : "off", ".agents", "skills", "references");
      mkdirSync(dir, { recursive: true });
      copyFileSync(fileURLToPath(new URL("./record-blockers.mjs", import.meta.url)), join(dir, "record-blockers.mjs"));
      copyFileSync(fileURLToPath(new URL("../../repos.mjs", import.meta.url)), join(dir, "..", "..", "repos.mjs"));
      writeFileSync(join(dir, "..", "..", "repos.json"), JSON.stringify({ ...repos, cutover }));
      const copy = await import(pathToFileURL(join(dir, "record-blockers.mjs")).href);
      const calls = [];
      const client = copy.ghClient(undefined, (args) => (calls.push(args), JSON.stringify({ body: "Blocked by #2.", id: 9 })));
      const result = copy.recordBlockers(1, { ...client, blockedBy: () => [] }, { dryRun: true });
      assert.equal(client.repo, expected);
      assert.deepEqual(calls, [["api", `repos/${expected}/issues/1`]], `switch ${cutover ? "on" : "off"}`);
      assert.match(copy.describe(result, client.repo), new RegExp(`^${expected}#1: stated #2`));
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

console.log("record-blockers: ok");
