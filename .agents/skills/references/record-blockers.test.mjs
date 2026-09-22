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
// A soft-wrapped sentence keeps its later blockers; a paragraph break ends it.
assert.deepEqual(statedBlockers("Blocked by #721 and\n#722."), [721, 722]);
assert.deepEqual(statedBlockers("Blocked by #721\r\n\r\n#722 is related."), [721]);
// A list item, heading, quote or table row starts its own block.
assert.deepEqual(statedBlockers("- Blocked by #721\n- #722 is related"), [721]);
assert.deepEqual(statedBlockers("1. Blocked by #721\n2) #722 is related"), [721]);
assert.deepEqual(statedBlockers("> Blocked by #721\n## #722 notes"), [721]);
// "Blocked by" counts only at the start of a sentence.
assert.deepEqual(statedBlockers("This Task is not Blocked by #5. Blocked by #6."), [6]);
assert.deepEqual(statedBlockers("Dependencies: Blocked by #7."), [7]);
// A full stop followed by a capital letter ends the sentence even without a space.
assert.deepEqual(statedBlockers("Blocked by #721.Related note mentions #999."), [721]);
// References and full stops inside code spans do not count.
assert.deepEqual(statedBlockers("Blocked by #721 and `#999`."), [721]);
assert.deepEqual(statedBlockers("Blocked by #900 (matches the `#1`-prefixed scheme)."), [900]);
assert.deepEqual(statedBlockers("Blocked by #5 (`a. B`) and #6."), [5, 6]);
// A longer delimiter run may hold shorter backtick runs inside its span.
assert.deepEqual(statedBlockers("Blocked by #721 and ``#999 `literal` ``."), [721]);
assert.deepEqual(statedBlockers("Blocked by ``a`` #5 and `b` #6."), [5, 6]);
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
