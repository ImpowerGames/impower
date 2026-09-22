// Exercises the blocker parser and the record step against a fake tracker.
// Run:
//   node .agents/skills/references/record-blockers.test.mjs

import assert from "node:assert/strict";
import { statedBlockers, recordBlockers, describe } from "./record-blockers.mjs";

// The sentence forms the filing skills produce.
assert.deepEqual(statedBlockers("Split from #676. Unblocked."), []);
assert.deepEqual(statedBlockers("Split from #720. Not blocked."), []);
assert.deepEqual(statedBlockers("Split from #720. Blocked by #721 (a `>` anywhere in a line) and #722 (the spacing of `..`).\n\nBody mentions #9."), [721, 722]);
assert.deepEqual(statedBlockers("- Split from #720, the design of record. Blocked by #721 and #722.\n\nSee #1."), [721, 722]);
assert.deepEqual(statedBlockers("Blocked by #5, #6 and #5. Related to #7."), [5, 6]);
assert.deepEqual(statedBlockers("Blocked by #5 (see PR #8. It explains) and #6"), [5, 8, 6]);
assert.deepEqual(statedBlockers("Split from #1.\r\nBlocked by #2.\r\n"), [2]);
// Fenced code and other repositories' references are not blockers.
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

// Missing blockers are posted by database id and read back; present ones are not reposted.
{
  const tracker = fakeTracker({ 723: "Split from #720. Blocked by #721 and #722." }, { 723: [721] });
  const result = recordBlockers(723, tracker);
  assert.deepEqual(tracker.posted, [[723, 1722]]);
  assert.deepEqual(result.added, [722]);
  assert.deepEqual(result.after, [721, 722]);
  assert.deepEqual(result.absent, []);
  assert.match(describe(result), /added #722/);
}

// A dry run posts nothing and names what it would add.
{
  const tracker = fakeTracker({ 10: "Blocked by #11." }, {});
  const result = recordBlockers(10, tracker, { dryRun: true });
  assert.deepEqual(tracker.posted, []);
  assert.match(describe(result), /would add #11/);
}

// A post that does not persist is reported as missing; unstated entries are left alone.
{
  const tracker = fakeTracker({ 20: "Blocked by #21." }, { 20: [99] });
  tracker.add = () => {};
  const result = recordBlockers(20, tracker);
  assert.deepEqual(result.absent, [21]);
  assert.deepEqual(result.unstated, [99]);
  assert.match(describe(result), /still missing after posting: #21/);
}

// A body naming the ticket itself is refused before anything is posted.
assert.throws(() => recordBlockers(30, fakeTracker({ 30: "Blocked by #30." }, {})), /states itself/);

console.log("record-blockers: ok");
