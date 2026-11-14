import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readRepos } from "../../repos.mjs";
import { TOOL_MARK } from "./github-app.mjs";
import { RequestRefused, dataLine, fallbackCommitted, fallbackRequest, fetchAnswer, formatAnswer, listRequests, main, readDataLine, readNote, recordAnswer, reviseRequest, waitForRequests, withMarker, withdrawRequest } from "./maintainer-request.mjs";

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
const withData = (change) => decisionBody.replace(dataLine(readDataLine(decisionBody)), dataLine({ ...readDataLine(decisionBody), ...change }));

function tracker({ body = decisionBody, failCommit = null, beforeCommit = () => {}, afterCommit = () => {}, failNote = false } = {}) {
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
  const setLabels = (n, names) => {
    const before = of(n).labels.map((l) => l.name);
    for (const name of names.filter((name) => !before.includes(name))) t.items.push({ event: "labeled", issue: n, label: { name }, created_at: tick(), seq: t.seq++ });
    for (const name of before.filter((name) => !names.includes(name))) t.items.push({ event: "unlabeled", issue: n, label: { name }, created_at: tick(), seq: t.seq++ });
    of(n).labels = names.map((name) => ({ name }));
  };
  Object.assign(t, {
    repo: "acme/tickets",
    say: (text, at, number = REQUEST) => post(number, text, M, at),
    closeAs: (reason, at = tick()) => {
      Object.assign(of(REQUEST), { state: "closed", state_reason: reason, closed_at: at, closed_by: { login: M, type: "User" } });
      t.items.push({ event: "closed", issue: REQUEST, created_at: at, actor: { login: M, type: "User" }, seq: t.seq++ });
    },
    reopenAs: (at) => {
      Object.assign(of(REQUEST), { state: "open", state_reason: "reopened", closed_at: null, closed_by: null });
      t.items.push({ event: "reopened", issue: REQUEST, created_at: at, actor: { login: M }, seq: t.seq++ });
    },
    revise: (change, at) => {
      of(REQUEST).body = withData(change);
      post(REQUEST, toolNote("Revised by the ask-maintainer tool.", { kind: "revised", fallback: change.fallback?.at ?? null }), M, at);
    },
    commitBy: (marker) => {
      of(REQUEST).body = withMarker(of(REQUEST).body, { option: "B", name: "A hollow pin", owner: OWNER, at: "2026-11-13T17:39:30.000Z", fallbackAt, doing: "Merges #2271.", undo: "Swap one icon.", unanswered: "2h 2m", since: filedAt, revised: false, ...marker }).body;
      setLabels(REQUEST, [labels.decision, labels.decidedWithoutYou]);
    },
    issue: (n) => structuredClone(of(n)),
    open: (name) => structuredClone([...t.issues.values()].filter((value) => value.state === "open" && value.labels.some((l) => l.name === name))),
    timeline: (n) => structuredClone(t.items.filter((item) => item.issue === n).sort((a, b) => a.seq - b.seq)),
    comments: (n) => structuredClone(t.items.filter((item) => item.issue === n && item.event === "commented")),
    comment: ({ number, bodyFile }) => {
      t.calls.push(["comment", number]);
      const text = readFileSync(bodyFile, "utf8");
      if (failNote && readNote(text)?.kind === "fallback") throw new Error("the process stopped before the note");
      return { id: post(number, text, M) };
    },
    readComment: (id) => structuredClone(t.items.find((item) => item.id === id)),
    deleteComment: (id) => {
      t.calls.push(["deleteComment", id]);
      t.items = t.items.filter((item) => item.id !== id);
    },
    setBodyAndLabels: (n, bodyFile, names) => {
      const commits = names.includes(labels.decidedWithoutYou) && !of(n).labels.some((l) => l.name === labels.decidedWithoutYou);
      t.calls.push([commits ? "commit" : "uncommit", n]);
      if (commits) beforeCommit(t);
      if (commits && failCommit === "before") throw new Error("HTTP 502: edit failed");
      of(n).body = readFileSync(bodyFile, "utf8");
      setLabels(n, names);
      if (commits && failCommit === "after") throw new Error("HTTP 502: response lost after the edit");
      if (commits) afterCommit(t);
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
  });
  return t;
}

const at = (iso) => new Date(iso);
const toolNote = (text, note) => `${text}\n\n${TOOL_MARK}\n<!-- maintainer-request-note ${JSON.stringify(note)} -->\n`;
const refused = (work, pattern, label) => {
  assert.throws(work, (error) => error instanceof RequestRefused && error.reasons.some((reason) => pattern.test(reason)), label);
  console.log(`ok: fallback refuses ${label}`);
};
const notesOn = (t, n) => t.comments(n).map((c) => ({ c, note: readNote(c.body) })).filter((e) => e.note);
const labelsOf = (t) => t.issue(REQUEST).labels.map((l) => l.name);
const committedFor = (t) => fallbackCommitted(t.issue(REQUEST), t.timeline(REQUEST), repos);
const now = at("2026-11-13T17:40:00Z");

try {
  {
    const t = tracker();
    refused(() => fallbackRequest(REQUEST, OWNER, doing, { tracker: t, repos, now: at("2026-11-13T17:36:59Z") }), /falls back at 2026-11-13 17:37 UTC, 1m from now; the wait has not passed/, "before the fallback time");
    const asked = tracker();
    asked.say("What does C look like in dark mode?", "2026-11-13T16:00:00Z");
    refused(() => fallbackRequest(REQUEST, OWNER, doing, { tracker: asked, repos, now: at("2026-11-13T18:00:00Z") }), /a maintainer question is open on #9001 .*#issuecomment-\d+\); the clock is stopped/, "while a maintainer question is open, even past the fallback time");
    const waiting = tracker({ body: withData({ fallback: undefined, waits: "confirms-built" }) });
    refused(() => fallbackRequest(REQUEST, OWNER, doing, { tracker: waiting, repos, now: at("2026-11-14T18:00:00Z") }), /waits for the maintainer because it asks you to confirm something already built; a request that waits never falls back/, "on a request that waits");
    refused(() => fallbackRequest(REQUEST, "orchestrate-issues #1655", doing, { tracker: t, repos, now: at("2026-11-13T18:00:00Z") }), /belongs to orchestrate-issues #977, not orchestrate-issues #1655; only the run or session that asked takes its fallback/, "from another run or session");
    refused(() => fallbackRequest(REQUEST, "", doing, { tracker: t, repos, now: at("2026-11-13T18:00:00Z") }), /belongs to orchestrate-issues #977, not an unnamed owner/, "with no owner named");
    const closed = tracker();
    closed.closeAs("completed", "2026-11-13T17:00:00Z");
    refused(() => fallbackRequest(REQUEST, OWNER, doing, { tracker: closed, repos, now: at("2026-11-13T18:00:00Z") }), /#9001 is closed \(accepted\)/, "on a closed request");
    const task = tracker({ body: fixture("task-body.md") });
    refused(() => fallbackRequest(REQUEST, OWNER, doing, { tracker: task, repos, now: at("2026-11-13T18:00:00Z") }), /a task has no fallback and no clock/, "on a task");
    assert.deepEqual(t.calls, [], "a refused fallback writes nothing");
  }

  {
    const t = tracker();
    const result = fallbackRequest(REQUEST, OWNER, doing, { tracker: t, repos, now });
    assert.deepEqual(t.calls.map(([kind, n]) => `${kind} ${n}`), ["commit 9001", "comment 9001", "comment 2271"], "one edit commits the fallback; the note and record follow it");
    const body = t.issue(REQUEST).body;
    assert.equal(t.issue(REQUEST).state, "open", "the request stays open");
    assert.deepEqual(labelsOf(t), [labels.decision, labels.decidedWithoutYou]);
    assert.deepEqual(readDataLine(body).wentAhead.option, "B");
    assert.match(body, /^> \*\*I went ahead with B · A hollow pin on 2026-11-13 17:40 UTC without you,\*\* and moved this to "decided without you"\. Close this issue with no comment to keep it, or with a comment to change it\. Undoing it later: swap one icon in one component\.$/m, "the request's own body says it went ahead");
    assert.doesNotMatch(body, /^> \*\*If you don't answer by/m);
    assert.equal(t.readComment(result.note.id).body, fixture("fallback-comment.md"), "the fallback comment matches its fixture");
    const records = notesOn(t, TICKET);
    assert.equal(records.length, 1);
    assert.equal(records[0].c.body, fixture("fallback-record.md"), "the ticket record matches its fixture");
    assert.match(records[0].c.body, /^\*\*Decided by fallback, not reviewed by the maintainer\*\*/);
    assert.match(records[0].c.body, /\*\*Unanswered for:\*\* 2h 3m/);
    assert.doesNotMatch(records[0].c.body.replace("not reviewed by the maintainer", ""), claimsMaintainerDecided, "the record claims no maintainer decision");
    assert.doesNotMatch(t.readComment(result.note.id).body, claimsMaintainerDecided);
    assert.equal(committedFor(t), true, "the planner sees the fallback committed");
    console.log("ok: fallback commits in one edit of body and label, then posts the note and record its fixtures show");

    const ahead = fetchAnswer(REQUEST, { tracker: t, repos });
    assert.equal(ahead.state, "went-ahead");
    assert.deepEqual([ahead.wentAhead.option, ahead.wentAhead.name, ahead.wentAhead.owner, ahead.wentAhead.url], ["B", "A hollow pin", OWNER, result.note.url]);
    assert.match(formatAnswer(ahead), /went ahead without the maintainer with B · A hollow pin/);
    refused(() => fallbackRequest(REQUEST, OWNER, doing, { tracker: t, repos, now }), /already went ahead with B · A hollow pin/, "a second time");
    refused(() => withdrawRequest(REQUEST, "no longer needed", { tracker: t, repos }), /already went ahead .* only the maintainer closes it/, "a withdrawal of a request that went ahead (withdraw)");
    refused(() => recordAnswer(REQUEST, { tracker: t, repos }), /it went ahead with B · A hollow pin and waits for the maintainer to keep or change it/, "a record before the maintainer keeps or changes it (record)");
    console.log("ok: read reports went-ahead until the maintainer closes the request");

    const kept = tracker();
    fallbackRequest(REQUEST, OWNER, doing, { tracker: kept, repos, now });
    kept.closeAs("completed", "2026-11-13T19:00:00Z");
    assert.equal(fetchAnswer(REQUEST, { tracker: kept, repos }).state, "kept");
    recordAnswer(REQUEST, { tracker: kept, repos });
    const keptNotes = notesOn(kept, TICKET);
    assert.deepEqual(keptNotes.map((e) => e.note.kind), ["fallback-record", "record"], "keeping adds a second record beside the fallback record");
    assert.equal(keptNotes[1].c.body, fixture("kept-record.md"));
    console.log("ok: a went-ahead request closed with no comment reads as kept, and record adds \"Kept by the maintainer\"");

    const changedT = tracker();
    fallbackRequest(REQUEST, OWNER, doing, { tracker: changedT, repos, now });
    const said = "Not B. Use C, the small dot, and drop the pop-up.";
    const id = changedT.say(said, "2026-11-13T19:00:00Z");
    assert.equal(fetchAnswer(REQUEST, { tracker: changedT, repos }).state, "question", "a comment without closing on a request that went ahead is a question");
    changedT.closeAs("completed", "2026-11-13T19:00:01Z");
    const changed = fetchAnswer(REQUEST, { tracker: changedT, repos });
    assert.deepEqual([changed.state, changed.words.map((w) => [w.id, w.body])], ["changed", [[id, said]]]);
    assert.match(formatAnswer(changed), /changed the fallback B · A hollow pin in their words/);
    recordAnswer(REQUEST, { tracker: changedT, repos });
    assert.equal(notesOn(changedT, TICKET)[1].c.body, fixture("changed-record.md"));
    console.log("ok: a went-ahead request closed with a comment reads as changed, in the maintainer's words, and record adds the change as their decision");

    const notPlanned = tracker();
    fallbackRequest(REQUEST, OWNER, doing, { tracker: notPlanned, repos, now });
    notPlanned.closeAs("not_planned", "2026-11-13T19:00:00Z");
    assert.equal(fetchAnswer(REQUEST, { tracker: notPlanned, repos }).state, "unclear", "closed as not planned with no comment stays unclear");
  }

  {
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
    assert.match(body, /^> \*\*I went ahead with B · A hollow pin on 2026-11-13 17:40 UTC without you,\*\*/m, "a revision of a request that went ahead keeps saying so");
    assert.equal(readDataLine(body).wentAhead.at, "2026-11-13T17:40:00.000Z", "the revision carries the marker forward");
    assert.equal(readNote(asked.readComment(revised.note.id).body).fallback, undefined, "the revision note restarts no clock");
    assert.equal(fetchAnswer(REQUEST, { tracker: asked, repos }).state, "went-ahead", "the revision answers the question and the fallback stands");
    refused(() => fallbackRequest(REQUEST, OWNER, doing, { tracker: asked, repos, now: at("2026-11-14T00:00:00Z") }), /already went ahead/, "after a revision of a request that went ahead");
    console.log("ok: revise answers a question on a request that went ahead, keeping the marker and restarting no clock");

    const t = tracker();
    t.say("Can I see B on a phone first?", "2026-11-13T16:30:00Z");
    refused(() => fallbackRequest(REQUEST, OWNER, doing, { tracker: t, repos, now: at("2026-11-13T20:00:00Z") }), /question is open/, "past its time while the question is open (clock stopped)");
    const restarted = "2026-11-13T18:45:00.000Z";
    t.revise({ fallback: { option: "B", at: restarted } }, "2026-11-13T16:45:00Z");
    assert.equal(fetchAnswer(REQUEST, { tracker: t, repos }).state, "waiting", "a revision answers the question");
    refused(() => fallbackRequest(REQUEST, OWNER, doing, { tracker: t, repos, now: at("2026-11-13T18:44:00Z") }), /falls back at 2026-11-13 18:45 UTC, 1m from now/, "before the restarted time (clock restarted at the revision)");
    const result = fallbackRequest(REQUEST, OWNER, doing, { tracker: t, repos, now: at("2026-11-13T18:45:00Z") });
    assert.match(t.readComment(result.note.id).body, /\*\*Unanswered for:\*\* 2h 0m, since it was last revised at 2026-11-13 16:45 UTC\./);
    console.log("ok: the clock stops at a maintainer comment and starts again at the revision");

    const reopened = tracker();
    reopened.closeAs("not_planned", "2026-11-13T16:00:00Z");
    reopened.revise({ fallback: { option: "B", at: "2026-11-13T18:10:00.000Z" } }, "2026-11-13T16:10:00Z");
    reopened.reopenAs("2026-11-13T16:10:01Z");
    fallbackRequest(REQUEST, OWNER, doing, { tracker: reopened, repos, now: at("2026-11-13T18:11:00Z") });
    assert.equal(fetchAnswer(REQUEST, { tracker: reopened, repos }).state, "went-ahead", "the reopen that revise makes before the fallback does not interrupt it");
    console.log("ok: a fallback after revise reopened an unclear request commits");
  }

  {
    const questionFirst = tracker({ beforeCommit: (self) => self.say("Wait. Can you show C first?", "2026-11-13T17:40:00Z") });
    assert.throws(() => fallbackRequest(REQUEST, OWNER, doing, { tracker: questionFirst, repos, now }), /#9001 changed while going ahead: it now reads question, with the maintainer's comment https:\/\/github\.com\/acme\/tickets\/issues\/9001#issuecomment-\d+; read it again before acting\nRolled back: took the fallback marker and the label maintainer: decided without you back out of #9001 in one edit; nothing was posted\./);
    const afterQ = fetchAnswer(REQUEST, { tracker: questionFirst, repos });
    assert.deepEqual([afterQ.state, afterQ.words.map((w) => w.body)], ["question", ["Wait. Can you show C first?"]], "the maintainer's question stays open and its words are kept");
    assert.deepEqual([questionFirst.issue(REQUEST).body, labelsOf(questionFirst), notesOn(questionFirst, TICKET), notesOn(questionFirst, REQUEST)], [decisionBody, [labels.decision], [], []], "the rollback restores the body exactly, removes the label and posts nothing");
    questionFirst.closeAs("completed", "2026-11-13T18:00:00Z");
    assert.equal(fetchAnswer(REQUEST, { tracker: questionFirst, repos }).state, "answered", "a later close is answered in the maintainer's words, never kept");
    const questionAfter = tracker({ afterCommit: (self) => self.say("Why B?", "2026-11-13T17:40:05Z") });
    assert.equal(fallbackRequest(REQUEST, OWNER, doing, { tracker: questionAfter, repos, now }).state, "question", "a question just after the commit is a question on a fallback that stands");
    assert.deepEqual([fetchAnswer(REQUEST, { tracker: questionAfter, repos }).wentAhead.option, committedFor(questionAfter)], ["B", true]);
    console.log("ok: a maintainer question just before the commit cancels it; one just after leaves the fallback standing");

    const closedFirst = tracker({ beforeCommit: (self) => self.closeAs("completed", "2026-11-13T17:40:00Z") });
    assert.throws(() => fallbackRequest(REQUEST, OWNER, doing, { tracker: closedFirst, repos, now }), /changed while going ahead: it now reads accepted/);
    assert.deepEqual([fetchAnswer(REQUEST, { tracker: closedFirst, repos }).state, closedFirst.issue(REQUEST).body], ["accepted", decisionBody], "a close just before the commit accepted the recommendation; the fallback is taken back out");
    assert.doesNotMatch(recordAnswer(REQUEST, { tracker: closedFirst, repos }).records.map((r) => closedFirst.readComment(r.id).body).join(""), /Kept by the maintainer/);
    const closedAfter = tracker({ afterCommit: (self) => self.closeAs("completed", "2026-11-13T17:40:05Z") });
    assert.equal(fallbackRequest(REQUEST, OWNER, doing, { tracker: closedAfter, repos, now }).state, "kept", "a no-comment close just after the commit keeps the committed fallback");
    recordAnswer(REQUEST, { tracker: closedAfter, repos });
    assert.deepEqual(notesOn(closedAfter, TICKET).map((e) => e.note.kind), ["fallback-record", "record"]);
    assert.match(notesOn(closedAfter, TICKET).at(-1).c.body, /^\*\*Kept by the maintainer\*\*/);
    console.log("ok: a close just before the commit is an ordinary answer; one just after keeps the fallback");

    const revisedFirst = tracker({ beforeCommit: (self) => self.revise({ fallback: { option: "A", at: "2026-11-13T19:40:01.000Z" } }, "2026-11-13T17:40:00Z") });
    assert.throws(() => fallbackRequest(REQUEST, OWNER, doing, { tracker: revisedFirst, repos, now }), /changed while going ahead: it now reads waiting/);
    assert.deepEqual([fetchAnswer(REQUEST, { tracker: revisedFirst, repos }).wentAhead, labelsOf(revisedFirst)], [undefined, [labels.decision]], "a revision just before the commit cancels the older fallback");
    const waitsFirst = tracker({ beforeCommit: (self) => self.revise({ fallback: undefined, waits: "waives-check" }, "2026-11-13T17:40:00Z") });
    assert.throws(() => fallbackRequest(REQUEST, OWNER, doing, { tracker: waitsFirst, repos, now }), /changed while going ahead/);
    assert.deepEqual([fetchAnswer(REQUEST, { tracker: waitsFirst, repos }).wentAhead, committedFor(waitsFirst), labelsOf(waitsFirst)], [undefined, false, [labels.decision]], "a revision just before the commit that removes the fallback cancels it");
    const waitsStopped = tracker();
    waitsStopped.revise({ fallback: undefined, waits: "waives-check" }, "2026-11-13T17:39:00Z");
    waitsStopped.commitBy({});
    assert.deepEqual([fetchAnswer(REQUEST, { tracker: waitsStopped, repos }).wentAhead, committedFor(waitsStopped)], [undefined, false], "a stopped run's commit over a revision that removed the fallback does not count");
    const plainWaits = JSON.parse(fixture("decision.json"));
    plainWaits.showsOnScreen = false;
    plainWaits.background = plainWaits.background.filter((block) => typeof block === "string");
    for (const option of plainWaits.options) {
      delete option.pictures;
      option.example ??= `The ${option.name.toLowerCase()} beside the chosen option.`;
    }
    delete plainWaits.fallback;
    plainWaits.waits = "waives-check";
    const noted = tracker();
    const revisedToWait = reviseRequest(REQUEST, plainWaits, "Now waits.", { pictures: scratch, tracker: noted, repos, now: at("2026-11-13T17:00:00Z"), timeZone: "UTC" });
    assert.equal(readNote(noted.readComment(revisedToWait.note.id).body).fallback, null, "revise records that the request no longer has a fallback");
    console.log("ok: a revision just before the commit cancels it, including one that removes the fallback");

    const failedBefore = tracker({ failCommit: "before" });
    assert.throws(() => fallbackRequest(REQUEST, OWNER, doing, { tracker: failedBefore, repos, now }), /HTTP 502: edit failed/);
    assert.deepEqual([fetchAnswer(REQUEST, { tracker: failedBefore, repos }).state, failedBefore.issue(REQUEST).body, notesOn(failedBefore, TICKET)], ["waiting", decisionBody, []], "a commit edit that fails changes nothing");
    const failedAfter = tracker({ failCommit: "after" });
    const landed = fallbackRequest(REQUEST, OWNER, doing, { tracker: failedAfter, repos, now });
    assert.deepEqual([landed.state, notesOn(failedAfter, TICKET).length], ["went-ahead", 1], "an edit whose response was lost but which landed is read back as committed");
    console.log("ok: a failed commit edit changes nothing, and one that landed despite an error is read back and finished");
  }

  {
    const crashed = tracker({ failNote: true });
    assert.throws(() => fallbackRequest(REQUEST, OWNER, doing, { tracker: crashed, repos, now }), /the process stopped before the note/);
    assert.deepEqual([fetchAnswer(REQUEST, { tracker: crashed, repos }).state, committedFor(crashed), notesOn(crashed, REQUEST), notesOn(crashed, TICKET)], ["went-ahead", true, [], []], "a crash after the commit leaves a committed fallback with no history yet");
    crashed.comment = ({ number, bodyFile }) => ({ id: crashed.say(readFileSync(bodyFile, "utf8"), undefined, number) });
    const finished = crashed;
    const completed = fallbackRequest(REQUEST, OWNER, doing, { tracker: finished, repos, now: at("2026-11-13T17:45:00Z") });
    assert.deepEqual(completed.completed, ["the note on #9001", "the record on #2271"], "the owner's rerun posts the missing note and record");
    assert.deepEqual([notesOn(crashed, REQUEST).length, notesOn(crashed, TICKET).length], [1, 1]);
    refused(() => fallbackRequest(REQUEST, OWNER, doing, { tracker: finished, repos, now: at("2026-11-13T17:46:00Z") }), /already went ahead/, "once its history is complete");
    const lines = [];
    const crashedAgain = tracker({ failNote: true });
    assert.throws(() => fallbackRequest(REQUEST, OWNER, doing, { tracker: crashedAgain, repos, now }));
    crashedAgain.comment = ({ number, bodyFile }) => ({ id: crashedAgain.say(readFileSync(bodyFile, "utf8"), undefined, number) });
    const file = path.join(scratch, "doing-again.md");
    writeFileSync(file, doing);
    assert.equal(main(["fallback", `${REQUEST}`, OWNER, file], { repos, tracker: crashedAgain, out: (line) => lines.push(line), now }), 0);
    assert.match(lines.join("\n"), /^#9001 had already gone ahead with B · A hollow pin; posted what was missing: the note on #9001, the record on #2271\.$/);
    const keptLater = tracker({ failNote: true });
    assert.throws(() => fallbackRequest(REQUEST, OWNER, doing, { tracker: keptLater, repos, now }));
    keptLater.comment = ({ number, bodyFile }) => ({ id: keptLater.say(readFileSync(bodyFile, "utf8"), undefined, number) });
    keptLater.closeAs("completed", "2026-11-13T19:00:00Z");
    recordAnswer(REQUEST, { tracker: keptLater, repos });
    assert.deepEqual(notesOn(keptLater, TICKET).map((e) => e.note.kind), ["fallback-record", "record"], "record completes a crashed fallback's history before adding the second record");
    console.log("ok: a crash between the commit and the note is finished by the owner's next fallback, or by record");
  }

  {
    const crossed = tracker();
    crossed.say("Wait. Can I see C first?", "2026-11-13T17:39:10Z");
    crossed.commitBy({});
    assert.deepEqual([fetchAnswer(REQUEST, { tracker: crossed, repos }).state, fetchAnswer(REQUEST, { tracker: crossed, repos }).wentAhead, committedFor(crossed)], ["question", undefined, false], "a commit that landed after a maintainer question, by a run that stopped before its check, does not count for any reader");
    assert.throws(() => fallbackRequest(REQUEST, OWNER, doing, { tracker: crossed, repos, now: at("2026-11-13T17:50:00Z") }), (error) => error instanceof RequestRefused && /question is open/.test(error.reasons[0]) && /removed a fallback that did not count \(B at 2026-11-13 17:39 UTC\) and the label maintainer: decided without you/.test(error.reasons[1]));
    assert.deepEqual([readDataLine(crossed.issue(REQUEST).body).wentAhead, labelsOf(crossed)], [undefined, [labels.decision]], "the owner's next fallback takes the uncounted fallback back out, even when refused");
    assert.match(crossed.issue(REQUEST).body, /^> \*\*If you don't answer by/m, "taking it out restores the body's original fallback line");
    assert.throws(() => fallbackRequest(REQUEST, "someone else", doing, { tracker: tracker(), repos, now }), RequestRefused);
    console.log("ok: an uncounted commit left by a stopped run is ignored by every reader and removed by the owner's next fallback");

    const afterClose = tracker();
    afterClose.closeAs("completed", "2026-11-13T17:39:00Z");
    afterClose.commitBy({});
    assert.equal(fetchAnswer(REQUEST, { tracker: afterClose, repos }).state, "accepted", "a commit that landed after a close counts for nothing, and the close keeps its meaning");
    const overwritten = tracker();
    overwritten.revise({ fallback: { option: "B", at: "2026-11-13T19:38:50.000Z" } }, "2026-11-13T17:38:50Z");
    overwritten.commitBy({ fallbackAt });
    overwritten.issues.get(REQUEST).body = withMarker(withData({ fallback: { option: "B", at: fallbackAt } }), { option: "B", name: "A hollow pin", owner: OWNER, at: "2026-11-13T17:39:30.000Z", fallbackAt }).body;
    assert.deepEqual([fetchAnswer(REQUEST, { tracker: overwritten, repos }).wentAhead, committedFor(overwritten)], [undefined, false], "a commit that overwrote a revision made just before it does not count");
    overwritten.closeAs("completed", "2026-11-13T18:00:00Z");
    const unclear = fetchAnswer(REQUEST, { tracker: overwritten, repos });
    assert.equal(unclear.state, "unclear");
    assert.match(unclear.why, /closed with no comment after a fallback to B was written into the request without counting/);
    assert.throws(() => recordAnswer(REQUEST, { tracker: overwritten, repos }), /it is unclear/);
    overwritten.revise({ fallback: undefined, waits: "confirms-built" }, "2026-11-13T18:10:00Z");
    overwritten.reopenAs("2026-11-13T18:10:01Z");
    overwritten.closeAs("completed", "2026-11-13T18:20:00Z");
    assert.equal(fetchAnswer(REQUEST, { tracker: overwritten, repos }).state, "accepted", "a revision replaces the uncounted marker, so the revised request's close is recorded");
    assert.equal(recordAnswer(REQUEST, { tracker: overwritten, repos }).answer.state, "accepted");
    console.log("ok: a no-comment close after an uncounted commit is unclear, and a revision clears it");

    const withdrawn = tracker();
    withdrawn.say("Wait.", "2026-11-13T17:39:10Z");
    withdrawn.commitBy({});
    assert.equal(withdrawRequest(REQUEST, "no longer needed", { tracker: withdrawn, repos }).state, "withdrawn");
    assert.deepEqual([readDataLine(withdrawn.issue(REQUEST).body).wentAhead, labelsOf(withdrawn)], [undefined, [labels.decision]], "withdraw takes an uncounted fallback out before closing");
    console.log("ok: withdraw takes an uncounted fallback out before closing");

    const listed = tracker();
    listed.say("Wait. Can I see C first?", "2026-11-13T17:39:10Z");
    listed.commitBy({});
    const stoppedGroups = listRequests(listed, repos);
    assert.deepEqual([stoppedGroups.decisions.map((i) => i.number), stoppedGroups.decidedWithoutYou.map((i) => i.number)], [[REQUEST], []], "list keeps a request whose commit does not count among the decisions, not under went ahead");
    const listedAhead = tracker();
    fallbackRequest(REQUEST, OWNER, doing, { tracker: listedAhead, repos, now });
    const aheadGroups = listRequests(listedAhead, repos);
    assert.deepEqual([aheadGroups.decisions.map((i) => i.number), aheadGroups.decidedWithoutYou.map((i) => i.number)], [[], [REQUEST]], "list shows a committed fallback under went ahead");
    console.log("ok: list applies the same commit rule as every other reader");
  }

  {
    const t = tracker();
    fallbackRequest(REQUEST, OWNER, doing, { tracker: t, repos, now });
    const reordered = t.issue(REQUEST).body.replace("### B · A hollow pin (recommended)", "### B · A small dot on the strip (recommended)").replace("### C · A small dot on the strip", "### C · A hollow pin");
    t.issues.get(REQUEST).body = reordered;
    t.closeAs("completed", "2026-11-13T19:00:00Z");
    const kept = fetchAnswer(REQUEST, { tracker: t, repos });
    assert.deepEqual([kept.state, kept.wentAhead.option, kept.wentAhead.name], ["kept", "B", "A hollow pin"], "the option taken is named from the commit's marker, not from a body revised since");
    recordAnswer(REQUEST, { tracker: t, repos });
    assert.match(notesOn(t, TICKET).at(-1).c.body, /kept the fallback B · A hollow pin, taken at/);
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
    assert.equal(main(["fallback", `#${REQUEST}`, OWNER, file], { repos, tracker: t, out: (line) => lines.push(line), now }), 0);
    assert.match(lines.join("\n"), /^Went ahead on #9001 with B · A hollow pin: https:\/\/github\.com\/acme\/tickets\/issues\/9001#issuecomment-\d+\nLabelled "maintainer: decided without you"; the request stays open for the maintainer to keep or change\.\nRecorded: #2271 /);
    console.log("ok: the fallback command line reports the note, the label and the records");
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
