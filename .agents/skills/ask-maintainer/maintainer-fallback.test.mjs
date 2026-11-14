import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readRepos } from "../../repos.mjs";
import { TOOL_MARK } from "./github-app.mjs";
import { RequestRefused, dataLine, fallbackRequest, fetchAnswer, formatAnswer, main, readDataLine, readNote, recordAnswer, reviseRequest, waitForRequests, withdrawRequest } from "./maintainer-request.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(path.join(here, "fixtures", name), "utf8").replace(/\r\n/g, "\n");
const repos = readRepos();
const M = repos.maintainer.login;
const labels = repos.maintainer.labels;
const scratch = mkdtempSync(path.join(tmpdir(), "maintainer-fallback-test-"));
console.log(`Scratch directory: ${scratch}`);

const REQUEST = 9001;
const TICKET = 2271;
const OWNER = "orchestrate-issues #977";
const filedAt = "2026-11-13T15:37:00Z";
const fallbackAt = "2026-11-13T17:37:00.000Z";
const decisionBody = fixture("decision-body.md");
const issueUrl = (n) => `https://github.com/acme/tickets/issues/${n}`;
const doing = "Merges #2271 with the outlined pin in the gutter button.\n";
const claimsMaintainerDecided = /\b(?:the )?maintainer(?:'s)? (?:decided|decision|chose|choice|approved|agreed|accepted|kept)\b/i;

function tracker({ body = decisionBody, failAddLabel = false, onAddLabel = () => {} } = {}) {
  const t = { seq: 0, next: 7000, now: new Date("2026-11-13T17:40:00Z"), calls: [], items: [] };
  const tick = () => (t.now = new Date(t.now.getTime() + 1000)).toISOString().replace(".000Z", "Z");
  const issue = (number, over) => ({ number, html_url: issueUrl(number), state: "open", state_reason: null, created_at: filedAt, closed_at: null, closed_by: null, labels: [], ...over });
  t.issues = new Map([
    [REQUEST, issue(REQUEST, { title: "What should mark a choice the preview picked by itself? (#2271)", labels: [{ name: labels.decision }], body })],
    [TICKET, issue(TICKET, { title: "The gutter button", body: "" })],
  ]);
  const post = (number, text, login = M, at = tick()) => {
    const id = t.next++;
    t.items.push({ event: "commented", issue: number, id, html_url: `${issueUrl(number)}#issuecomment-${id}`, created_at: at, updated_at: at, user: { login, type: "User" }, body: text, seq: t.seq++ });
    return id;
  };
  const of = (n) => t.issues.get(n);
  Object.assign(t, {
    repo: "acme/tickets",
    say: (text, at, number = REQUEST) => post(number, text, M, at),
    closeAs: (reason, at = tick()) => {
      Object.assign(of(REQUEST), { state: "closed", state_reason: reason, closed_at: at, closed_by: { login: M, type: "User" } });
      t.items.push({ event: "closed", issue: REQUEST, created_at: at, actor: { login: M, type: "User" }, seq: t.seq++ });
    },
    issue: (n) => structuredClone(of(n)),
    timeline: (n) => structuredClone(t.items.filter((item) => item.issue === n).sort((a, b) => a.seq - b.seq)),
    comments: (n) => structuredClone(t.items.filter((item) => item.issue === n && item.event === "commented")),
    comment: ({ number, bodyFile }) => {
      t.calls.push(["comment", number]);
      return { id: post(number, readFileSync(bodyFile, "utf8"), M) };
    },
    readComment: (id) => structuredClone(t.items.find((item) => item.id === id)),
    deleteComment: (id) => {
      t.calls.push(["deleteComment", id]);
      t.items = t.items.filter((item) => item.id !== id);
    },
    addLabel: (n, label) => {
      t.calls.push(["addLabel", n, label]);
      if (failAddLabel) throw new Error("HTTP 502: label service down");
      onAddLabel(t);
      of(n).labels.push({ name: label });
      t.items.push({ event: "labeled", issue: n, label: { name: label }, created_at: tick(), seq: t.seq++ });
    },
    close: (n, reason, bodyFile) => {
      post(n, readFileSync(bodyFile, "utf8"), M);
      t.closeAs(reason);
    },
    editBody: (n, bodyFile) => {
      of(n).body = readFileSync(bodyFile, "utf8");
    },
    editTitle: (n, title) => {
      of(n).title = title;
    },
    removeLabel: (n, label) => {
      t.calls.push(["removeLabel", n, label]);
      of(n).labels = of(n).labels.filter((l) => l.name !== label);
    },
  });
  return t;
}

const at = (iso) => new Date(iso);
const toolNote = (text, note) => `${text}\n\n${TOOL_MARK}\n<!-- maintainer-request-note ${JSON.stringify(note)} -->\n`;
const refused = (work, pattern, label) => {
  assert.throws(work, (error) => error instanceof RequestRefused && error.reasons.some((reason) => pattern.test(reason)), label);
  console.log(`ok: fallback refuses ${label}`);
};
const recordsOn = (t, n) => t.comments(n).map((c) => ({ c, note: readNote(c.body) })).filter((e) => e.note);

try {
  {
    const t = tracker();
    refused(() => fallbackRequest(REQUEST, OWNER, doing, { tracker: t, repos, now: at("2026-11-13T17:36:59Z") }), /falls back at 2026-11-13 17:37 UTC, 1m from now; the wait has not passed/, "before the fallback time");
    const asked = tracker();
    asked.say("What does C look like in dark mode?", "2026-11-13T16:00:00Z");
    refused(() => fallbackRequest(REQUEST, OWNER, doing, { tracker: asked, repos, now: at("2026-11-13T18:00:00Z") }), /a maintainer question is open on #9001 .*#issuecomment-\d+\); the clock is stopped/, "while a maintainer question is open, even past the fallback time");
    const waiting = tracker({ body: decisionBody.replace(dataLine(readDataLine(decisionBody)), dataLine({ ...readDataLine(decisionBody), fallback: undefined, waits: "confirms-built" })) });
    refused(() => fallbackRequest(REQUEST, OWNER, doing, { tracker: waiting, repos, now: at("2026-11-14T18:00:00Z") }), /waits for the maintainer because it asks you to confirm something already built; a request that waits never falls back/, "on a request that waits");
    refused(() => fallbackRequest(REQUEST, "orchestrate-issues #1655", doing, { tracker: t, repos, now: at("2026-11-13T18:00:00Z") }), /belongs to orchestrate-issues #977, not orchestrate-issues #1655; only the run or session that asked takes its fallback/, "from another run or session");
    refused(() => fallbackRequest(REQUEST, "", doing, { tracker: t, repos, now: at("2026-11-13T18:00:00Z") }), /belongs to orchestrate-issues #977, not an unnamed owner/, "with no owner named");
    const closed = tracker();
    closed.closeAs("completed", "2026-11-13T17:00:00Z");
    refused(() => fallbackRequest(REQUEST, OWNER, doing, { tracker: closed, repos, now: at("2026-11-13T18:00:00Z") }), /#9001 is closed \(accepted\)/, "on a closed request");
    const task = tracker({ body: fixture("task-body.md") });
    refused(() => fallbackRequest(REQUEST, OWNER, doing, { tracker: task, repos, now: at("2026-11-13T18:00:00Z") }), /a task has no fallback and no clock/, "on a task");
    assert.deepEqual(t.calls.filter(([kind]) => kind !== "comment"), [], "a refused fallback writes nothing");
    assert.equal(t.calls.length, 0);
  }

  const now = at("2026-11-13T17:40:00Z");
  {
    const t = tracker();
    const result = fallbackRequest(REQUEST, OWNER, doing, { tracker: t, repos, now });
    assert.equal(t.issue(REQUEST).state, "open", "the request stays open");
    assert.ok(t.issue(REQUEST).labels.some((l) => l.name === labels.decidedWithoutYou), "the request carries the decided-without-you label");
    const note = t.readComment(result.note.id);
    assert.equal(note.body, fixture("fallback-comment.md"), "the fallback comment matches its fixture");
    const records = recordsOn(t, TICKET);
    assert.equal(records.length, 1);
    assert.equal(records[0].c.body, fixture("fallback-record.md"), "the ticket record matches its fixture");
    assert.match(records[0].c.body, /^\*\*Decided by fallback, not reviewed by the maintainer\*\*/);
    assert.match(records[0].c.body, /B · A hollow pin/);
    assert.match(records[0].c.body, /\*\*Unanswered for:\*\* 2h 3m/);
    assert.doesNotMatch(records[0].c.body.replace("not reviewed by the maintainer", ""), claimsMaintainerDecided, "the record claims no maintainer decision");
    assert.doesNotMatch(note.body, claimsMaintainerDecided);
    console.log("ok: fallback posts the comment and the ticket record its fixtures show, labels the request and leaves it open");

    const ahead = fetchAnswer(REQUEST, { tracker: t, repos });
    assert.equal(ahead.state, "went-ahead");
    assert.deepEqual([ahead.wentAhead.option, ahead.wentAhead.name, ahead.wentAhead.owner], ["B", "A hollow pin", OWNER]);
    assert.match(formatAnswer(ahead), /went ahead without the maintainer with B · A hollow pin/);
    refused(() => fallbackRequest(REQUEST, OWNER, doing, { tracker: t, repos, now }), /already went ahead with B · A hollow pin/, "a second time");
    refused(() => withdrawRequest(REQUEST, "no longer needed", { tracker: t, repos }), /already went ahead .* only the maintainer closes it/, "a withdrawal of a request that went ahead (withdraw)");
    refused(() => recordAnswer(REQUEST, { tracker: t, repos }), /it went ahead with B · A hollow pin and waits for the maintainer to keep or change it/, "a record before the maintainer keeps or changes it (record)");
    console.log("ok: read reports went-ahead until the maintainer closes the request");

    const kept = tracker();
    fallbackRequest(REQUEST, OWNER, doing, { tracker: kept, repos, now });
    kept.closeAs("completed", "2026-11-13T19:00:00Z");
    const keptAnswer = fetchAnswer(REQUEST, { tracker: kept, repos });
    assert.equal(keptAnswer.state, "kept");
    const keptRecord = recordAnswer(REQUEST, { tracker: kept, repos });
    const keptBodies = recordsOn(kept, TICKET);
    assert.deepEqual(keptBodies.map((e) => e.note.kind), ["fallback-record", "record"], "keeping adds a second record beside the fallback record");
    assert.equal(keptBodies[1].c.body, fixture("kept-record.md"));
    assert.match(keptBodies[1].c.body, /^\*\*Kept by the maintainer\*\*/);
    assert.equal(keptRecord.records.length, 1);
    console.log("ok: a went-ahead request closed with no comment reads as kept, and record adds \"Kept by the maintainer\"");
  }

  {
    const t = tracker();
    fallbackRequest(REQUEST, OWNER, doing, { tracker: t, repos, now });
    const said = "Not B. Use C, the small dot, and drop the pop-up.";
    const id = t.say(said, "2026-11-13T19:00:00Z");
    assert.equal(fetchAnswer(REQUEST, { tracker: t, repos }).state, "question", "a comment without closing on a request that went ahead is a question");
    t.closeAs("completed", "2026-11-13T19:00:01Z");
    const changed = fetchAnswer(REQUEST, { tracker: t, repos });
    assert.equal(changed.state, "changed");
    assert.deepEqual(changed.words.map((w) => [w.id, w.body]), [[id, said]]);
    assert.match(formatAnswer(changed), /changed the fallback B · A hollow pin in their words/);
    recordAnswer(REQUEST, { tracker: t, repos });
    const records = recordsOn(t, TICKET);
    assert.deepEqual(records.map((e) => e.note.kind), ["fallback-record", "record"]);
    assert.equal(records[1].c.body, fixture("changed-record.md"));
    assert.match(records[1].c.body, /> Not B\. Use C, the small dot, and drop the pop-up\./);
    console.log("ok: a went-ahead request closed with a comment reads as changed, in the maintainer's words, and record adds the change as their decision");

    const asked = tracker();
    fallbackRequest(REQUEST, OWNER, doing, { tracker: asked, repos, now });
    asked.say("Why B and not C?", "2026-11-13T18:00:00Z");
    const plain = JSON.parse(fixture("decision.json"));
    plain.showsOnScreen = false;
    plain.background = plain.background.filter((block) => typeof block === "string");
    for (const option of plain.options) {
      delete option.pictures;
      option.example ??= `The ${option.name.toLowerCase()} beside the chosen option.`;
    }
    const revised = reviseRequest(REQUEST, plain, "Said why B and not C.", { pictures: scratch, tracker: asked, repos, now: at("2026-11-13T18:10:00Z"), timeZone: "UTC" });
    const body = asked.issue(REQUEST).body;
    assert.match(body, /^> \*\*I went ahead with B · A hollow pin at 17:40 today without you,\*\* and moved this to "decided without you"\. Close this issue with no comment to keep it, or with a comment to change it\.$/m, "a revision of a request that went ahead says so instead of promising a new fallback");
    assert.doesNotMatch(body, /If you don't answer by/);
    assert.match(asked.readComment(revised.note.id).body, /It has already gone ahead with B · A hollow pin: close this issue with no comment to keep that, or with a comment to change it\./);
    assert.equal(readNote(asked.readComment(revised.note.id).body).fallback, undefined, "the revision note restarts no clock");
    assert.equal(fetchAnswer(REQUEST, { tracker: asked, repos }).state, "went-ahead", "the revision answers the question and the request still went ahead");
    refused(() => fallbackRequest(REQUEST, OWNER, doing, { tracker: asked, repos, now: at("2026-11-14T00:00:00Z") }), /already went ahead/, "after a revision of a request that went ahead");
    console.log("ok: revise answers a question on a request that went ahead without restarting its clock or promising a new fallback");

    const unclear = tracker();
    fallbackRequest(REQUEST, OWNER, doing, { tracker: unclear, repos, now });
    unclear.closeAs("not_planned", "2026-11-13T19:00:00Z");
    assert.equal(fetchAnswer(REQUEST, { tracker: unclear, repos }).state, "unclear", "closed as not planned with no comment stays unclear");
  }

  {
    const t = tracker();
    t.say("Can I see B on a phone first?", "2026-11-13T16:30:00Z");
    assert.equal(fetchAnswer(REQUEST, { tracker: t, repos }).state, "question");
    refused(() => fallbackRequest(REQUEST, OWNER, doing, { tracker: t, repos, now: at("2026-11-13T20:00:00Z") }), /question is open/, "past its time while the question is open (clock stopped)");
    const revisedAt = "2026-11-13T16:45:00Z";
    const restarted = new Date(Date.parse(revisedAt) + 120 * 60000).toISOString();
    t.issues.get(REQUEST).body = decisionBody.replace(dataLine(readDataLine(decisionBody)), dataLine({ ...readDataLine(decisionBody), fallback: { option: "B", at: restarted } }));
    t.items.push({ event: "commented", issue: REQUEST, id: 7999, html_url: `${issueUrl(REQUEST)}#issuecomment-7999`, created_at: revisedAt, updated_at: revisedAt, user: { login: M, type: "User" }, body: toolNote("Revised by the ask-maintainer tool.", { kind: "revised", fallback: restarted }), seq: t.seq++ });
    assert.equal(fetchAnswer(REQUEST, { tracker: t, repos }).state, "waiting", "a revision answers the question");
    refused(() => fallbackRequest(REQUEST, OWNER, doing, { tracker: t, repos, now: at("2026-11-13T18:44:00Z") }), /falls back at 2026-11-13 18:45 UTC, 1m from now/, "before the restarted time (clock restarted at the revision)");
    const result = fallbackRequest(REQUEST, OWNER, doing, { tracker: t, repos, now: at("2026-11-13T18:45:00Z") });
    assert.match(t.readComment(result.note.id).body, /\*\*Unanswered for:\*\* 2h 0m, since it was last revised at 2026-11-13 16:45 UTC\./);
    console.log("ok: the clock stops at a maintainer comment and starts again at the revision");
  }

  {
    const t = tracker({ failAddLabel: true });
    assert.throws(() => fallbackRequest(REQUEST, OWNER, doing, { tracker: t, repos, now }), /Going ahead on acme\/tickets#9001 failed:\n- HTTP 502: label service down\nRolled back: deleted the fallback record \d+ on #2271; removed the label maintainer: decided without you; deleted the fallback note \d+\.\nCorrect the cause and run fallback again\.$/);
    assert.equal(fetchAnswer(REQUEST, { tracker: t, repos }).state, "waiting", "a failed fallback leaves the request waiting");
    assert.deepEqual([recordsOn(t, TICKET), recordsOn(t, REQUEST)], [[], []]);
    console.log("ok: a fallback that fails part-way rolls back its note, records and label");

    const leftovers = (self, { label = false, note = true } = {}) => {
      const ids = [];
      if (note) ids.push(self.say(toolNote("**Went ahead without you.** (left by a run that stopped)", { kind: "fallback", option: "B", name: "A hollow pin", owner: OWNER, at: "2026-11-13T17:39:00.000Z", fallbackAt }), "2026-11-13T17:39:00Z"));
      ids.push(self.say(toolNote("**Decided by fallback, not reviewed by the maintainer** (left by a run that stopped)", { kind: "fallback-record", request: REQUEST, option: "B", fallbackAt }), "2026-11-13T17:39:01Z", TICKET));
      if (label) self.issues.get(REQUEST).labels.push({ name: labels.decidedWithoutYou });
      return ids;
    };

    const stopped = tracker();
    const [oldNote, oldRecord] = leftovers(stopped);
    assert.equal(fetchAnswer(REQUEST, { tracker: stopped, repos }).state, "waiting", "a note and record with no label are not a fallback: the label is the commit marker");
    const rerun = fallbackRequest(REQUEST, OWNER, doing, { tracker: stopped, repos, now });
    assert.deepEqual(rerun.cleared, [`deleted the unfinished fallback note ${oldNote} on #9001`, `deleted the unfinished fallback record ${oldRecord} on #2271`]);
    assert.deepEqual([recordsOn(stopped, REQUEST).length, recordsOn(stopped, TICKET).length], [1, 1], "the rerun leaves one note and one record, its own");
    assert.equal(fetchAnswer(REQUEST, { tracker: stopped, repos }).wentAhead.url, rerun.note.url);
    console.log("ok: a fallback run that stopped before its label is cleared and taken again by running fallback again");

    const labelOnly = tracker();
    leftovers(labelOnly, { label: true, note: false });
    labelOnly.say("Wait. Can I see C first?", "2026-11-13T17:45:00Z");
    assert.equal(fetchAnswer(REQUEST, { tracker: labelOnly, repos }).state, "question");
    assert.throws(() => fallbackRequest(REQUEST, OWNER, doing, { tracker: labelOnly, repos, now: at("2026-11-13T17:50:00Z") }), (error) => error instanceof RequestRefused && /question is open/.test(error.reasons[0]) && /what a stopped fallback run left was cleared: deleted the unfinished fallback record \d+ on #2271; removed the label maintainer: decided without you, which no finished fallback backs/.test(error.reasons[1]));
    assert.deepEqual([recordsOn(labelOnly, TICKET), labelOnly.issue(REQUEST).labels.map((l) => l.name)], [[], [labels.decision]], "the owner's refused fallback still clears the label and record a stopped run left, so the planner holds the ticket again");
    assert.throws(() => fallbackRequest(REQUEST, "someone else", doing, { tracker: tracker(), repos, now }), RequestRefused);
    console.log("ok: a label and record left without a note are cleared by the owner's next fallback, even when it is refused for an open question");

    const resumedQuestion = tracker({ onAddLabel: (self) => self.say("Wait. Can I see C first?", "2026-11-13T17:40:30Z") });
    leftovers(resumedQuestion);
    assert.throws(() => fallbackRequest(REQUEST, OWNER, doing, { tracker: resumedQuestion, repos, now }), /changed while going ahead: it now reads question/);
    assert.deepEqual([recordsOn(resumedQuestion, TICKET), recordsOn(resumedQuestion, REQUEST), resumedQuestion.issue(REQUEST).labels.map((l) => l.name)], [[], [], [labels.decision]], "a resumed fallback cancelled by a question leaves no fallback note, record or label");
    const resumedFailure = tracker({ failAddLabel: true });
    leftovers(resumedFailure);
    assert.throws(() => fallbackRequest(REQUEST, OWNER, doing, { tracker: resumedFailure, repos, now }), /label service down/);
    assert.deepEqual([recordsOn(resumedFailure, TICKET), recordsOn(resumedFailure, REQUEST)], [[], []], "a resumed fallback that fails leaves no fallback note or record");
    console.log("ok: a resumed fallback that is cancelled or fails leaves no claim that a fallback was taken");

    const answered = tracker();
    const [, orphan] = leftovers(answered);
    answered.say("Go with C.", "2026-11-13T17:50:00Z");
    answered.closeAs("completed", "2026-11-13T17:50:01Z");
    const recorded = recordAnswer(REQUEST, { tracker: answered, repos });
    assert.equal(recorded.answer.state, "answered");
    assert.ok(recorded.cleared.includes(`deleted the unfinished fallback record ${orphan} on #2271`));
    assert.deepEqual(recordsOn(answered, TICKET).map((e) => e.note.kind), ["record"], "record clears a fallback record no finished fallback backs before recording the answer");
    console.log("ok: record clears what an unfinished fallback left before recording the maintainer's answer");

    const withdrawn = tracker();
    leftovers(withdrawn, { label: true, note: false });
    assert.equal(withdrawRequest(REQUEST, "no longer needed", { tracker: withdrawn, repos }).state, "withdrawn");
    assert.deepEqual([recordsOn(withdrawn, TICKET), recordsOn(withdrawn, REQUEST).map((e) => e.note.kind), withdrawn.issue(REQUEST).labels.map((l) => l.name)], [[], ["withdrawn"], [labels.decision]], "withdraw clears an unfinished fallback's record and label before closing");
    console.log("ok: withdraw clears what an unfinished fallback left");

    const label = (self) => {
      self.issues.get(REQUEST).labels.push({ name: labels.decidedWithoutYou });
      self.items.push({ event: "labeled", issue: REQUEST, label: { name: labels.decidedWithoutYou }, created_at: "2026-11-13T17:39:30Z", seq: self.seq++ });
    };
    const crossed = tracker();
    leftovers(crossed);
    crossed.say("Wait. Can I see C first?", "2026-11-13T17:39:10Z");
    label(crossed);
    const crossedAnswer = fetchAnswer(REQUEST, { tracker: crossed, repos });
    assert.deepEqual([crossedAnswer.state, crossedAnswer.wentAhead], ["question", undefined], "a label added after a maintainer question that followed the fallback note does not commit the fallback");
    assert.throws(() => fallbackRequest(REQUEST, OWNER, doing, { tracker: crossed, repos, now: at("2026-11-13T17:50:00Z") }), (error) => error instanceof RequestRefused && /question is open/.test(error.reasons[0]) && /removed the label maintainer: decided without you/.test(error.reasons[1]));
    assert.deepEqual([recordsOn(crossed, TICKET), recordsOn(crossed, REQUEST), crossed.issue(REQUEST).labels.map((l) => l.name)], [[], [], [labels.decision]], "the owner's next fallback clears a fallback interrupted by a question, label included");
    const later = tracker();
    fallbackRequest(REQUEST, OWNER, doing, { tracker: later, repos, now });
    later.say("Why B?", "2026-11-13T18:00:00Z");
    const laterAnswer = fetchAnswer(REQUEST, { tracker: later, repos });
    assert.deepEqual([laterAnswer.state, laterAnswer.wentAhead.option], ["question", "B"], "a question after the label is a question on a fallback that stands");
    assert.throws(() => fallbackRequest(REQUEST, OWNER, doing, { tracker: later, repos, now: at("2026-11-13T18:10:00Z") }), /already went ahead/);
    assert.ok(later.issue(REQUEST).labels.some((l) => l.name === labels.decidedWithoutYou), "a later question leaves a committed fallback in place");
    console.log("ok: a fallback is committed only when its label follows its note with no maintainer comment, revision, close or reopen in between");

    const revisedMidway = tracker({ onAddLabel: (self) => {
      const restarted = "2026-11-13T19:40:01.000Z";
      self.issues.get(REQUEST).body = decisionBody.replace(dataLine(readDataLine(decisionBody)), dataLine({ ...readDataLine(decisionBody), fallback: { option: "A", at: restarted } }));
      self.say(toolNote("Revised by the ask-maintainer tool.", { kind: "revised", fallback: restarted }), "2026-11-13T17:40:01Z");
    } });
    assert.throws(() => fallbackRequest(REQUEST, OWNER, doing, { tracker: revisedMidway, repos, now }), /changed while going ahead: it now reads waiting/);
    assert.deepEqual([fetchAnswer(REQUEST, { tracker: revisedMidway, repos }).state, readDataLine(revisedMidway.issue(REQUEST).body).fallback.option], ["waiting", "A"], "a revision made while the fallback published wins, and the stale fallback is rolled back");
    const revisedThenStopped = tracker();
    leftovers(revisedThenStopped);
    revisedThenStopped.issues.get(REQUEST).body = decisionBody.replace(dataLine(readDataLine(decisionBody)), dataLine({ ...readDataLine(decisionBody), fallback: { option: "A", at: "2026-11-13T19:40:01.000Z" } }));
    revisedThenStopped.say(toolNote("Revised by the ask-maintainer tool.", { kind: "revised", fallback: "2026-11-13T19:40:01.000Z" }), "2026-11-13T17:39:20Z");
    label(revisedThenStopped);
    assert.deepEqual([fetchAnswer(REQUEST, { tracker: revisedThenStopped, repos }).state, fetchAnswer(REQUEST, { tracker: revisedThenStopped, repos }).wentAhead], ["waiting", undefined], "a stopped run whose label followed a revision does not commit the older fallback");
    const revisedFirst = tracker();
    revisedFirst.issues.get(REQUEST).body = decisionBody.replace(dataLine(readDataLine(decisionBody)), dataLine({ ...readDataLine(decisionBody), fallback: { option: "A", at: "2026-11-13T19:38:50.000Z" } }));
    revisedFirst.say(toolNote("Revised by the ask-maintainer tool.", { kind: "revised", fallback: "2026-11-13T19:38:50.000Z" }), "2026-11-13T17:38:50Z");
    leftovers(revisedFirst);
    label(revisedFirst);
    assert.equal(fetchAnswer(REQUEST, { tracker: revisedFirst, repos }).wentAhead, undefined, "a fallback note for a fallback time the request no longer states does not commit, even when its label follows");
    console.log("ok: a revision during publication cancels the fallback, whether or not the run finished");

    const reopened = tracker();
    reopened.closeAs("not_planned", "2026-11-13T16:00:00Z");
    assert.equal(fetchAnswer(REQUEST, { tracker: reopened, repos }).state, "unclear");
    const again = "2026-11-13T18:10:00.000Z";
    reopened.issues.get(REQUEST).body = decisionBody.replace(dataLine(readDataLine(decisionBody)), dataLine({ ...readDataLine(decisionBody), fallback: { option: "B", at: again } }));
    reopened.say(toolNote("Revised by the ask-maintainer tool, and reopened because the answer was unclear.", { kind: "revised", fallback: again }), "2026-11-13T16:10:00Z");
    Object.assign(reopened.issues.get(REQUEST), { state: "open", state_reason: "reopened", closed_at: null, closed_by: null });
    reopened.items.push({ event: "reopened", issue: REQUEST, created_at: "2026-11-13T16:10:01Z", actor: { login: M }, seq: reopened.seq++ });
    assert.equal(fetchAnswer(REQUEST, { tracker: reopened, repos }).state, "waiting");
    fallbackRequest(REQUEST, OWNER, doing, { tracker: reopened, repos, now: at("2026-11-13T18:11:00Z") });
    assert.equal(fetchAnswer(REQUEST, { tracker: reopened, repos }).state, "went-ahead", "the reopen that revise makes before the fallback does not interrupt it");
    console.log("ok: a fallback after revise reopened an unclear request commits");

    const ambiguous = tracker();
    leftovers(ambiguous);
    ambiguous.closeAs("completed", "2026-11-13T17:45:00Z");
    const unclearAnswer = fetchAnswer(REQUEST, { tracker: ambiguous, repos });
    assert.equal(unclearAnswer.state, "unclear");
    assert.match(unclearAnswer.why, /closed with no comment while a fallback to B was posted but not finished/);
    assert.throws(() => recordAnswer(REQUEST, { tracker: ambiguous, repos }), /has no answer to record: it is unclear/);
    assert.equal(recordsOn(ambiguous, TICKET).length, 1, "nothing is recorded or cleared for an unclear close");
    console.log("ok: a close with no comment while a visible fallback note was unfinished is unclear, never accepted");

    const revisedBody = decisionBody.replace(dataLine(readDataLine(decisionBody)), dataLine({ ...readDataLine(decisionBody), fallback: { option: "C", at: "2026-11-13T19:30:00.000Z" } }));
    const stale = tracker();
    leftovers(stale);
    stale.issues.get(REQUEST).body = revisedBody;
    stale.items.push({ event: "commented", issue: REQUEST, id: 7998, html_url: `${issueUrl(REQUEST)}#issuecomment-7998`, created_at: "2026-11-13T17:45:00Z", updated_at: "2026-11-13T17:45:00Z", user: { login: M, type: "User" }, body: toolNote("Revised by the ask-maintainer tool.", { kind: "revised", fallback: "2026-11-13T19:30:00.000Z" }), seq: stale.seq++ });
    fallbackRequest(REQUEST, OWNER, doing, { tracker: stale, repos, now: at("2026-11-13T19:31:00Z") });
    const ticketRecords = recordsOn(stale, TICKET);
    assert.deepEqual(ticketRecords.map((e) => [e.note.option, e.note.fallbackAt]), [["C", "2026-11-13T19:30:00.000Z"]], "the B record left before the revision is replaced by a C record");
    assert.match(ticketRecords[0].c.body, /\*\*Went ahead with:\*\* C · A small dot on the strip/);
    console.log("ok: a record left from before a revision that changed the fallback is not reused");
  }

  {
    const t = tracker({ onAddLabel: (self) => self.say("Wait. Can you show C first?", "2026-11-13T17:40:30Z") });
    assert.throws(() => fallbackRequest(REQUEST, OWNER, doing, { tracker: t, repos, now }), /#9001 changed while going ahead: it now reads question, with the maintainer's comment https:\/\/github\.com\/acme\/tickets\/issues\/9001#issuecomment-\d+; read it again before acting\nRolled back: deleted the fallback record \d+ on #2271; removed the label maintainer: decided without you; deleted the fallback note \d+\./);
    const after = fetchAnswer(REQUEST, { tracker: t, repos });
    assert.deepEqual([after.state, after.words.map((w) => w.body)], ["question", ["Wait. Can you show C first?"]], "the maintainer's question stays open and its words are kept");
    assert.deepEqual([recordsOn(t, TICKET), t.issue(REQUEST).labels.map((l) => l.name)], [[], [labels.decision]]);
    t.closeAs("completed", "2026-11-13T18:00:00Z");
    assert.equal(fetchAnswer(REQUEST, { tracker: t, repos }).state, "answered", "a later close is answered in the maintainer's words, never kept");
    console.log("ok: a maintainer question that arrives while fallback publishes is kept: the fallback is rolled back and the request reads as a question");

    const late = tracker();
    fallbackRequest(REQUEST, OWNER, doing, { tracker: late, repos, now });
    late.say("Hmm, why B?", "2026-11-13T18:00:00Z");
    late.closeAs("completed", "2026-11-13T18:00:01Z");
    const changed = fetchAnswer(REQUEST, { tracker: late, repos });
    assert.deepEqual([changed.state, changed.words.map((w) => w.body)], ["changed", ["Hmm, why B?"]]);
    console.log("ok: a maintainer comment after the fallback note is read as their words");
  }

  {
    const t = tracker();
    fallbackRequest(REQUEST, OWNER, doing, { tracker: t, repos, now });
    const reordered = decisionBody.replace("### B · A hollow pin (recommended)", "### B · A small dot on the strip (recommended)").replace("### C · A small dot on the strip", "### C · A hollow pin");
    assert.notEqual(reordered, decisionBody);
    t.issues.get(REQUEST).body = reordered;
    t.closeAs("completed", "2026-11-13T19:00:00Z");
    const kept = fetchAnswer(REQUEST, { tracker: t, repos });
    assert.deepEqual([kept.state, kept.wentAhead.option, kept.wentAhead.name], ["kept", "B", "A hollow pin"], "the option taken is named from the fallback note, not from a body revised since");
    recordAnswer(REQUEST, { tracker: t, repos });
    assert.match(recordsOn(t, TICKET).at(-1).c.body, /kept the fallback B · A hollow pin, taken at/);
    console.log("ok: a revision that renames or reorders options after the fallback leaves the kept record naming the option actually taken");
  }

  {
    const t = tracker();
    fallbackRequest(REQUEST, OWNER, doing, { tracker: t, repos, now });
    let clock = Date.parse("2026-11-13T17:41:00Z");
    let reads = 0;
    const polling = {
      poll: () => {
        reads += 1;
        if (reads === 3) t.closeAs("completed", new Date(clock).toISOString());
        return { status: 200, etag: `W/"${reads}"`, issue: t.issue(REQUEST) };
      },
      timeline: (n) => t.timeline(n),
    };
    const result = await waitForRequests([REQUEST], { tracker: polling, repos, clock: () => new Date(clock), sleep: (ms) => (clock += ms), warn: () => {} });
    assert.deepEqual([result.why, result.state, reads], ["closed", "kept", 3], "wait keeps watching a request that went ahead until the maintainer closes it");
    console.log("ok: wait does not return at once for a request that went ahead, and returns when it is kept");
  }

  {
    const t = tracker();
    const file = path.join(scratch, "doing.md");
    writeFileSync(file, doing);
    const lines = [];
    const code = main(["fallback", `#${REQUEST}`, OWNER, file], { repos, tracker: t, out: (line) => lines.push(line), now });
    assert.equal(code, 0);
    assert.match(lines.join("\n"), /^Went ahead on #9001 with B · A hollow pin: https:\/\/github\.com\/acme\/tickets\/issues\/9001#issuecomment-\d+\nLabelled "maintainer: decided without you"; the request stays open for the maintainer to keep or change\.\nRecorded: #2271 /);
    console.log("ok: the fallback command line reports the note, the label and the records");
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
