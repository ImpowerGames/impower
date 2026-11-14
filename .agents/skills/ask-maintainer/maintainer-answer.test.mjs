import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readRepos } from "../../repos.mjs";
import { findRun, findTypedWords, transcriptMessages } from "./chat-transcript.mjs";
import { TOOL_MARK, commentAuthor } from "./github-app.mjs";
import {
  RequestRefused,
  answerFromChat,
  dataLine,
  fetchAnswer,
  ghTracker,
  main,
  readAnswer,
  readNote,
  toolText,
  recordAnswer,
  recordBody,
  reviseRequest,
  unquote,
  waitForRequests,
  withdrawRequest,
} from "./maintainer-request.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureFile = (name) => path.join(here, "fixtures", name);
const fixture = (name) => readFileSync(fixtureFile(name), "utf8").replace(/\r\n/g, "\n");
const repos = readRepos();
const M = repos.maintainer.login;
const labels = repos.maintainer.labels;
const scratch = mkdtempSync(path.join(tmpdir(), "maintainer-answer-test-"));
console.log(`Scratch directory: ${scratch}`);

const REQUEST = 9001;
const filedAt = "2026-11-13T15:37:00Z";
const decisionBody = fixture("decision-body.md");
const taskBody = fixture("task-body.md");
const issueUrl = (n) => `https://github.com/acme/tickets/issues/${n}`;
const issue = (over = {}) => ({
  number: REQUEST,
  title: "What should mark a choice the preview picked by itself? (#2271)",
  html_url: issueUrl(REQUEST),
  state: "open",
  state_reason: null,
  created_at: filedAt,
  closed_at: null,
  closed_by: null,
  labels: [{ name: labels.decision }],
  body: decisionBody,
  ...over,
});
const closedBy = (reason, at = "2026-11-13T16:10:05Z", login = M) => ({ state: "closed", state_reason: reason, closed_at: at, closed_by: { login, type: "User" } });
const comment = (id, body, at, login = M) => ({ id, html_url: `${issueUrl(REQUEST)}#issuecomment-${id}`, created_at: at, updated_at: at, user: { login, type: "User" }, body });
const toolComment = (id, text, note, at) => comment(id, `${text}\n\n${TOOL_MARK}\n<!-- maintainer-request-note ${JSON.stringify(note)} -->\n`, at);
const typed = "Go with B, the hollow pin.\r\nBut keep it **small** on phones — under 12px.  \r\n\r\nThanks!";

const timelineOf = (value, comments = [], events = []) => {
  const items = [...comments.map((entry) => ({ event: "commented", ...entry })), ...events];
  if (value.state === "closed" && !events.some((entry) => entry.event === "closed")) items.push({ event: "closed", created_at: value.closed_at, actor: value.closed_by });
  return items.map((item, order) => ({ item, order })).sort((x, y) => Date.parse(x.item.created_at) - Date.parse(y.item.created_at) || x.order - y.order).map(({ item }) => item);
};
const answerOf = (value, comments = [], options = repos, events = []) => readAnswer(value, timelineOf(value, comments, events), options);

const states = (cases) => {
  for (const [label, value, expected, check] of cases) {
    const answer = answerOf(value.issue, value.comments);
    assert.equal(answer.state, expected, `${label}: ${JSON.stringify({ state: answer.state, why: answer.why })}`);
    check?.(answer);
    console.log(`ok: read reports ${expected} for ${label}`);
  }
};

function fakeTracker({ issues = [], comments = [], polls = null } = {}) {
  const t = { issues: new Map(issues.map((i) => [i.number, structuredClone(i)])), store: new Map(comments.map((c) => [c.id, { issue: c.issue ?? REQUEST, ...structuredClone(c) }])), next: 6000, calls: [], log: [], seq: 0, now: new Date("2026-11-13T16:20:00Z") };
  for (const entry of t.store.values()) entry.seq = t.seq++;
  for (const value of t.issues.values()) if (value.state === "closed") t.log.push({ issue: value.number, event: "closed", created_at: value.closed_at, actor: value.closed_by, seq: t.seq++ });
  const tick = () => {
    t.now = new Date(t.now.getTime() + 1000);
    return t.now.toISOString().replace(".000Z", "Z");
  };
  const host = (body, attach) => {
    let text = body;
    for (const file of attach) {
      const url = `https://github.com/user-attachments/assets/${Buffer.from(file).toString("hex")}`;
      text = text.split(`](${file})`).join(`](${url})`);
    }
    return text;
  };
  const post = (number, body, attach = []) => {
    const id = t.next++;
    const at = tick();
    t.store.set(id, { id, issue: number, html_url: `${issueUrl(number)}#issuecomment-${id}`, created_at: at, updated_at: at, user: { login: M, type: "User" }, body: host(body, attach), seq: t.seq++ });
    return id;
  };
  const issueOf = (n) => {
    const found = t.issues.get(n);
    if (!found) throw new Error(`no issue ${n}`);
    return found;
  };
  Object.assign(t, {
    repo: "acme/tickets",
    issue: (n) => {
      t.calls.push(["issue", n]);
      return structuredClone(issueOf(n));
    },
    comments: (n) => {
      t.calls.push(["comments", n]);
      return structuredClone([...t.store.values()].filter((c) => c.issue === n).sort((a, b) => a.id - b.id));
    },
    comment: ({ number, bodyFile, attach }) => {
      t.calls.push(["comment", number, attach]);
      return { id: post(number, readFileSync(bodyFile, "utf8"), attach) };
    },
    readComment: (id) => structuredClone(t.store.get(id)),
    editComment: (id, bodyFile) => {
      t.calls.push(["editComment", id]);
      t.store.get(id).body = readFileSync(bodyFile, "utf8");
    },
    deleteComment: (id) => {
      t.calls.push(["deleteComment", id]);
      t.store.delete(id);
    },
    editBody: (n, bodyFile) => {
      t.calls.push(["editBody", n]);
      issueOf(n).body = readFileSync(bodyFile, "utf8");
    },
    editTitle: (n, title) => {
      t.calls.push(["editTitle", n]);
      issueOf(n).title = title;
    },
    reopen: (n) => {
      t.calls.push(["reopen", n]);
      Object.assign(issueOf(n), { state: "open", state_reason: "reopened", closed_at: null, closed_by: null });
      t.log.push({ issue: n, event: "reopened", created_at: tick(), actor: { login: M }, seq: t.seq++ });
    },
    close: (n, reason, bodyFile) => {
      t.calls.push(["close", n, reason]);
      post(n, readFileSync(bodyFile, "utf8"));
      t.closeAs(n, reason, { login: M, type: "User" }, tick());
    },
    closeAs: (n, reason, actor, at) => {
      Object.assign(issueOf(n), { state: "closed", state_reason: reason, closed_at: at, closed_by: actor });
      t.log.push({ issue: n, event: "closed", created_at: at, actor, seq: t.seq++ });
    },
    poll: (n, etag) => polls(n, etag),
    timeline: (n) => {
      t.calls.push(["timeline", n]);
      const posted = [...t.store.values()].filter((entry) => entry.issue === n).map((entry) => ({ event: "commented", ...entry }));
      return structuredClone([...posted, ...t.log.filter((entry) => entry.issue === n)].sort((x, y) => x.seq - y.seq));
    },
  });
  return t;
}

try {
  {
    const who = { maintainerLogin: M, app: repos.maintainer.app };
    assert.equal(commentAuthor(comment(1, "B", filedAt), who), "maintainer");
    assert.equal(commentAuthor(comment(2, `B\n${TOOL_MARK}`, filedAt), who), "tool");
    assert.equal(commentAuthor(comment(4, "B", filedAt, "someone-else"), who), "other");
    console.log("ok: a maintainer-login comment is the maintainer's unless it carries the tool's marker or data line; another login's comment is neither");
  }

  const answerComment = comment(101, typed, "2026-11-13T16:10:04Z");
  states([
    ["an open request with no comment", { issue: issue(), comments: [] }, "waiting", (a) => assert.deepEqual(a.fallback, { option: "B", at: "2026-11-13T17:37:00.000Z" })],
    ["an open request with only another account's comment", { issue: issue(), comments: [comment(100, "Looks good to me", "2026-11-13T15:50:00Z", "a-collaborator")] }, "waiting"],
    ["an open request the maintainer commented on", { issue: issue(), comments: [comment(100, "What does C look like in dark mode?", "2026-11-13T15:50:00Z")] }, "question", (a) => assert.equal(a.words[0].body, "What does C look like in dark mode?")],
    ["a request closed by the maintainer with a comment", { issue: issue(closedBy("completed")), comments: [answerComment] }, "answered", (a) => {
      assert.equal(a.words.length, 1);
      assert.equal(a.words[0].body, typed.replace(/\r\n/g, "\n"));
      assert.deepEqual([a.words[0].url, a.words[0].at], [answerComment.html_url, answerComment.created_at]);
      assert.deepEqual(a.closed, { at: "2026-11-13T16:10:05Z", by: M, reason: "completed" });
    }],
    ["a request closed by the maintainer with no comment", { issue: issue(closedBy("completed")), comments: [] }, "accepted", (a) => assert.deepEqual(a.recommended, { letter: "B", name: "A hollow pin" })],
    ["a task closed as completed", { issue: issue({ title: "Test the route strip on your phone (#2271, #2272)", body: taskBody, labels: [{ name: labels.task }], ...closedBy("completed") }), comments: [] }, "done"],
    ["a task closed as not planned", { issue: issue({ title: "Test the route strip on your phone (#2271, #2272)", body: taskBody, labels: [{ name: labels.task }], ...closedBy("not_planned") }), comments: [comment(102, "No phone with me this week.", "2026-11-13T16:10:00Z")] }, "will-not-do", (a) => assert.equal(a.words[0].body, "No phone with me this week.")],
    ["a decision closed as not planned with no comment", { issue: issue(closedBy("not_planned")), comments: [] }, "unclear", (a) => assert.match(a.why, /not planned with no comment/)],
    ["a decision closed as not planned with a comment", { issue: issue(closedBy("not_planned")), comments: [comment(103, "Neither; drop the marker.", "2026-11-13T16:10:00Z")] }, "answered"],
    ["a request closed by another account", { issue: issue(closedBy("completed", "2026-11-13T16:10:05Z", "a-collaborator")), comments: [] }, "unclear", (a) => assert.match(a.why, /closed by a-collaborator, not by the maintainer/)],
    ["a request the tool withdrew", { issue: issue(closedBy("not_planned")), comments: [toolComment(104, "Withdrawn by the ask-maintainer tool: no longer needed.", { kind: "withdrawn", reason: "no longer needed" }, "2026-11-13T16:10:00Z")] }, "withdrawn", (a) => assert.equal(a.reason, "no longer needed")],
  ]);

  {
    const recorded = JSON.parse(fixture("recorded-answer.json"));
    const answer = readAnswer(recorded.issue, recorded.timeline, repos);
    assert.deepEqual([answer.state, answer.closed.reason, answer.tickets, answer.words.length], ["answered", "completed", [2312], 1]);
    assert.equal(answer.words[0].body, recorded.timeline.find((item) => item.event === "commented").body, "the words are the recorded comment, character for character");
    const live = answerOf({ ...recorded.issue, state: "open", state_reason: null, closed_at: null, closed_by: null });
    assert.deepEqual([live.state, live.fallback.option], ["waiting", "A"]);
    console.log("ok: read reports the answer from GitHub responses recorded in the live run");
  }

  {
    const marked = { issue: issue(closedBy("completed")), comments: [comment(110, `B\n\n${TOOL_MARK}`, "2026-11-13T16:00:00Z"), toolComment(111, "Revised by the ask-maintainer tool.", { kind: "revised" }, "2026-11-13T16:01:00Z")] };
    const read = answerOf(marked.issue, marked.comments);
    assert.equal(read.state, "accepted", "a comment the tool posted, with the maintainer's login, is never the maintainer's words");
    assert.deepEqual(read.words, []);
    const open = answerOf(issue(), marked.comments);
    assert.equal(open.state, "waiting", "the tool's own comments are not a question either");
    console.log("ok: a comment the tool posted through the maintainer's login is not taken as the maintainer's words or question");
  }

  {
    const revised = [
      comment(120, "What does C look like in dark mode?", "2026-11-13T15:50:00Z"),
      toolComment(121, "Revised by the ask-maintainer tool.", { kind: "revised", fallback: "2026-11-13T18:00:00.000Z" }, "2026-11-13T16:00:00Z"),
    ];
    const afterRevision = answerOf(issue(), revised);
    assert.equal(afterRevision.state, "waiting", "a question answered by a revision no longer stops the clock");
    assert.deepEqual([afterRevision.shown.revised, afterRevision.shown.at, afterRevision.shown.options, afterRevision.shown.pictures], [true, "2026-11-13T16:00:00Z", 5, 7]);
    const closedLater = answerOf(issue(closedBy("completed")), revised);
    assert.equal(closedLater.state, "accepted", "only the maintainer's comments since the last revision are the answer");
    const lateComment = answerOf(issue(closedBy("completed", "2026-11-13T16:10:05Z")), [comment(122, "Thanks!", "2026-11-13T16:30:00Z")]);
    assert.equal(lateComment.state, "accepted", "a comment after the close is not part of the answer");
    console.log("ok: the words are the maintainer's comments since the last revision and up to the close");
  }

  {
    const tracker = fakeTracker({ issues: [issue(closedBy("completed")), { number: 2271, title: "Route gutter", html_url: issueUrl(2271), state: "open" }], comments: [answerComment] });
    const result = recordAnswer(REQUEST, { tracker, repos });
    assert.equal(result.records.length, 1);
    const posted = tracker.store.get(result.records[0].id);
    assert.equal(posted.issue, 2271);
    assert.equal(posted.body.replace(/\r\n/g, "\n"), fixture("record-decision.md"), "the record matches the fixture");
    const quoted = /UTC:\n\n([\s\S]*?)\n\n_Posted by the ask-maintainer tool/.exec(posted.body)[1];
    assert.equal(unquote(quoted), typed.replace(/\r\n/g, "\n"), "the quoted words equal the maintainer's comment character for character");
    const confirmation = tracker.store.get(result.confirmation.id);
    assert.equal(confirmation.issue, REQUEST);
    assert.match(confirmation.body, /^Recorded by the ask-maintainer tool on #2271 \(\[record\]\(https:\/\/github\.com\/acme\/tickets\/issues\/2271#issuecomment-\d+\)\)\./);
    assert.deepEqual(readNote(confirmation.body), { kind: "recorded", request: REQUEST, answer: "answered:comments:101:1df727bf29881c01", records: [{ ticket: 2271, comment: result.records[0].id }] });
    const again = recordAnswer(REQUEST, { tracker, repos });
    assert.deepEqual([again.records[0].reused, again.confirmation.reused, tracker.calls.filter((c) => c[0] === "comment").length], [true, true, 2], "recording again posts nothing new");
    assert.equal(fetchAnswer(REQUEST, { tracker, repos }).state, "answered", "the tool's record and confirmation do not change the answer");
    console.log("ok: record posts the fixture comment on the affected ticket, quoting the maintainer's comment character for character, confirms on the request, and posts once");
  }

  {
    const accepted = recordBody(answerOf(issue(closedBy("completed"))));
    assert.match(accepted, /- \*\*Answer:\*\* accepted the recommendation by closing without comment at 2026-11-13 16:10 UTC\./);
    const task = recordBody(answerOf(issue({ title: "Test the route strip on your phone (#2271, #2272)", body: taskBody, labels: [{ name: labels.task }], ...closedBy("not_planned") })));
    assert.match(task, /- \*\*Task:\*\* Test the route strip on your phone\n- \*\*Answer:\*\* will not be done: closed as not planned by the maintainer at 2026-11-13 16:10 UTC\.\n- \*\*What was shown:\*\* the request as filed at 2026-11-13 15:37 UTC, with 1 picture\(s\)/);
    assert.doesNotMatch(task, /Recommended/);
    for (const state of [issue(), issue(closedBy("not_planned"))]) {
      const tracker = fakeTracker({ issues: [state] });
      assert.throws(() => recordAnswer(REQUEST, { tracker, repos }), RequestRefused);
      assert.equal(tracker.calls.filter((c) => c[0] === "comment").length, 0);
    }
    console.log("ok: record words an accepted recommendation and a task outcome, and refuses a waiting or unclear request without posting");
  }

  {
    const claude = fixtureFile("claude-transcript.jsonl");
    const codex = fixtureFile("codex-transcript.jsonl");
    assert.equal(transcriptMessages(fixture("claude-transcript.jsonl")).runner, "claude-code");
    assert.equal(transcriptMessages(fixture("codex-transcript.jsonl")).runner, "codex");
    const accepted = (file, words, session, at) => {
      const found = findTypedWords(words, file);
      assert.deepEqual([found.ok, found.session, found.at], [true, session, at], `${path.basename(file)} accepts ${JSON.stringify(words)}: ${found.reason}`);
    };
    const refused = (file, words, pattern) => {
      const found = findTypedWords(words, file);
      assert.equal(found.ok, false, `${path.basename(file)} refuses ${JSON.stringify(words)}`);
      assert.match(found.reason, pattern);
    };
    accepted(claude, "Let's go with the hollow pin, it reads better on the phone.\nKeep the badge small.", "5f0c2a8e-claude-fixture", "2026-11-13T16:02:11.000Z");
    accepted(claude, "the hollow pin", "5f0c2a8e-claude-fixture", "2026-11-13T16:02:11.000Z");
    accepted(codex, "Go with B, the hollow pin.", "01a1d63d-codex-fixture", "2026-11-13T16:02:11.000Z");
    for (const file of [claude, codex]) {
      refused(file, "Use the hollow pin", /no message the maintainer typed .* holds the words as one unbroken run/);
      refused(file, "the filled dot because it is the clearest marker", /only in an assistant message/);
      refused(file, "keep the outline ring as is", /only in tool output/);
      refused(file, "choose the outline ring", /only in a message the maintainer did not type/);
      refused(file, "ollow pin", /unbroken run/);
    }
    refused(claude, "solid square badge", /did not type/);
    refused(claude, "The user picked the striped flag", /did not type/);
    refused(claude, "the maintainer chose the dotted halo", /did not type/);
    assert.equal(findRun("I pick B.", "B"), 7);
    assert.equal(findRun("Bob", "B"), -1);
    console.log("ok: answer-from-chat finds words typed by the maintainer in Claude Code and Codex transcripts and refuses a paraphrase, assistant text, tool output and injected messages");

    const tracker = fakeTracker({ issues: [issue(), { number: 2271, title: "Route gutter", html_url: issueUrl(2271), state: "open" }] });
    const wordsFile = path.join(scratch, "words.txt");
    writeFileSync(wordsFile, "Go with B, the hollow pin.\n");
    const relayed = answerFromChat(REQUEST, readFileSync(wordsFile, "utf8"), codex, { tracker, repos });
    assert.deepEqual([relayed.answer.state, relayed.answer.words[0].body, relayed.answer.words[0].relayed.session], ["answered", "Go with B, the hollow pin.", "01a1d63d-codex-fixture"]);
    assert.deepEqual(tracker.calls.find((c) => c[0] === "close"), ["close", REQUEST, "completed"]);
    const record = tracker.store.get(relayed.records[0].id).body;
    assert.match(record, /Typed by the maintainer in Codex session 01a1d63d-codex-fixture at 2026-11-13 16:02 UTC, found word for word in that session's transcript and relayed on the request in \[this comment\]/);
    assert.match(record, /\n> Go with B, the hollow pin\.\n/);
    const before = tracker.calls.length;
    assert.throws(() => answerFromChat(REQUEST, "Go with B", codex, { tracker, repos }), /already closed/);
    const paraphrase = fakeTracker({ issues: [issue()] });
    assert.throws(() => answerFromChat(REQUEST, "Use the hollow pin", claude, { tracker: paraphrase, repos }), /The words are refused/);
    assert.equal(paraphrase.calls.filter((c) => !["issue", "comments", "timeline"].includes(c[0])).length, 0, "a refused relay posts and closes nothing");
    assert.ok(tracker.calls.length >= before);
    console.log("ok: answer-from-chat posts the words marked as relayed with the session and time, closes the request and records it; a paraphrase changes nothing");
  }

  {
    const pictures = path.join(scratch, "pictures");
    mkdirSync(pictures);
    const png = (width) => {
      const bytes = Buffer.alloc(33);
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
      bytes.writeUInt32BE(13, 8);
      bytes.write("IHDR", 12, "latin1");
      bytes.writeUInt32BE(width, 16);
      return bytes;
    };
    for (const file of ["phone.png", "a.png", "b.png", "c.png", "d.png", "e.png"]) writeFileSync(path.join(pictures, file), png(840));
    writeFileSync(path.join(pictures, "b-list.png"), png(1280));
    const request = JSON.parse(fixture("decision.json"));
    const question = comment(130, "What does C look like in dark mode?", "2026-11-13T15:50:00Z");
    const tracker = fakeTracker({ issues: [issue({ body: decisionBody.replace(/src="\.\/([^"]+)"/g, 'src="https://github.com/user-attachments/assets/old-$1"') })], comments: [question] });
    const now = new Date("2026-11-13T16:20:00Z");
    request.question = "What should mark a choice the preview picked by itself, in light and dark themes?";
    const result = reviseRequest(REQUEST, request, "Added a dark-theme picture of option C and asked about both themes.", { pictures, tracker, repos, now, timeZone: "UTC" });
    const revisedIssue = tracker.issues.get(REQUEST);
    assert.equal(revisedIssue.title, "What should mark a choice the preview picked by itself, in light and dark themes? (#2271)");
    assert.doesNotMatch(revisedIssue.body, /src="\.\//, "every picture is hosted");
    assert.match(revisedIssue.body, /https:\/\/github\.com\/user-attachments\/assets\/2e2f622e706e67/);
    assert.equal(result.data.fallback.at, "2026-11-13T18:20:00.000Z", "the clock restarts from the revision");
    const note = tracker.store.get(result.note.id);
    assert.match(note.body, /^Revised by the ask-maintainer tool; GitHub's edit history keeps the earlier version\.\n\n\*\*What changed:\*\* Added a dark-theme picture of option C and asked about both themes\.\n\nThe clock starts again: if you don't answer by 18:20 today, I'll go ahead with B\./);
    assert.doesNotMatch(note.body, /!\[picture-/, "the staging pictures are gone from the note");
    const after = fetchAnswer(REQUEST, { tracker, repos });
    assert.deepEqual([after.state, after.fallback.at], ["waiting", "2026-11-13T18:20:00.000Z"], "the question before the revision no longer counts");
    const moved = JSON.parse(fixture("decision.json"));
    moved.tickets = [2272];
    assert.throws(() => reviseRequest(REQUEST, moved, "Moved it.", { pictures, tracker, repos, now }), /keeps the same tickets/);
    const answered = fakeTracker({ issues: [issue(closedBy("completed"))] });
    assert.throws(() => reviseRequest(REQUEST, JSON.parse(fixture("decision.json")), "x", { pictures, tracker: answered, repos, now }), /closed \(accepted\)/);
    const unclear = fakeTracker({ issues: [issue(closedBy("not_planned"))] });
    const reopened = reviseRequest(REQUEST, JSON.parse(fixture("decision.json")), "Which option did you mean?", { pictures, tracker: unclear, repos, now, timeZone: "UTC" });
    assert.equal(reopened.reopened, true);
    assert.equal(fetchAnswer(REQUEST, { tracker: unclear, repos }).state, "waiting", "an unclear answer is reopened with a question");
    const failing = fakeTracker({ issues: [issue()] });
    failing.editTitle = () => {
      throw new Error("network down");
    };
    const original = failing.issues.get(REQUEST).body;
    assert.throws(() => reviseRequest(REQUEST, request, "x", { pictures, tracker: failing, repos, now }), /Rolled back: deleted the revision note \d+; restored the earlier body/);
    assert.equal(failing.issues.get(REQUEST).body, original);
    assert.equal([...failing.store.values()].length, 0);
    for (const broken of ["editTitle", "reopen"]) {
      const other = fakeTracker({ issues: [issue(closedBy("completed", "2026-11-13T16:10:05Z", "a-collaborator"))] });
      other[broken] = () => {
        throw new Error("network down");
      };
      assert.throws(() => reviseRequest(REQUEST, request, "Which option did you mean?", { pictures, tracker: other, repos, now }), /Revising acme\/tickets#9001 failed/);
      const after = fetchAnswer(REQUEST, { tracker: other, repos });
      assert.deepEqual([after.state, after.closed.by, other.calls.some((c) => c[0] === "close")], ["unclear", "a-collaborator", false], `a revision whose ${broken} fails leaves another account's close unclear and never closes the request itself`);
      assert.equal(other.issues.get(REQUEST).body, decisionBody);
    }
    const revisedAfterClose = answerOf(issue(closedBy("completed", "2026-11-13T16:10:05Z")), [toolComment(160, "Revised by the ask-maintainer tool.", { kind: "revised" }, "2026-11-13T16:12:00Z")]);
    assert.deepEqual([revisedAfterClose.state, revisedAfterClose.why], ["unclear", "closed before its latest revision, so the close does not answer it"]);
    const closeItem = { event: "closed", created_at: "2026-11-13T16:10:05Z", actor: { login: M } };
    const revisionItem = { event: "commented", ...toolComment(161, "Revised by the ask-maintainer tool.", { kind: "revised" }, "2026-11-13T16:10:05Z") };
    const closedThenRevised = readAnswer(issue(closedBy("completed", "2026-11-13T16:10:05Z")), [closeItem, revisionItem], repos);
    const revisedThenClosed = readAnswer(issue(closedBy("completed", "2026-11-13T16:10:05Z")), [revisionItem, closeItem], repos);
    assert.deepEqual([closedThenRevised.state, revisedThenClosed.state], ["unclear", "accepted"], "in the same second, the timeline's order decides whether the close answers the revision");
    const reopenItem = { event: "reopened", created_at: "2026-11-13T16:00:00Z", actor: { login: M } };
    const relayItem = { event: "commented", ...toolComment(162, "Relayed.", { kind: "relayed", words: "Choose A instead of B.", session: "s", at: "2026-11-13T15:59:00Z", runner: "codex" }, "2026-11-13T16:00:00Z") };
    const finalClose = { event: "closed", created_at: "2026-11-13T16:00:02Z", actor: { login: M } };
    const relayAfterReopen = readAnswer(issue(closedBy("completed", "2026-11-13T16:00:02Z")), [reopenItem, relayItem, finalClose], repos);
    const relayBeforeReopen = readAnswer(issue(closedBy("completed", "2026-11-13T16:00:02Z")), [relayItem, reopenItem, finalClose], repos);
    assert.deepEqual([relayAfterReopen.state, relayAfterReopen.words[0]?.body, relayBeforeReopen.state], ["answered", "Choose A instead of B.", "accepted"], "in the same second, a relay after the reopen is the answer and one before it is void");
    const noClose = readAnswer(issue(closedBy("completed")), [], repos);
    assert.deepEqual([noClose.state, noClose.why], ["unclear", "the request is closed but its timeline holds no close, so the order of its answer cannot be read"], "a closed request whose timeline shows no close is unclear");
    console.log("ok: revise replaces the body with its pictures hosted, posts what changed, restarts the clock, reopens an unclear answer last, keeps the tickets, and rolls back a failed revision without closing the request itself");
  }

  {
    const tracker = fakeTracker({ issues: [issue()] });
    const withdrawn = withdrawRequest(REQUEST, "The route strip was dropped from the design", { tracker, repos });
    assert.deepEqual([withdrawn.state, withdrawn.reason], ["withdrawn", "The route strip was dropped from the design"]);
    assert.deepEqual(tracker.calls.find((c) => c[0] === "close"), ["close", REQUEST, "not_planned"]);
    assert.throws(() => withdrawRequest(REQUEST, "again", { tracker, repos }), /already closed \(withdrawn\)/);
    assert.throws(() => recordAnswer(REQUEST, { tracker, repos }), /withdrawn/);
    console.log("ok: withdraw closes a request as not planned with the reason, and nothing is recorded for it");
  }

  {
    const requests = [];
    const tracker = ghTracker("acme/tickets", (args) => {
      requests.push(args.slice(0, 4).join(" "));
      if (args.includes("PATCH")) throw Object.assign(new Error("HTTP 503: Service Unavailable"), { stderr: "HTTP 503" });
      return args.includes("POST") ? JSON.stringify({ id: 77 }) : "";
    });
    const note = path.join(scratch, "close-note.md");
    writeFileSync(note, "note");
    assert.throws(() => tracker.close(REQUEST, "completed", note), /HTTP 503/);
    assert.deepEqual(requests, ["api -X POST repos/acme/tickets/issues/9001/comments", "api -X PATCH repos/acme/tickets/issues/9001", "api -X DELETE repos/acme/tickets/issues/comments/77"], "a close that fails deletes the note it posted");
    const stubborn = ghTracker("acme/tickets", (args) => {
      if (args.includes("POST")) return JSON.stringify({ id: 78 });
      throw new Error("HTTP 503");
    });
    assert.throws(() => stubborn.close(REQUEST, "completed", note), /closing comment 78 could not be deleted .*; delete it by hand/);
    const relay = toolComment(170, "Relayed from chat.", { kind: "relayed", words: "Go with B", session: "s", at: "2026-11-13T16:00:00Z", runner: "codex" }, "2026-11-13T16:00:05Z");
    const withdrawal = toolComment(171, "Withdrawn.", { kind: "withdrawn", reason: "no longer needed" }, "2026-11-13T16:00:06Z");
    const later = comment(172, "Use C instead, the dot.", "2026-11-13T16:09:00Z");
    for (const stale of [relay, withdrawal]) {
      const read = answerOf(issue(closedBy("completed")), [stale, later]);
      assert.deepEqual([read.state, read.words.map((w) => w.body)], ["answered", ["Use C instead, the dot."]], `a ${readNote(stale.body).kind} note the maintainer answered after is not the answer`);
    }
    console.log("ok: a close that fails deletes its note, and a stale relay or withdrawal note never outranks the maintainer's later comment");
  }

  {
    const tracker = fakeTracker({ issues: [issue(closedBy("completed")), { number: 2271, title: "Route gutter", html_url: issueUrl(2271), state: "open" }], comments: [comment(180, "Use B, the hollow pin.", "2026-11-13T16:10:00Z")] });
    const first = recordAnswer(REQUEST, { tracker, repos });
    tracker.store.get(180).body = "Correction: use C, the dot.";
    const second = recordAnswer(REQUEST, { tracker, repos });
    assert.deepEqual([second.records[0].reused, second.confirmation.reused], [false, false], "an edited answer is recorded again");
    assert.notEqual(second.records[0].id, first.records[0].id);
    assert.match(tracker.store.get(second.records[0].id).body, /\n> Correction: use C, the dot\.\n/);
    assert.match(tracker.store.get(first.records[0].id).body, /\n> Use B, the hollow pin\.\n/, "the earlier record stays as the record of what was first said");
    console.log("ok: a maintainer comment edited after recording is recorded again with the new words, never confirmed against the old quotation");
  }

  {
    const task = issue({ title: "Test the route strip on your phone (#2271, #2272)", body: taskBody, labels: [{ name: labels.task }], ...closedBy("completed") });
    const tracker = fakeTracker({ issues: [task, { number: 2271, html_url: issueUrl(2271), state: "open" }, { number: 2272, html_url: issueUrl(2272), state: "open" }], comments: [comment(190, "I tested this on my phone.", "2026-11-13T16:10:00Z")] });
    const done = recordAnswer(REQUEST, { tracker, repos });
    tracker.reopen(REQUEST);
    tracker.closeAs(REQUEST, "not_planned", { login: M }, "2026-11-13T16:30:00Z");
    const changed = recordAnswer(REQUEST, { tracker, repos });
    assert.deepEqual([done.answer.state, changed.answer.state, changed.records[0].reused, changed.confirmation.reused], ["done", "will-not-do", false, false], "a changed outcome is recorded again");
    assert.match(tracker.store.get(changed.records[0].id).body, /- \*\*Answer:\*\* will not be done: closed as not planned by the maintainer/);
    console.log("ok: a task closed again with the other outcome is recorded again, never confirmed against the opposite record");
  }

  {
    const tracker = fakeTracker({ issues: [issue(closedBy("completed")), { number: 2271, html_url: issueUrl(2271), state: "open" }], comments: [comment(195, "Use B.  ", "2026-11-13T16:10:00Z")] });
    const result = recordAnswer(REQUEST, { tracker, repos });
    const body = tracker.store.get(result.records[0].id).body;
    assert.match(body, /\n> Use B\. {2}\n\n_Posted by the ask-maintainer tool/, "trailing spaces on the last quoted line are kept");
    assert.equal(unquote(/UTC:\n\n([\s\S]*?)\n\n_Posted by the ask-maintainer tool/.exec(body)[1]), "Use B.  ");
    console.log("ok: record keeps the maintainer's last line character for character, trailing spaces included");
  }

  {
    const codex = fixtureFile("codex-transcript.jsonl");
    const tracker = fakeTracker({ issues: [issue(), { number: 2271, html_url: issueUrl(2271), state: "open" }] });
    withdrawRequest(REQUEST, "No longer needed", { tracker, repos });
    tracker.reopen(REQUEST);
    assert.equal(fetchAnswer(REQUEST, { tracker, repos }).state, "waiting", "a reopened withdrawn request waits again");
    const relayed = answerFromChat(REQUEST, "Go with B, the hollow pin.", codex, { tracker, repos });
    assert.deepEqual([relayed.answer.state, relayed.answer.words[0].body, relayed.records.length], ["answered", "Go with B, the hollow pin.", 1], "a relay after the maintainer reopened a withdrawn request is the answer");
    const plain = fakeTracker({ issues: [issue()] });
    withdrawRequest(REQUEST, "No longer needed", { tracker: plain, repos });
    plain.reopen(REQUEST);
    plain.closeAs(REQUEST, "completed", { login: M }, "2026-11-13T16:40:00Z");
    assert.equal(fetchAnswer(REQUEST, { tracker: plain, repos }).state, "accepted", "a withdrawal the maintainer reopened does not explain their later close");
    console.log("ok: a withdrawal or relay note counts only for the close it preceded, never after the request was reopened");
  }

  {
    const request = JSON.parse(fixture("decision.json"));
    delete request.background;
    request.showsOnScreen = false;
    request.options = request.options.map(({ pictures, ...option }) => ({ ...option, example: option.example ?? `Option ${option.name} as it would look.` }));
    const tracker = fakeTracker({ issues: [issue()], comments: [comment(200, "Can I see this in dark mode?", "2026-11-13T15:50:00Z")] });
    const read = tracker.readComment;
    tracker.readComment = () => {
      throw new Error("HTTP 503");
    };
    assert.throws(() => reviseRequest(REQUEST, request, "Added the dark-mode note.", { pictures: scratch, tracker, repos, now: new Date("2026-11-13T16:20:00Z") }), /Rolled back: deleted the revision note \d+; restored the earlier body/);
    tracker.readComment = read;
    const after = fetchAnswer(REQUEST, { tracker, repos });
    assert.deepEqual([after.state, after.words.map((w) => w.body)], ["question", ["Can I see this in dark mode?"]], "a failed revision leaves the maintainer's question open");
    console.log("ok: a revision whose note read-back fails deletes the note, so the maintainer's question stays open");
  }

  {
    const waitCase = async ({ timeline, fallbackAt = "2026-11-13T17:37:00.000Z", start = "2026-11-13T16:00:00.000Z", interval }) => {
      let now = Date.parse(start);
      const requests = [];
      const body = decisionBody.replace(/"at":"[^"]+"/, `"at":"${fallbackAt}"`);
      const at = () => new Date(now).toISOString();
      const stateAt = () => timeline(now - Date.parse(start)) ?? { issue: issue({ body }), comments: [] };
      let served = null;
      const tracker = {
        poll: (n, etag) => {
          const current = stateAt();
          const tag = `W/"${JSON.stringify(current).length}-${current.comments.length}-${current.issue.state}"`;
          requests.push({ at: now, kind: "poll", conditional: Boolean(etag) });
          if (etag && etag === tag) return { status: 304, etag };
          requests[requests.length - 1].changed = true;
          served = current;
          return { status: 200, etag: tag, issue: { ...current.issue, body: current.issue.body ?? body } };
        },
        timeline: () => {
          requests.push({ at: now, kind: "timeline", conditional: false });
          return timelineOf(served.issue, served.comments);
        },
      };
      const result = await waitForRequests([REQUEST], { tracker, repos, clock: () => new Date(now), sleep: (ms) => (now += ms), intervalSeconds: interval, warn: () => {} });
      const unconditional = requests.filter((r) => !r.conditional || r.changed);
      for (let i = 1; i < unconditional.length; i++) {
        const gap = unconditional[i].at - unconditional[i - 1].at;
        assert.ok(gap === 0 || gap >= 60000, `an unconditional request came ${gap} ms after the previous one`);
      }
      const polls = requests.filter((r) => r.kind === "poll");
      for (let i = 1; i < polls.length; i++) assert.ok(polls[i].at - polls[i - 1].at >= 60000, "polls are at least a minute apart");
      return { result, requests, at };
    };
    const body = decisionBody.replace(/"at":"[^"]+"/, '"at":"2026-11-13T17:37:00.000Z"');
    const close = await waitCase({ timeline: (ms) => (ms >= 200000 ? { issue: issue({ body, ...closedBy("completed", "2026-11-13T16:03:20Z") }), comments: [comment(140, "B", "2026-11-13T16:03:19Z")] } : null) });
    assert.deepEqual([close.result.why, close.result.state, close.result.returnedAt, close.result.secondsSinceClose], ["closed", "answered", "2026-11-13T16:04:00.000Z", 40]);
    assert.equal(close.requests.filter((r) => r.kind === "poll" && r.conditional && !r.changed).length, 3, "three unchanged minutes cost three conditional requests");
    const commented = await waitCase({ timeline: (ms) => (ms >= 61000 ? { issue: issue({ body }), comments: [comment(141, "Can I see C in dark mode?", "2026-11-13T16:01:01Z")] } : null) });
    assert.deepEqual([commented.result.why, commented.result.state, commented.result.returnedAt], ["comment", "question", "2026-11-13T16:02:00.000Z"]);
    const fallback = await waitCase({ fallbackAt: "2026-11-13T16:02:30.000Z", timeline: () => null });
    assert.deepEqual([fallback.result.why, fallback.result.returnedAt, fallback.result.fallbackAt], ["fallback", "2026-11-13T16:03:00.000Z", "2026-11-13T16:02:30.000Z"], "the fallback is taken at the first read at or after its time");
    assert.equal(fallback.requests.filter((r) => r.kind === "poll").length, 4, "the read after the fallback time is the next scheduled poll, never an extra one");
    const questionBeforeFallback = await waitCase({ fallbackAt: "2026-11-13T16:01:00.000Z", timeline: (ms) => (ms >= 30000 ? { issue: issue({ body }), comments: [comment(143, "Can I see C in dark mode?", "2026-11-13T16:00:30Z")] } : null) });
    assert.deepEqual([questionBeforeFallback.result.why, questionBeforeFallback.result.state, questionBeforeFallback.result.returnedAt], ["comment", "question", "2026-11-13T16:01:00.000Z"], "a question asked before the fallback time is found before the fallback is taken");
    const answerBeforeFallback = await waitCase({ fallbackAt: "2026-11-13T16:01:00.000Z", timeline: (ms) => (ms >= 30000 ? { issue: issue({ body, ...closedBy("completed", "2026-11-13T16:00:30Z") }), comments: [comment(144, "A", "2026-11-13T16:00:29Z")] } : null) });
    assert.deepEqual([answerBeforeFallback.result.why, answerBeforeFallback.result.state], ["closed", "answered"], "an answer given before the fallback time is found before the fallback is taken");
    const already = await waitCase({ timeline: () => ({ issue: issue({ body, ...closedBy("completed", "2026-11-13T15:59:00Z") }), comments: [] }) });
    assert.deepEqual([already.result.why, already.result.returnedAt, already.requests.length], ["closed", "2026-11-13T16:00:00.000Z", 2]);
    const asked = await waitCase({ fallbackAt: "2026-11-13T16:00:30.000Z", timeline: (ms) => (ms >= 120000 ? { issue: issue({ body, ...closedBy("completed", "2026-11-13T16:01:50Z") }), comments: [comment(142, "Is C dark?", "2026-11-13T15:50:00Z")] } : { issue: issue({ body }), comments: [comment(142, "Is C dark?", "2026-11-13T15:50:00Z")] }) });
    assert.deepEqual([asked.result.why, asked.result.state], ["closed", "answered"], "an open question stops the fallback clock, and an old comment is not news");
    await assert.rejects(() => waitCase({ interval: 30, timeline: () => null }), /at least 60/);
    const several = async ({ fallbacks, failing = () => false, slow = () => 0, closeAt = {} }) => {
      const start = Date.parse("2026-11-13T16:00:00.000Z");
      let now = start;
      const log = [];
      const state = (n) => {
        const fallback = decisionBody.replace(/"at":"[^"]+"/, `"at":"${new Date(start + fallbacks[n] * 1000).toISOString()}"`);
        const closed = closeAt[n] !== undefined && now - start >= closeAt[n] * 1000;
        return { ...issue({ number: n, body: fallback }), ...(closed ? closedBy("completed", new Date(start + closeAt[n] * 1000).toISOString().replace(".000Z", "Z")) : {}) };
      };
      const tracker = {
        poll: (n, etag) => {
          const at = (now - start) / 1000;
          log.push({ n, kind: "poll", at });
          now += slow(n, at) * 1000;
          if (etag && failing(n, at)) throw new Error("HTTP 503");
          const current = state(n);
          const tag = `W/"${current.state}"`;
          return etag === tag ? { status: 304, etag } : { status: 200, etag: tag, issue: current };
        },
        timeline: (n) => {
          log.push({ n, kind: "timeline", at: (now - start) / 1000 });
          return timelineOf(state(n));
        },
      };
      const out = await waitForRequests([1, 2], { tracker, repos, clock: () => new Date(now), sleep: (ms) => (now += ms), warn: () => {} });
      for (const n of [1, 2]) for (const kind of ["poll", "timeline"]) {
        const times = log.filter((entry) => entry.n === n && entry.kind === kind).map((entry) => entry.at);
        for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= 60, `#${n} ${kind} requests at ${times[i - 1]} s and ${times[i]} s are less than a minute apart`);
      }
      return { out, at: (now - start) / 1000 };
    };
    const starved = await several({ fallbacks: { 1: 60, 2: 120 }, failing: (n) => n === 1 });
    assert.deepEqual([starved.out.number, starved.out.why, starved.at], [2, "fallback", 120], "an unreadable request does not hold back another request's confirmed fallback");
    const slowRead = await several({ fallbacks: { 1: 3600, 2: 3600 }, slow: (n, at) => (n === 1 && at >= 60 && at < 61 ? 50 : 0), closeAt: { 2: 200 } });
    assert.deepEqual([slowRead.out.number, slowRead.out.why], [2, "closed"], "a slow read of one request never brings another request's next read closer than a minute");
    console.log("ok: wait returns for a close, a new maintainer comment and a reached fallback time, polls conditionally once a minute, and never makes an unconditional request more often than once a minute");
  }

  {
    const tracker = fakeTracker({ issues: [issue(closedBy("completed"))], comments: [comment(150, "B", "2026-11-13T16:10:00Z")] });
    const lines = [];
    assert.equal(main(["read", `${REQUEST}`, "--json"], { tracker, repos, out: (line) => lines.push(line) }), 0);
    assert.equal(JSON.parse(lines[0]).state, "answered");
    assert.equal(main(["read", `${REQUEST}`], { tracker, repos, out: (line) => lines.push(line) }), 0);
    assert.match(lines[1], /state: answered \(answered in the maintainer's words; closed by .* as completed\)\n {2}words at 2026-11-13 16:10 UTC: .*\n {4}> B$/);
    const errors = console.error;
    console.error = () => {};
    try {
      assert.equal(main(["wait", `${REQUEST}`, "--interval=abc"], { tracker, repos, out: () => {} }), 2);
      assert.equal(main(["withdraw", `${REQUEST}`], { tracker, repos, out: () => {} }), 2);
    } finally {
      console.error = errors;
    }
    console.log("ok: read prints the answer as text or JSON, and malformed answer commands print the usage");
  }

  {
    const app = { slug: "ask-maintainer-tool", id: 4242, installationId: 77 };
    const withApp = { ...repos, maintainer: { ...repos.maintainer, app } };
    const bot = { login: `${app.slug}[bot]`, type: "Bot" };
    const byBot = (id, text, note, at) => ({ ...toolComment(id, text, note, at), user: bot, performed_via_github_app: { id: app.id } });
    const botClose = { state: "closed", state_reason: "completed", closed_at: "2026-11-13T16:10:05Z", closed_by: bot };
    const relayed = answerOf(issue(botClose), [byBot(210, "Relayed.", { kind: "relayed", words: "Go with B", session: "s", at: "2026-11-13T16:00:00Z", runner: "codex" }, "2026-11-13T16:10:04Z")], withApp);
    assert.deepEqual([relayed.state, relayed.words[0].body], ["answered", "Go with B"], "a close by the App explained by its relay note is the relayed answer");
    const withdrawn = answerOf(issue({ ...botClose, state_reason: "not_planned" }), [byBot(211, "Withdrawn.", { kind: "withdrawn", reason: "no longer needed" }, "2026-11-13T16:10:04Z")], withApp);
    assert.equal(withdrawn.state, "withdrawn");
    const bare = answerOf(issue(botClose), [], withApp);
    assert.deepEqual([bare.state, bare.why], ["unclear", "closed by the tool with no withdrawal or relayed answer to explain it"], "a close by the App with no note is never the maintainer's acceptance");
    const botWords = answerOf(issue(closedBy("completed")), [{ ...comment(212, "B", "2026-11-13T16:10:00Z"), user: bot, performed_via_github_app: { id: app.id } }], withApp);
    assert.equal(botWords.state, "accepted", "a comment the App posted, even unmarked, is never the maintainer's words");
    const signed = toolText("Recorded.", { kind: "recorded" }, { mode: "app", login: bot.login });
    assert.equal(signed, `Recorded.\n\n${TOOL_MARK}\n<!-- maintainer-request-note {"kind":"recorded"} -->\n`, "as the App, a note carries only the hidden mark");
    console.log("ok: as the App, its own closes count only when its withdrawal or relay note explains them, and its comments are never the maintainer's");
  }

  {
    const start = Date.parse("2026-11-13T16:00:00.000Z");
    let now = start;
    const fallbackBody = decisionBody.replace(/"at":"[^"]+"/, '"at":"2026-11-13T18:00:00.000Z"');
    const trackerFor = (name, uses) => ({
      poll: (n, etag) => {
        uses.push([name, "poll", (now - start) / 1000]);
        const closed = now - start >= 150000;
        const current = issue({ body: fallbackBody, ...(closed ? closedBy("completed", "2026-11-13T16:02:30Z") : {}) });
        const tag = `W/"${current.state}"`;
        return etag === tag ? { status: 304, etag } : { status: 200, etag: tag, issue: current };
      },
      timeline: () => (uses.push([name, "timeline", (now - start) / 1000]), timelineOf(issue({ body: fallbackBody, ...(now - start >= 150000 ? closedBy("completed", "2026-11-13T16:02:30Z") : {}) }))),
    });
    const uses = [];
    let refreshed = 0;
    const result = await waitForRequests([REQUEST], { tracker: trackerFor("start", uses), refresh: async () => trackerFor(`identity-${++refreshed}`, uses), repos, clock: () => new Date(now), sleep: (ms) => (now += ms), warn: () => {} });
    assert.deepEqual([result.why, refreshed], ["closed", 3], "the identity is resolved again before every read pass");
    assert.deepEqual(uses.filter(([, kind]) => kind === "poll").map(([name]) => name), ["start", "identity-1", "identity-2", "identity-3"], "each pass reads with the identity resolved just before it");
    console.log("ok: wait resolves the tool's identity again before each read, so an App token that expires during a long wait is replaced");
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
