import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import * as run from "./issue-run.mjs";
import * as cp from "./checkpoint.mjs";
import * as ig from "./integration.mjs";

const tmp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "container-close-")));
console.log(`scratch: ${tmp}`);

const REPO = "acme/widgets", PARENT = 100, CONTAINER = 200, BLOCKED = 300, MAIN = "a".repeat(40), COORD = "local_c";
const ticket = (number, more = {}) => ({ number, title: `ticket ${number}`, state: "open", parent: PARENT, container: false, effort: "Medium", delivered: false, blockers: [], prs: [], worktrees: [], ...more });
const child = (number, more = {}) => ticket(number, { parent: CONTAINER, state: "closed", stateReason: "completed", closedAt: "2030-01-01T00:00:00Z", delivered: true, ...more });
const blockedBy = (state, delivered = false) => ticket(BLOCKED, { blockers: [{ number: CONTAINER, state, delivered }] });
const snapshotOf = (tickets) => ({ repository: REPO, issue: { number: PARENT, state: "open", title: "parent", criteria: [{ index: 1, text: "Parent works" }], acceptanceSha256: "h" }, observedAt: "now", originMain: MAIN, tickets });
const open = (children = [child(201), child(202)], more = {}) => snapshotOf([ticket(CONTAINER, { container: true, ...more }), ...children, blockedBy("open")]);
const closed = (children = [child(201), child(202)], reason = "completed") => snapshotOf([ticket(CONTAINER, { container: true, state: "closed", stateReason: reason, closedAt: "2030-02-01T00:00:00Z" }), ...children, blockedBy("closed")]);

let serial = 0;
const newRecord = (more = {}) => {
  const dir = path.join(tmp, `run-${++serial}`);
  fs.mkdirSync(dir);
  execFileSync("git", ["init", "-q", dir], { windowsHide: true });
  const file = path.join(dir, "run.json");
  run.initRecord({ record: file, checkout: dir, repository: REPO, issue: PARENT, coordinator: COORD, harness: "claude", coordinatorModel: "claude-opus-5-5", coordinatorEffort: "high", invocation: `Use orchestrate-issues for #${PARENT}.`, concurrency: 2, permissionMode: "bypassPermissions", merging: "coordinator", ...more });
  const record = JSON.parse(fs.readFileSync(file, "utf8"));
  record.checkpoints = { remote: "origin" };
  record.coordinator.since = "2020-01-01T00:00:00Z";
  fs.writeFileSync(file, JSON.stringify(record));
  return file;
};
const plan = (file, snapshot) => run.planDispatch({ record: run.readRecord(file), snapshot, preflights: [], freeBytes: 100 * 2 ** 30, defaults: run.readWriterDefaults(), host: "h" });
const entry = (p, n) => p.tickets.find((t) => t.number === n);

const CRITERIA = ["The header's old link is gone", "Targets are 44px"];
const github = (body = `## Acceptance criteria\n\n${CRITERIA.map((c) => `- [ ] ${c}`).join("\n")}\n`) => {
  const gh = { state: "open", comments: [], calls: [], body };
  gh.client = {
    issue: () => ({ state: gh.state, title: "container", body: gh.body }),
    comments: () => gh.comments,
    createComment: (n, text) => { gh.calls.push("comment"); const c = { id: gh.comments.length + 1, body: text, url: "u" }; gh.comments.push(c); return c; },
    getComment: (id) => gh.comments.find((c) => c.id === id),
    closeIssue: () => { gh.calls.push("close"); gh.state = "closed"; },
  };
  return gh;
};
const closeWith = (file, gh, criteria, { snapshot = open(), ...extra } = {}) => ig.closeContainer(file, {
  coordinator: COORD, expectRevision: run.readRecord(file).revision, ticket: CONTAINER, evidence: { criteria }, takeSnapshot: () => snapshot,
  readScope: () => run.snapshotScope(snapshot), client: gh.client, git: { fetch: () => {}, main: () => MAIN }, ownership: () => [], ...extra,
});
const met = (criterion) => ({ criterion, status: "met", evidence: ["checked on main"] });
const moved = { criterion: CRITERIA[1], status: "moved", movedTo: BLOCKED, reason: "the audit of the blocked ticket checks it" };

try {
  {
    const file = newRecord();
    const p = plan(file, open());
    assert.equal(entry(p, CONTAINER).action, "close-container", "a container whose sub-issues are all delivered is closed next");
    assert.equal(entry(p, BLOCKED).action, "wait-dependency", "its dependent waits while it is open");
    assert.equal(p.complete, false);
    const after = plan(file, closed());
    assert.equal(entry(after, CONTAINER).action, "container");
    assert.match(entry(after, CONTAINER).reason, /closed with every sub-issue delivered/);
    assert.notEqual(entry(after, BLOCKED).action, "wait-dependency", "its dependent is released once it is closed");
  }
  {
    const file = newRecord();
    assert.equal(entry(plan(file, open([child(201), child(202, { state: "open", delivered: false })])), CONTAINER).action, "container", "an open sub-issue keeps it planned individually");
    assert.equal(entry(plan(file, open([child(201), child(202, { delivered: false })])), CONTAINER).action, "container", "a sub-issue closed without its deliverable does not finish it");
    assert.equal(entry(plan(file, snapshotOf([ticket(CONTAINER, { container: true })])), CONTAINER).action, "container", "no listed sub-issue finishes nothing");
    assert.equal(entry(plan(file, closed([child(201), child(202, { delivered: false })])), BLOCKED).action, "wait-dependency", "a closed container with an undelivered sub-issue releases nothing");
    assert.equal(entry(plan(file, closed(undefined, "not_planned")), BLOCKED).action, "wait-dependency", "a container closed as not planned releases nothing");
    const nested = snapshotOf([ticket(CONTAINER, { container: true }), ticket(210, { parent: CONTAINER, container: true }), child(211, { parent: 210 })]);
    assert.deepEqual([entry(plan(file, nested), CONTAINER).action, entry(plan(file, nested), 210).action], ["container", "close-container"], "an inner container closes first");
  }
  {
    const file = newRecord(), gh = github();
    const held = closeWith(file, gh, [met(CRITERIA[0]), { criterion: CRITERIA[1], status: "unmet", gap: "a sibling slice has not landed" }]);
    assert.deepEqual([held.closed, held.verdict, gh.calls, gh.state], [false, "unmet", [], "open"], "an unmet criterion posts and closes nothing");
    const e = entry(plan(file, open()), CONTAINER);
    assert.equal(e.action, "close-container");
    assert.match(e.reason, /stays open/);
    assert.ok(e.reason.includes(`"${CRITERIA[1]}" unmet (a sibling slice has not landed)`), e.reason);
    assert.ok(e.reason.includes(MAIN));
    assert.equal(entry(plan(file, open()), BLOCKED).action, "wait-dependency");
    assert.equal((run.readRecord(file).operations ?? []).length, 0);
  }
  {
    const file = newRecord(), gh = github();
    const done = closeWith(file, gh, [met(CRITERIA[0]), moved]);
    assert.deepEqual([done.closed, done.state, gh.calls, gh.state], [true, "confirmed", ["comment", "close"], "closed"]);
    assert.match(gh.comments[0].body, /checked this container's acceptance criteria on main/);
    assert.ok(gh.comments[0].body.includes(`${CRITERIA[1]} Moved to #${BLOCKED}, which this container blocks and which now owns this criterion: the audit of the blocked ticket checks it`), gh.comments[0].body);
    assert.equal(gh.comments[0].body.includes("- [x] Targets"), false, "a moved criterion is not reported as met");
    const record = run.readRecord(file), op = record.operations.at(-1);
    assert.deepEqual([op.kind, op.pr, op.state, op.container.mainSha, op.comment.id], ["close", CONTAINER, "confirmed", MAIN, 1], "the record holds the closure");

    const finished = snapshotOf([...closed().tickets.filter((t) => t.number !== BLOCKED), child(BLOCKED, { parent: PARENT })]);
    const parentCriteria = [{ criterion: "Parent works", status: "met", evidence: ["e"] }];
    const verified = run.updateRecord(file, { expectRevision: record.revision, coordinator: COORD }, (r) => ig.verifyIssue(r, { snapshot: finished, evidence: { criteria: parentCriteria }, mainSha: MAIN })).output;
    assert.equal(verified.verdict, "complete", "verify-issue accepts a run with a container closed this way");
    assert.equal(verified.report.includes(`#${CONTAINER}: closed without`), false);
    assert.equal(/\| #200 \|/.test(verified.report), false, "a container is not a slice row");
    assert.ok(verified.report.includes(`- #${CONTAINER}: closed by the coordinator, with every sub-issue delivered and its criteria checked on main \`${MAIN.slice(0, 9)}`), verified.report);
    assert.ok(verified.report.includes(`"${CRITERIA[1]}" moved to #${BLOCKED}`), verified.report);
    assert.equal(run.verificationGaps(run.readRecord(file), finished).length, 0, "the verification holds");
  }
  {
    const file = newRecord(), gh = github();
    assert.throws(() => closeWith(file, gh, [met(CRITERIA[0]), { ...moved, movedTo: 202 }]), /can move only to an open ticket in the tree that #200 blocks; #202 is not one/);
    assert.throws(() => closeWith(file, gh, [met(CRITERIA[0]), { ...moved, reason: "" }]), /say why in reason/);
    assert.throws(() => closeWith(file, gh, [met(CRITERIA[0])]), /omits criterion 2/);
    assert.throws(() => closeWith(file, gh, [met(CRITERIA[0]), { criterion: CRITERIA[1], status: "met", evidence: [] }]), /met only with evidence/);
    assert.throws(() => closeWith(file, gh, [], { snapshot: open([child(201, { state: "open", delivered: false })]) }), /still has a sub-issue/);
    assert.throws(() => closeWith(file, gh, [], { snapshot: open(undefined, { worktrees: [{ path: "w", branch: "fix/200-x" }] }) }), /writer, pending start, worktree or open PR/);
    assert.throws(() => closeWith(file, gh, [], { snapshot: { ...open(), originMain: "b".repeat(40) } }), /check the criteria on the new main/);
    assert.deepEqual([gh.calls, (run.readRecord(file).operations ?? []).length], [[], 0], "every refusal leaves GitHub and the record alone");
  }
  {
    const file = newRecord(), gh = github(), snapshot = open();
    let reads = 0;
    const raced = closeWith(file, gh, [met(CRITERIA[0]), moved], { snapshot, git: { fetch: () => {}, main: () => (++reads > 1 ? "c".repeat(40) : MAIN) } });
    assert.deepEqual([raced.closed, raced.state, gh.calls], [false, "failed", []], "a main that moves in the final reads stops the comment");
    assert.match(raced.evidence, /moved from/);

    const uncertain = newRecord(), flaky = github();
    flaky.client.closeIssue = () => { throw new Error("socket closed"); };
    const left = closeWith(uncertain, flaky, [met(CRITERIA[0]), moved]);
    assert.equal(left.state, "uncertain");
    assert.deepEqual(run.verificationGaps({ ...run.readRecord(uncertain), verifications: [] }, closed()), ["the latest verification is not complete"]);
    const record = run.readRecord(uncertain);
    assert.deepEqual(cp.reconcileOperations(structuredClone(record), { snapshot: closed() }).map((r) => [r.pr, r.state]), [[CONTAINER, "confirmed"]], "reconcile settles a closed container");
    assert.deepEqual(cp.reconcileOperations(structuredClone(record), { snapshot: open() }).map((r) => [r.pr, r.state, r.retry]), [[CONTAINER, "not-applied", true]]);
    assert.throws(() => closeWith(uncertain, flaky, [met(CRITERIA[0]), moved]), /is uncertain; settle it/);
    const retry = github(), reused = newRecord();
    retry.comments.push({ id: 7, url: "u", body: ig.containerComment(CONTAINER, [{ status: "met", criterion: CRITERIA[0], evidence: ["checked on main"] }, { status: "moved", criterion: CRITERIA[1], movedTo: BLOCKED, reason: moved.reason }], MAIN, COORD) });
    const again = closeWith(reused, retry, [met(CRITERIA[0]), moved]);
    assert.deepEqual([again.comment.reused, retry.calls], [true, ["close"]], "a retry reuses the identical comment");
  }
  {
    const added = `${github().body}- [ ] A third criterion nobody checked\n`;
    const early = newRecord(), ghEarly = github();
    const a = closeWith(early, ghEarly, [met(CRITERIA[0]), met(CRITERIA[1])], { afterIntent: () => { ghEarly.body = added; } });
    assert.deepEqual([a.closed, a.state, ghEarly.calls], [false, "failed", []], "criteria added while the intent is saved stop the comment");
    assert.match(a.evidence, /acceptance criteria changed after they were checked/);
    const late = newRecord(), ghLate = github();
    const create = ghLate.client.createComment;
    ghLate.client.createComment = (n, text) => { const c = create(n, text); ghLate.body = added; return c; };
    const b = closeWith(late, ghLate, [met(CRITERIA[0]), met(CRITERIA[1])]);
    assert.deepEqual([b.closed, ghLate.calls, ghLate.state], [false, ["comment"], "open"], "criteria added after the comment stop the close");

    const gone = newRecord(), ghGone = github();
    let snapshot = open();
    const c = closeWith(gone, ghGone, [met(CRITERIA[0]), moved], { snapshot, takeSnapshot: () => snapshot, readScope: () => run.snapshotScope(snapshot), afterIntent: () => { snapshot = snapshotOf(open().tickets.map((t) => (t.number === BLOCKED ? { ...t, state: "closed" } : t))); } });
    assert.deepEqual([c.closed, ghGone.calls], [false, []], "a moved criterion's destination that closes stops the comment");
    assert.match(c.evidence, /#300, which was to own criterion 2, is no longer an open ticket that #200 blocks/);
  }
  {
    const file = newRecord(), gh = github("no criteria here");
    assert.equal(closeWith(file, gh, []).closed, true, "a container listing no criteria closes on its delivered sub-issues");
    assert.match(gh.comments[0].body, /lists no acceptance criteria/);
  }
  console.log("container-close: all checks passed");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
