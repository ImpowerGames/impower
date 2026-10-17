// Unit tests for scripts/scrub-pull-requests.mjs: the archive format and its
// read-back, the scrub's refusal of a pull request whose archive is short or
// stale, resume after a crash, and the clone checks against real Git
// repositories in a scratch directory.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { GhError, Journal, Pacer, ghClient } from "./migrate-tracker.mjs";
import {
  ARCHIVE_DIR,
  ArchiveFormatError,
  archiveProblems,
  cloneOf,
  describePull,
  fenceFor,
  main,
  parseArchive,
  parseArgs,
  pullTracker,
  githubRemote,
  renderArchive,
  runArchive,
  runScrub,
  scrubRefusals,
} from "./scrub-pull-requests.mjs";

const repos = { code: "Org/code", internal: "Org/internal", autolinkPrefix: "I-", cutover: false, feedbackInbox: 1 };
const scratches = [];
const scratch = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scrub-pull-requests-"));
  scratches.push(dir);
  return dir;
};
after(() => {
  for (const dir of scratches) fs.rmSync(dir, { recursive: true, force: true });
});
const quiet = () => {};

// ---------------------------------------------------------------------------
// An in-memory code repository

const user = (login) => ({ login });
const at = (minute) => `2026-10-16T10:${String(minute).padStart(2, "0")}:00Z`;

function conversation(number, { comments = [], reviewComments = [], reviews = [], ...pull } = {}) {
  return {
    pull: { number, title: `Pull ${number}`, user: user("maintainer"), state: "closed", draft: false, created_at: at(0), merged_at: at(5), closed_at: at(5), updated_at: at(6), body: `Body of ${number}`, ...pull },
    comments: comments.map((c, i) => ({ id: number * 100 + i + 1, user: user("maintainer"), created_at: at(i + 1), updated_at: at(i + 1), ...c })),
    reviewComments: reviewComments.map((c, i) => ({ id: number * 1000 + i + 1, user: user("chatgpt-codex-connector[bot]"), created_at: at(i + 1), updated_at: at(i + 1), pull_request_review_id: 77, in_reply_to_id: null, path: "src/a.ts", line: 3, ...c })),
    reviews: reviews.map((r, i) => ({ id: number * 10000 + i + 1, user: user("chatgpt-codex-connector[bot]"), state: "COMMENTED", submitted_at: at(i + 1), ...r })),
  };
}

function fakeTracker(conversations) {
  const repo = new Map(conversations.map((c) => [c.pull.number, c]));
  const calls = [];
  const find = (kind, id) => [...repo.values()].find((c) => c[kind].some((x) => x.id === id)) ?? null;
  const remove = (kind, id) => {
    const owner = find(kind, id);
    if (!owner) throw new GhError(["api"], 404, "gh: Not Found (HTTP 404)");
    owner[kind] = owner[kind].filter((x) => x.id !== id);
  };
  return {
    calls,
    repo,
    // Counts the pull request reports, which a test can skew.
    skew: new Map(),
    async listPulls() {
      calls.push("listPulls");
      return [...repo.values()].map((c) => ({ ...c.pull }));
    },
    async getPull(_repo, n) {
      calls.push(`getPull ${n}`);
      const c = repo.get(n);
      const skew = this.skew.get(n) ?? {};
      return { ...c.pull, comments: c.comments.length + (skew.comments ?? 0), review_comments: c.reviewComments.length + (skew.reviewComments ?? 0) };
    },
    async comments(_repo, n) {
      return repo.get(n).comments.map((c) => ({ ...c }));
    },
    async reviewComments(_repo, n) {
      return repo.get(n).reviewComments.map((c) => ({ ...c }));
    },
    async reviews(_repo, n) {
      return repo.get(n).reviews.map((r) => ({ ...r }));
    },
    async findComment(_repo, id) {
      return find("comments", id)?.comments.find((c) => c.id === id) ?? null;
    },
    async findReviewComment(_repo, id) {
      return find("reviewComments", id)?.reviewComments.find((c) => c.id === id) ?? null;
    },
    async deleteComment(_repo, id) {
      calls.push(`delete comment ${id}`);
      remove("comments", id);
      return null;
    },
    async deleteReviewComment(_repo, id) {
      calls.push(`delete review comment ${id}`);
      remove("reviewComments", id);
      return null;
    },
  };
}

/**
 * A clone with two histories: commit() records the archive files as the
 * clone's HEAD, push() as both its HEAD and the internal repository's
 * default branch. show() answers from the history its commit names.
 */
function fakeClone(root) {
  const histories = { HEAD: new Map(), pushed: new Map() };
  const files = () => {
    const out = new Map();
    const dir = path.join(root, ARCHIVE_DIR);
    if (fs.existsSync(dir)) for (const name of fs.readdirSync(dir)) out.set(`${ARCHIVE_DIR}/${name}`, fs.readFileSync(path.join(dir, name), "utf8"));
    return out;
  };
  return {
    root,
    histories,
    commit() {
      histories.HEAD = files();
    },
    push() {
      histories.HEAD = files();
      histories.pushed = new Map(histories.HEAD);
    },
    fetchDefault: () => ({ branch: "main", commit: "pushed" }),
    show: (commit, file) => histories[commit]?.get(file) ?? null,
    converted: () => [],
  };
}

const record = (c) => describePull({ ...c.pull, comments: c.comments.length, review_comments: c.reviewComments.length }, c);

// ---------------------------------------------------------------------------
// The archive format

test("a fence is longer than any run of backticks in the text, and at least three long", () => {
  assert.equal(fenceFor("plain"), "```");
  assert.equal(fenceFor("a `span` and ```js\nfence\n```"), "````");
  assert.equal(fenceFor("``````"), "```````");
});

test("the archive file is the pull request's fields, its body and each comment, review comment and review in a fenced block", () => {
  const c = conversation(12, {
    title: "fix(x): a title (#11)",
    comments: [{ body: "First." }],
    reviewComments: [{ body: "Line note `x`", in_reply_to_id: 5 }],
    reviews: [{ body: "Summary." }],
  });
  assert.equal(
    renderArchive(record(c), repos),
    [
      "# Pull request 12: fix(x): a title (#11)",
      "",
      "Archived from https://github.com/Org/code/pull/12. Every text below is verbatim from the API, in a fenced block.",
      "",
      '- Title: "fix(x): a title (#11)"',
      '- Author: "maintainer"',
      '- State: "merged"',
      "- Draft: false",
      `- Created: "${at(0)}"`,
      `- Merged: "${at(5)}"`,
      `- Closed: "${at(5)}"`,
      `- Updated: "${at(6)}"`,
      "- Comments: 1",
      "- Review comments: 1",
      "- Comments kept after deletion: []",
      "- Review comments kept after deletion: []",
      "",
      "## Body",
      "",
      "```text",
      "Body of 12",
      "```",
      "",
      "## Comment 1201",
      "",
      '- Author: "maintainer"',
      `- Created: "${at(1)}"`,
      `- Updated: "${at(1)}"`,
      "",
      "```text",
      "First.",
      "```",
      "",
      "## Review comment 12001",
      "",
      '- Author: "chatgpt-codex-connector[bot]"',
      `- Created: "${at(1)}"`,
      `- Updated: "${at(1)}"`,
      "- Review: 77",
      "- In reply to: 5",
      '- Path: "src/a.ts"',
      "- Line: 3",
      "",
      "```text",
      "Line note `x`",
      "```",
      "",
      "## Review 120001",
      "",
      '- Author: "chatgpt-codex-connector[bot]"',
      '- State: "COMMENTED"',
      `- Submitted: "${at(1)}"`,
      "",
      "```text",
      "Summary.",
      "```",
      "",
    ].join("\n"),
  );
});

test("every text reads back verbatim, whatever it holds", () => {
  const texts = [
    "",
    "\n",
    "ends with a line end\n",
    "CRLF line ends\r\nand a lone CR\r",
    "```\nan unclosed fence",
    "````text\n```\n````",
    "a line holding only the fence:\n```\nand after",
    "## Comment 99\n\n- Author: \"someone\"\n\n```text\nforged\n```",
    "`` ` `` and ``````",
    "unicode ✓ and a line separator \u2028 here",
    "trailing backticks``",
  ];
  const c = conversation(7, {
    body: texts.join("|"),
    title: "a title\nwith a line end",
    draft: true,
    state: "open",
    merged_at: null,
    closed_at: null,
    comments: texts.map((body) => ({ body })),
    reviewComments: [{ body: texts[5], path: "dir/file name.md", line: null }],
    reviews: [{ body: "" }, { body: texts[7] }],
  });
  const original = record(c);
  const text = renderArchive(original, repos);
  assert.deepEqual(parseArchive(text, repos), original);
  assert.deepEqual(archiveProblems(original), []);
});

test("a file that is not what its record renders to does not read back", () => {
  const text = renderArchive(record(conversation(3, { comments: [{ body: "one" }, { body: "two" }], reviews: [{ body: "summary" }] })), repos);
  const refuse = (changed, why) => assert.throws(() => parseArchive(changed, repos), ArchiveFormatError, why);
  refuse(text.slice(0, -5), "a truncated file");
  refuse(`${text}\nextra\n`, "text appended");
  refuse(text.replace('- Author: "maintainer"', "- Author: maintainer"), "a field that is not JSON");
  refuse(text.replace("## Body", "## Bodies"), "a renamed heading");
  refuse(text.replace("Archived from", "Copied from"), "an edited preamble");
  refuse(text.replace("```text\none\n```", "```text\none"), "an unclosed block");
  refuse(text.replace(/\n/g, "\r\n"), "line ends converted to CRLF");
  const comment = text.indexOf("\n## Comment 302");
  const review = text.indexOf("\n## Review 30001");
  refuse(text.slice(0, comment) + text.slice(review) + text.slice(comment, review), "a review before a comment");
});

test("an archive whose lists are shorter than the counts the pull request reported is short", () => {
  const c = conversation(4, { comments: [{ body: "a" }, { body: "b" }], reviewComments: [{ body: "r" }] });
  const full = record(c);
  const short = { ...full, comments: full.comments.slice(0, 1), reviewComments: [] };
  // The file reads back, because it is well formed; the counts it carries say what is missing.
  assert.deepEqual(parseArchive(renderArchive(short, repos), repos), short);
  assert.deepEqual(archiveProblems(short), ["holds 1 of 2 comments", "holds 0 of 1 review comments"]);
});

// ---------------------------------------------------------------------------
// Archive

test("archive writes one file per pull request, reads each back and journals it; a rerun skips what has not changed", async () => {
  const dir = scratch();
  const clone = fakeClone(path.join(dir, "clone"));
  const tracker = fakeTracker([conversation(1, { comments: [{ body: "c" }] }), conversation(2), conversation(5, { reviewComments: [{ body: "r" }], reviews: [{ body: "s" }, { body: "" }] })]);
  const journal = new Journal(path.join(dir, "journal.jsonl"));
  const first = await runArchive({ tracker, repos, clone, journal });
  assert.deepEqual(first, { pullRequests: 3, written: 3, unchanged: 0, carried: [], comments: 1, reviewComments: 1, reviewsWithSummary: [{ pr: 5, review: 50001 }], failed: [] });
  assert.deepEqual(fs.readdirSync(path.join(clone.root, ARCHIVE_DIR)).sort(), ["1.md", "2.md", "5.md"]);
  assert.deepEqual(parseArchive(fs.readFileSync(path.join(clone.root, ARCHIVE_DIR, "1.md"), "utf8"), repos), record(tracker.repo.get(1)));
  assert.deepEqual(journal.of("archive").map((r) => r.pr), [1, 2, 5]);

  tracker.calls.length = 0;
  tracker.repo.get(2).pull.updated_at = at(30);
  tracker.repo.get(2).comments.push({ id: 299, user: user("maintainer"), created_at: at(30), updated_at: at(30), body: "late" });
  const again = await runArchive({ tracker, repos, clone, journal: new Journal(path.join(dir, "journal.jsonl")) });
  assert.equal(again.unchanged, 2);
  assert.equal(again.written, 1);
  assert.deepEqual(tracker.calls, ["listPulls", "getPull 2"], "only the changed pull request is read again");
  assert.equal(parseArchive(fs.readFileSync(path.join(clone.root, ARCHIVE_DIR, "2.md"), "utf8"), repos).comments[0].body, "late");
});

test("archive refuses a pull request whose lists do not match its counts, and writes nothing in a dry run", async () => {
  const dir = scratch();
  const clone = fakeClone(path.join(dir, "clone"));
  const tracker = fakeTracker([conversation(1, { comments: [{ body: "c" }] }), conversation(2, { comments: [{ body: "c" }] })]);
  tracker.skew.set(2, { comments: 1 });
  const journal = new Journal(path.join(dir, "journal.jsonl"));
  const dry = await runArchive({ tracker, repos, clone, journal: { of: () => [], append: (r) => r }, dryRun: true });
  assert.equal(dry.dryRun, true);
  assert.equal(fs.existsSync(clone.root), false, "a dry run writes no file");
  const result = await runArchive({ tracker, repos, clone, journal });
  assert.deepEqual(result.failed, [{ pr: 2, problems: ["holds 1 of 2 comments"] }]);
  assert.equal(fs.existsSync(path.join(clone.root, ARCHIVE_DIR, "2.md")), false);
  assert.deepEqual(journal.of("archive").map((r) => r.pr), [1]);
  await assert.rejects(runArchive({ tracker, repos, clone, journal, only: [3] }), /no pull request 3/);
});

// ---------------------------------------------------------------------------
// Scrub

test("the read-back comparison refuses to scrub a pull request whose archive is short", () => {
  const c = conversation(9, { comments: [{ body: "a" }, { body: "b" }, { body: "c" }] });
  const live = record(c);
  assert.deepEqual(scrubRefusals(renderArchive(live, repos), live, repos), []);
  assert.deepEqual(scrubRefusals(null, live, repos), ["no archive on the internal repository's default branch"]);
  const truncated = { ...live, comments: live.comments.slice(0, 2) };
  assert.deepEqual(scrubRefusals(renderArchive(truncated, repos), live, repos), ["the archive is short: it holds 2 of 3 comments", "comment 903 is not in the archive"]);
  // An archive taken before the third comment was posted is complete for its time and still short of the live conversation.
  const earlier = { ...truncated, commentCount: 2 };
  assert.deepEqual(scrubRefusals(renderArchive(earlier, repos), live, repos), ["comment 903 is not in the archive"]);
  // The completeness check stands on its own: a short archive that holds every comment still live is refused too.
  const remaining = { ...live, comments: live.comments.slice(0, 2), commentCount: 2 };
  assert.deepEqual(scrubRefusals(renderArchive(truncated, repos), remaining, repos), ["the archive is short: it holds 2 of 3 comments"]);
  const edited = { ...live, comments: live.comments.map((x) => (x.id === 902 ? { ...x, body: "b, edited" } : x)) };
  assert.deepEqual(scrubRefusals(renderArchive(live, repos), edited, repos), ["comment 902 was edited after it was archived"]);
  assert.match(scrubRefusals(renderArchive(live, repos).slice(0, -4), live, repos)[0], /^the archive does not read back/);
  assert.deepEqual(scrubRefusals(renderArchive({ ...live, number: 8 }, repos), live, repos), ["the archive is for pull request 8"]);
});

test("scrub deletes only what the pushed archive holds, refuses the rest and reads every scrubbed pull request back empty", async () => {
  const dir = scratch();
  const clone = fakeClone(path.join(dir, "clone"));
  const tracker = fakeTracker([
    conversation(1, { comments: [{ body: "a" }, { body: "b" }], reviewComments: [{ body: "r" }, { body: "reply", in_reply_to_id: 1001 }], reviews: [{ body: "kept summary" }] }),
    conversation(2, { comments: [{ body: "x" }] }),
    conversation(3),
    conversation(4, { comments: [{ body: "unarchived" }] }),
  ]);
  const journal = new Journal(path.join(dir, "journal.jsonl"));
  await runArchive({ tracker, repos, clone, journal, only: [1, 2, 3] });
  // #2's archive is cut short after it was written, before it is pushed.
  const file2 = path.join(clone.root, ARCHIVE_DIR, "2.md");
  const short2 = record(tracker.repo.get(2));
  fs.writeFileSync(file2, renderArchive({ ...short2, comments: [] }, repos));
  const unpushed = await runScrub({ tracker, repos, clone, journal });
  assert.deepEqual(unpushed.refused.map((r) => r.pr), [1, 2, 4], "nothing is deleted before the archive is pushed");
  assert.deepEqual(unpushed.emptyWithoutArchive, [3], "a pull request with nothing on it needs no archive");
  assert.equal(tracker.calls.filter((c) => c.startsWith("delete")).length, 0);

  clone.push();
  const dry = await runScrub({ tracker, repos, clone, journal: { of: () => [], append: (r) => r }, dryRun: true });
  assert.deepEqual(dry.deleted, { comments: 2, reviewComments: 2 });
  assert.equal(tracker.calls.filter((c) => c.startsWith("delete")).length, 0, "a dry run deletes nothing");

  const result = await runScrub({ tracker, repos, clone, journal });
  assert.equal(result.scrubbed, 1);
  assert.equal(result.alreadyEmpty, 1);
  assert.deepEqual(result.emptyWithoutArchive, []);
  assert.deepEqual(result.refused, [
    { pr: 2, refusals: ["the archive is short: it holds 0 of 1 comments", "comment 201 is not in the archive"] },
    { pr: 4, refusals: ["no archive on the internal repository's default branch"] },
  ]);
  assert.deepEqual(result.deleted, { comments: 2, reviewComments: 2 });
  assert.deepEqual(result.reviewsWithSummary, [{ pr: 1, review: 10001 }]);
  assert.deepEqual(tracker.calls.filter((c) => c.startsWith("delete")), ["delete review comment 1002", "delete review comment 1001", "delete comment 102", "delete comment 101"]);
  assert.equal(tracker.repo.get(2).comments.length, 1, "the short archive's pull request keeps its comment");
  assert.equal(tracker.repo.get(4).comments.length, 1);
  assert.equal(tracker.repo.get(1).reviews.length, 1, "a review cannot be deleted and is reported instead");
  assert.deepEqual(journal.of("scrub").filter((r) => r.step === "finished").map((r) => r.pr), [1]);
});

test("a scrub resumed after a crash deletes what is left and treats a comment already gone as deleted", async () => {
  const dir = scratch();
  const clone = fakeClone(path.join(dir, "clone"));
  const tracker = fakeTracker([conversation(1, { comments: [{ body: "a" }, { body: "b" }, { body: "c" }] })]);
  const journal = new Journal(path.join(dir, "journal.jsonl"));
  await runArchive({ tracker, repos, clone, journal });
  clone.push();
  // The first run crashes after deleting the newest comment.
  const deleteComment = tracker.deleteComment;
  let n = 0;
  tracker.deleteComment = async function (repo, id) {
    if (n++ === 1) throw new Error("killed");
    return deleteComment.call(this, repo, id);
  };
  await assert.rejects(runScrub({ tracker, repos, clone, journal }), /killed/);
  assert.deepEqual(tracker.repo.get(1).comments.map((c) => c.id), [101, 102]);
  tracker.deleteComment = deleteComment;
  // The rerun lists the two left; one of them vanishes between the list and its deletion.
  const list = tracker.comments;
  tracker.comments = async function (repo, number) {
    const out = await list.call(this, repo, number);
    tracker.repo.get(1).comments = tracker.repo.get(1).comments.filter((c) => c.id !== 102);
    return out;
  };
  const result = await runScrub({ tracker, repos, clone, journal: new Journal(path.join(dir, "journal.jsonl")) });
  assert.equal(result.scrubbed, 1);
  assert.deepEqual(tracker.repo.get(1).comments, []);
  const deleted = new Journal(path.join(dir, "journal.jsonl")).of("scrub").filter((r) => r.step === "deleted");
  assert.deepEqual(deleted.map((r) => [r.id, Boolean(r.alreadyGone)]), [[103, false], [102, true], [101, false]]);
});

test("after a partial scrub, an archive rerun keeps the deleted comments and takes in new and edited ones, and the scrub then finishes", async () => {
  const dir = scratch();
  const clone = fakeClone(path.join(dir, "clone"));
  const tracker = fakeTracker([conversation(1, { comments: [{ body: "a" }, { body: "b" }] })]);
  const journal = new Journal(path.join(dir, "journal.jsonl"));
  await runArchive({ tracker, repos, clone, journal });
  clone.push();
  // The scrub deletes 102, newest first, and is interrupted before 101.
  const deleteComment = tracker.deleteComment;
  tracker.deleteComment = async function (repo, id) {
    if (id === 101) throw new Error("killed");
    return deleteComment.call(this, repo, id);
  };
  await assert.rejects(runScrub({ tracker, repos, clone, journal }), /killed/);
  tracker.deleteComment = deleteComment;
  // Then 103 is posted and 101 edited.
  const pull = tracker.repo.get(1);
  pull.comments.push({ id: 103, user: user("maintainer"), created_at: at(50), updated_at: at(50), body: "new" });
  pull.comments[0].body = "a, edited";
  pull.pull.updated_at = at(50);
  const refused = await runScrub({ tracker, repos, clone, journal });
  assert.deepEqual(refused.refused, [{ pr: 1, refusals: ["comment 101 was edited after it was archived", "comment 103 is not in the archive"] }]);

  for (const only of [null, [1]]) {
    const result = await runArchive({ tracker, repos, clone, journal, only });
    assert.deepEqual(result.carried, [{ pr: 1, kept: 1 }]);
    assert.deepEqual(result.failed, []);
    const archived = parseArchive(fs.readFileSync(path.join(clone.root, ARCHIVE_DIR, "1.md"), "utf8"), repos);
    assert.deepEqual(archived.comments.map((c) => [c.id, c.body]), [[101, "a, edited"], [102, "b"], [103, "new"]], "the deleted comment stays, the new and edited ones are taken in");
    assert.deepEqual(archived.keptComments, [102]);
    assert.equal(archived.commentCount, 2);
    assert.deepEqual(archiveProblems(archived), []);
  }
  clone.push();
  const result = await runScrub({ tracker, repos, clone, journal });
  assert.deepEqual(result.refused, []);
  assert.equal(result.scrubbed, 1);
  assert.deepEqual(tracker.repo.get(1).comments, []);
  // An archive taken now still holds every comment, all of them kept.
  await runArchive({ tracker, repos, clone, journal, only: [1] });
  assert.deepEqual(parseArchive(fs.readFileSync(path.join(clone.root, ARCHIVE_DIR, "1.md"), "utf8"), repos).keptComments, [101, 102, 103]);
});

test("a record that names a kept comment it does not hold, or holds more than its counts and kept comments, is incomplete", () => {
  const full = record(conversation(4, { comments: [{ body: "a" }, { body: "b" }] }));
  assert.deepEqual(archiveProblems({ ...full, keptComments: [999] }), ["holds 2 of 3 comments", "names kept comments it does not hold: 999"]);
  assert.deepEqual(archiveProblems({ ...full, commentCount: 1 }), ["holds 2 of 1 comments"]);
  assert.deepEqual(archiveProblems({ ...full, commentCount: 1, keptComments: [401] }), []);
});

test("an interrupted first write is replaced on the rerun, and a damaged working file is rebuilt from the pushed copy", async () => {
  const dir = scratch();
  const clone = fakeClone(path.join(dir, "clone"));
  const tracker = fakeTracker([conversation(1, { comments: [{ body: "a" }] })]);
  const journal = new Journal(path.join(dir, "journal.jsonl"));
  const folder = path.join(clone.root, ARCHIVE_DIR);
  fs.mkdirSync(folder, { recursive: true });
  // A file cut short before it was ever committed, and a partial file left by a crash.
  fs.writeFileSync(path.join(folder, "1.md"), "# Pull request 1: Pull 1\n\nArch");
  fs.writeFileSync(path.join(folder, ".1.md.partial"), "junk");
  const first = await runArchive({ tracker, repos, clone, journal });
  assert.deepEqual(first.failed, []);
  assert.equal(first.written, 1);
  assert.deepEqual(fs.readdirSync(folder), ["1.md"], "the partial file is removed");
  assert.deepEqual(parseArchive(fs.readFileSync(path.join(folder, "1.md"), "utf8"), repos), record(tracker.repo.get(1)));
  clone.push();
  const good = fs.readFileSync(path.join(folder, "1.md"), "utf8");
  fs.writeFileSync(path.join(folder, "1.md"), good.slice(0, -3));
  const damaged = await runArchive({ tracker, repos, clone, journal, only: [1] });
  assert.deepEqual(damaged.failed, []);
  assert.equal(fs.readFileSync(path.join(folder, "1.md"), "utf8"), good);
});

test("after the scrub, a missing or incomplete working file is rebuilt with every comment the pushed copy holds", async () => {
  const dir = scratch();
  const clone = fakeClone(path.join(dir, "clone"));
  const tracker = fakeTracker([conversation(1, { comments: [{ body: "a" }] })]);
  const journal = new Journal(path.join(dir, "journal.jsonl"));
  await runArchive({ tracker, repos, clone, journal });
  clone.push();
  await runScrub({ tracker, repos, clone, journal });
  assert.deepEqual(tracker.repo.get(1).comments, []);
  const file = path.join(clone.root, ARCHIVE_DIR, "1.md");
  const pushed = fs.readFileSync(file, "utf8");
  const incomplete = renderArchive({ ...parseArchive(pushed, repos), comments: [] }, repos);
  for (const [what, damage] of [["missing", () => fs.rmSync(file)], ["cut at a section boundary, its count kept", () => fs.writeFileSync(file, incomplete)]]) {
    damage();
    const result = await runArchive({ tracker, repos, clone, journal, only: [1] });
    assert.deepEqual(result.failed, [], what);
    assert.deepEqual(result.carried, [{ pr: 1, kept: 1 }], what);
    const archived = parseArchive(fs.readFileSync(file, "utf8"), repos);
    assert.deepEqual(archived.comments.map((c) => [c.id, c.body]), [[101, "a"]], what);
    assert.deepEqual(archived.keptComments, [101], what);
  }
  // A committed copy that does not read back stops the pull request instead.
  clone.show = () => "junk";
  const stopped = await runArchive({ tracker, repos, clone, journal, only: [1] });
  assert.match(stopped.failed[0].problems[0], /does not read back.*repair it by hand/);
});

test("a comment held only by the clone's HEAD, or only by the pushed default branch, is carried into a rebuilt file", async () => {
  for (const only of ["HEAD", "pushed"]) {
    const dir = scratch();
    const clone = fakeClone(path.join(dir, "clone"));
    const tracker = fakeTracker([conversation(1, { comments: [{ body: "a" }] })]);
    const journal = new Journal(path.join(dir, "journal.jsonl"));
    await runArchive({ tracker, repos, clone, journal });
    if (only === "HEAD") clone.commit();
    else {
      clone.push();
      clone.histories.HEAD = new Map();
    }
    // The comment is gone from the pull request and the working file is lost.
    tracker.repo.get(1).comments = [];
    fs.rmSync(path.join(clone.root, ARCHIVE_DIR, "1.md"));
    const result = await runArchive({ tracker, repos, clone, journal, only: [1] });
    assert.deepEqual(result.carried, [{ pr: 1, kept: 1 }], only);
    assert.deepEqual(parseArchive(fs.readFileSync(path.join(clone.root, ARCHIVE_DIR, "1.md"), "utf8"), repos).keptComments, [101], only);
  }
});

test("a committed copy short of its own counts stops the pull request instead of being carried as complete", async () => {
  const dir = scratch();
  const clone = fakeClone(path.join(dir, "clone"));
  const tracker = fakeTracker([conversation(1, { comments: [{ body: "a" }, { body: "b" }] })]);
  const journal = new Journal(path.join(dir, "journal.jsonl"));
  await runArchive({ tracker, repos, clone, journal });
  clone.push();
  await runScrub({ tracker, repos, clone, journal });
  // Every copy has lost comment 102's section but kept the count of 2.
  const file = path.join(clone.root, ARCHIVE_DIR, "1.md");
  const full = parseArchive(fs.readFileSync(file, "utf8"), repos);
  fs.writeFileSync(file, renderArchive({ ...full, comments: full.comments.slice(0, 1) }, repos));
  clone.push();
  const result = await runArchive({ tracker, repos, clone, journal, only: [1] });
  assert.equal(result.written, 0);
  assert.match(result.failed[0]?.problems[0] ?? "", /is incomplete \(it holds 1 of 2 comments\); recover the missing comments/);
  assert.deepEqual(archiveProblems(parseArchive(fs.readFileSync(file, "utf8"), repos)), ["holds 1 of 2 comments"], "the file still shows its deficit");
  // Either history alone, short with no other copy to cover it, stops the pull request too.
  const short = fs.readFileSync(file, "utf8");
  fs.rmSync(file);
  for (const [history, other] of [["pushed", "HEAD"], ["HEAD", "pushed"]]) {
    clone.histories[history] = new Map([[`${ARCHIVE_DIR}/1.md`, short]]);
    clone.histories[other] = new Map();
    const alone = await runArchive({ tracker, repos, clone, journal, only: [1] });
    assert.match(alone.failed[0]?.problems[0] ?? "", /is incomplete/, history);
    assert.equal(fs.existsSync(file), false, history);
  }
});

test("a pull request with no archive and a review summary is refused, not counted empty", async () => {
  const dir = scratch();
  const clone = fakeClone(path.join(dir, "clone"));
  const tracker = fakeTracker([conversation(98, { reviews: [{ body: "" }] }), conversation(99, { reviews: [{ body: "agent text" }] })]);
  const result = await runScrub({ tracker, repos, clone, journal: new Journal(path.join(dir, "journal.jsonl")) });
  assert.deepEqual(result.emptyWithoutArchive, [98]);
  assert.deepEqual(result.refused, [{ pr: 99, refusals: ["no archive on the internal repository's default branch"] }]);
});

test("a resumed archive does not skip a working file that differs from a committed copy", async () => {
  const dir = scratch();
  const clone = fakeClone(path.join(dir, "clone"));
  const tracker = fakeTracker([conversation(1, { comments: [{ body: "a" }] })]);
  const journal = new Journal(path.join(dir, "journal.jsonl"));
  await runArchive({ tracker, repos, clone, journal });
  clone.push();
  await runScrub({ tracker, repos, clone, journal });
  // An older, well-formed file at the journaled time, holding nothing.
  const file = path.join(clone.root, ARCHIVE_DIR, "1.md");
  const pushed = parseArchive(fs.readFileSync(file, "utf8"), repos);
  fs.writeFileSync(file, renderArchive({ ...pushed, comments: [], commentCount: 0 }, repos));
  const result = await runArchive({ tracker, repos, clone, journal });
  assert.equal(result.unchanged, 0);
  assert.deepEqual(result.carried, [{ pr: 1, kept: 1 }]);
  assert.deepEqual(parseArchive(fs.readFileSync(file, "utf8"), repos).comments.map((c) => c.id), [101]);
  // A file that matches its committed copies is still skipped.
  clone.push();
  tracker.calls.length = 0;
  assert.equal((await runArchive({ tracker, repos, clone, journal })).unchanged, 1);
  assert.deepEqual(tracker.calls, ["listPulls"]);
});

test("a write interrupted before its rename leaves the earlier file whole, and the rerun finishes it", async () => {
  const dir = scratch();
  const clone = fakeClone(path.join(dir, "clone"));
  const tracker = fakeTracker([conversation(1, { comments: [{ body: "a" }] })]);
  const journal = new Journal(path.join(dir, "journal.jsonl"));
  await runArchive({ tracker, repos, clone, journal });
  const file = path.join(clone.root, ARCHIVE_DIR, "1.md");
  const before = fs.readFileSync(file, "utf8");
  tracker.repo.get(1).comments.push({ id: 102, user: user("maintainer"), created_at: at(9), updated_at: at(9), body: "b" });
  tracker.repo.get(1).pull.updated_at = at(9);
  const rename = fs.renameSync;
  fs.renameSync = () => {
    throw new Error("killed before the rename");
  };
  try {
    await assert.rejects(runArchive({ tracker, repos, clone, journal }), /killed before the rename/);
  } finally {
    fs.renameSync = rename;
  }
  assert.equal(fs.readFileSync(file, "utf8"), before, "the earlier file is whole");
  assert.ok(fs.existsSync(path.join(clone.root, ARCHIVE_DIR, ".1.md.partial")));
  const result = await runArchive({ tracker, repos, clone, journal });
  assert.equal(result.written, 1);
  assert.deepEqual(fs.readdirSync(path.join(clone.root, ARCHIVE_DIR)), ["1.md"]);
  assert.deepEqual(parseArchive(fs.readFileSync(file, "utf8"), repos).comments.map((c) => c.id), [101, 102]);
});

test("archive refuses to write when any archive path would be stored with line-end conversion", async () => {
  const dir = scratch();
  const clone = fakeClone(path.join(dir, "clone"));
  const asked = [];
  clone.converted = (paths) => (asked.push(...paths), paths.filter((p) => p.endsWith("/2.md")));
  const tracker = fakeTracker([conversation(1), conversation(2)]);
  await assert.rejects(runArchive({ tracker, repos, clone, journal: new Journal(path.join(dir, "journal.jsonl")) }), /line-end conversion .*archive\/pull-requests\/2[.]md/);
  assert.deepEqual(asked, [`${ARCHIVE_DIR}/1.md`, `${ARCHIVE_DIR}/2.md`]);
  assert.equal(fs.existsSync(path.join(clone.root, ARCHIVE_DIR)), false);
});

test("through the real client and pacer, a failed final read is retried only through a new reservation", async () => {
  // A virtual clock: sleeping moves time on, and a human edits the comment
  // during any wait longer than a minute.
  let t = 0;
  let body = "archived";
  const sleep = async (ms) => {
    if (ms > 60e3) body = "edited during a pacing wait";
    t += ms;
  };
  const pull = { number: 1, title: "Pull 1", user: user("maintainer"), state: "closed", draft: false, created_at: at(0), merged_at: null, closed_at: at(5), updated_at: at(6), body: "" };
  const comment = () => ({ id: 101, user: user("maintainer"), created_at: at(1), updated_at: at(1), body });
  const deleted = [];
  let reads = 0;
  const ok = (value) => ({ status: 0, stdout: JSON.stringify(value), stderr: "" });
  const run = (args) => {
    const line = args.join(" ");
    if (line === "api --paginate --slurp repos/Org/code/pulls?state=all&per_page=100") return ok([[pull]]);
    if (line === "api -X GET repos/Org/code/pulls/1") return ok({ ...pull, comments: deleted.length ? 0 : 1, review_comments: 0 });
    if (line === "api --paginate --slurp repos/Org/code/issues/1/comments?per_page=100") return ok([[comment()]]);
    if (line === "api --paginate --slurp repos/Org/code/pulls/1/reviews?per_page=100") return ok([[]]);
    if (line === "api -X GET repos/Org/code/issues/comments/101") return ++reads === 1 ? { status: 1, stdout: "", stderr: "gh: Bad Gateway (HTTP 502)" } : ok(comment());
    if (line === "api -X DELETE repos/Org/code/issues/comments/101") return (deleted.push(body), { status: 0, stdout: "", stderr: "" });
    throw new Error(`unexpected gh ${line}`);
  };
  const pacer = new Pacer({ perHour: 6, now: () => t, sleep });
  const tracker = pullTracker(ghClient({ pacer, run, sleep }));
  const dir = scratch();
  const clone = fakeClone(path.join(dir, "clone"));
  clone.histories.pushed.set(`${ARCHIVE_DIR}/1.md`, renderArchive(describePull({ ...pull, comments: 1, review_comments: 0 }, { comments: [comment()] }), repos));
  const result = await runScrub({ tracker, repos, clone, journal: new Journal(path.join(dir, "journal.jsonl")), sleep });
  assert.deepEqual(deleted, [], "the comment edited during the wait is not deleted");
  assert.deepEqual(result.refused, [{ pr: 1, refusals: ["comment 101 changed after it was archived"] }]);
  assert.ok(t >= 3600e3 - 60e3, "the retry waited for the hour's budget before it read again");
});

test("a reservation that can never fit is refused, and the scrub needs room for a read and a deletion", async () => {
  const pacer = new Pacer({ perHour: 1, writesPerMinute: 60, writesPerHour: 450 });
  assert.throws(() => pacer.wait(true, 2, 1), /can never fit/);
  await assert.rejects(pacer.room(2, 1), /can never fit/);
  assert.equal(new Pacer().wait(true, 2, 1), 0);
  assert.throws(() => parseArgs(["--scrub", "c", "--dir", "d", "--requests-per-hour", "1"]), /at least 2/);
});

test("an edit made while the scrub waits for the write budget stops that pull request's scrub", async () => {
  const dir = scratch();
  const clone = fakeClone(path.join(dir, "clone"));
  const tracker = fakeTracker([conversation(1, { comments: [{ body: "a" }, { body: "b" }] }), conversation(2, { reviewComments: [{ body: "r" }] })]);
  const journal = new Journal(path.join(dir, "journal.jsonl"));
  await runArchive({ tracker, repos, clone, journal });
  clone.push();
  let waits = 0;
  tracker.room = async () => {
    // The second wait comes after comment 102 is deleted; a human edits 101 during it.
    if (++waits === 2) tracker.repo.get(1).comments[0].body = "edited while the scrub waited";
  };
  const result = await runScrub({ tracker, repos, clone, journal });
  assert.deepEqual(result.refused, [{ pr: 1, refusals: ["comment 101 changed after it was archived"] }]);
  assert.deepEqual(tracker.repo.get(1).comments.map((c) => [c.id, c.body]), [[101, "edited while the scrub waited"]], "the edited comment is not deleted");
  assert.equal(result.scrubbed, 1, "the next pull request is still scrubbed");
  assert.deepEqual(tracker.calls.filter((c) => c.startsWith("delete")), ["delete comment 102", "delete review comment 2001"]);
});

test("the pacer makes room for a read and a deletion together before either is taken", async () => {
  let t = 0;
  const slept = [];
  const pacer = new Pacer({ perHour: 10, writesPerMinute: 60, writesPerHour: 1, now: () => t, sleep: async (ms) => (slept.push(ms), (t += ms)) });
  await pacer.take(true);
  t = 1000;
  await pacer.room(2, 1);
  assert.deepEqual(slept, [3600e3 - 1000 + 0], "it waits for the hour's one write to leave the window");
  await pacer.take(false);
  await pacer.take(true);
  assert.equal(slept.length, 1, "the read and the deletion then go without waiting");
  t += 1;
  const full = new Pacer({ perHour: 3, writesPerHour: 10, now: () => t, sleep: async (ms) => (slept.push(ms), (t += ms)) });
  await full.take(false);
  await full.take(false);
  await full.room(2, 1);
  assert.equal(slept.length, 2, "two more requests do not fit an hour of three that holds two");
  assert.equal(full.wait(false), 0);
  assert.equal(full.wait(true, 2, 1), 0);
});

test("a deletion that fails in a way that may have taken effect is checked against the live comment", async () => {
  const dir = scratch();
  const clone = fakeClone(path.join(dir, "clone"));
  const tracker = fakeTracker([conversation(1, { comments: [{ body: "a" }] })]);
  const journal = new Journal(path.join(dir, "journal.jsonl"));
  await runArchive({ tracker, repos, clone, journal });
  clone.push();
  const deleteComment = tracker.deleteComment;
  tracker.deleteComment = async function (repo, id) {
    await deleteComment.call(this, repo, id);
    throw new GhError(["api"], 502, "gh: Bad Gateway (HTTP 502)");
  };
  const slept = [];
  const sleep = async (ms) => slept.push(ms);
  assert.equal((await runScrub({ tracker, repos, clone, journal, sleep })).scrubbed, 1, "a 502 after the comment went is a deletion");
  const kept = fakeTracker([conversation(2, { comments: [{ body: "a" }] })]);
  await runArchive({ tracker: kept, repos, clone, journal });
  clone.push();
  let attempts = 0;
  kept.deleteComment = async () => {
    attempts++;
    throw new GhError(["api"], 502, "gh: Bad Gateway (HTTP 502)");
  };
  await assert.rejects(runScrub({ tracker: kept, repos, clone, journal, sleep }), /HTTP 502/, "a 502 with the comment still there stops the run after its retries");
  assert.equal(attempts, 9);
});

test("a deletion refused by a rate limit is retried only after reading the comment again", async () => {
  const dir = scratch();
  const clone = fakeClone(path.join(dir, "clone"));
  const tracker = fakeTracker([conversation(1, { comments: [{ body: "a" }] }), conversation(2, { comments: [{ body: "b" }] })]);
  const journal = new Journal(path.join(dir, "journal.jsonl"));
  await runArchive({ tracker, repos, clone, journal });
  clone.push();
  const deleteComment = tracker.deleteComment;
  const refusedOnce = new Set();
  tracker.deleteComment = async function (repo, id) {
    if (!refusedOnce.has(id)) {
      refusedOnce.add(id);
      throw new GhError(["api"], 403, "gh: You have exceeded a secondary rate limit (HTTP 403)", { limited: true });
    }
    return deleteComment.call(this, repo, id);
  };
  const slept = [];
  // A human edits comment 101 during the backoff; comment 201 is left alone.
  const sleep = async (ms) => {
    slept.push(ms);
    if (slept.length === 1) tracker.repo.get(1).comments[0].body = "edited during the backoff";
  };
  const result = await runScrub({ tracker, repos, clone, journal, sleep });
  assert.deepEqual(result.refused, [{ pr: 1, refusals: ["comment 101 changed after it was archived"] }]);
  assert.deepEqual(tracker.repo.get(1).comments.map((c) => c.body), ["edited during the backoff"], "the edit survives");
  assert.deepEqual(tracker.repo.get(2).comments, [], "the other pull request is scrubbed after its own backoff");
  assert.deepEqual(slept, [60e3, 60e3]);
});

test("the production deletion is one paced request with no retry inside the client", async () => {
  const calls = [];
  const run = (args) => {
    calls.push(args.join(" "));
    return { status: 1, stdout: "", stderr: "gh: You have exceeded a secondary rate limit (HTTP 403)" };
  };
  const gh = ghClient({ pacer: new Pacer(), run, sleep: async () => assert.fail("the client must not wait to retry a deletion") });
  const tracker = pullTracker(gh);
  const error = await tracker.deleteComment("Org/code", 5).catch((e) => e);
  assert.ok(error instanceof GhError && error.limited && error.status === 403);
  await tracker.deleteReviewComment("Org/code", 6).catch(() => {});
  assert.deepEqual(calls, ["api -X DELETE repos/Org/code/issues/comments/5", "api -X DELETE repos/Org/code/pulls/comments/6"]);
  assert.equal(gh.pacer.totalWrites, 2);
  // The last reads before a deletion are single attempts too.
  calls.length = 0;
  await assert.rejects(tracker.findComment("Org/code", 5), GhError);
  await assert.rejects(tracker.findReviewComment("Org/code", 6), GhError);
  assert.deepEqual(calls, ["api -X GET repos/Org/code/issues/comments/5", "api -X GET repos/Org/code/pulls/comments/6"]);
});

test("a deletion that would wait for the budget after its read starts over with a new read", async () => {
  const dir = scratch();
  const clone = fakeClone(path.join(dir, "clone"));
  const tracker = fakeTracker([conversation(1, { comments: [{ body: "a" }] })]);
  const journal = new Journal(path.join(dir, "journal.jsonl"));
  await runArchive({ tracker, repos, clone, journal });
  clone.push();
  let checks = 0;
  tracker.ready = () => {
    // Not ready after the first read; the comment is edited before the next.
    if (++checks > 1) return true;
    tracker.repo.get(1).comments[0].body = "edited while the deletion would have waited";
    return false;
  };
  const result = await runScrub({ tracker, repos, clone, journal });
  assert.deepEqual(result.refused, [{ pr: 1, refusals: ["comment 101 changed after it was archived"] }]);
  assert.equal(tracker.repo.get(1).comments.length, 1);
});

test("a pull request that does not read back empty after its deletions is reported as failed", async () => {
  const dir = scratch();
  const clone = fakeClone(path.join(dir, "clone"));
  const tracker = fakeTracker([conversation(1, { comments: [{ body: "a" }] })]);
  const journal = new Journal(path.join(dir, "journal.jsonl"));
  await runArchive({ tracker, repos, clone, journal });
  clone.push();
  const getPull = tracker.getPull;
  let reads = 0;
  tracker.getPull = async function (repo, n) {
    const pull = await getPull.call(this, repo, n);
    return ++reads === 2 ? { ...pull, comments: 1 } : pull;
  };
  const result = await runScrub({ tracker, repos, clone, journal });
  assert.deepEqual(result.failed, [{ pr: 1, problems: ["reads back with 1 comments and 0 review comments"] }]);
  assert.deepEqual(journal.of("scrub").filter((r) => r.step === "finished"), []);
});

// ---------------------------------------------------------------------------
// The clone

const git = (cwd, ...args) => {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
  assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
};

test("a remote is the internal repository only at its GitHub address, not at a namesake path or host", () => {
  for (const url of ["https://github.com/Org/internal.git", "https://github.com/org/Internal", "https://x-access-token@github.com/Org/internal.git", "git@github.com:Org/internal.git", "ssh://git@github.com/Org/internal.git"]) assert.ok(githubRemote(url, "Org/internal"), url);
  for (const url of ["https://github.com/Org/code.git", "https://github.com/Org/internal-other.git", "https://github.com/XOrg/internal.git", "https://github.com/Org/internalx", "https://elsewhere.invalid/Org/internal.git", "https://github.com.evil/Org/internal.git", "C:/backup/Org/internal.git", "/tmp/x/Org/internal/", "file:///tmp/Org/internal.git"]) assert.ok(!githubRemote(url, "Org/internal"), url);
});

test("the clone must be the internal repository's, store the archive verbatim, and serve what was pushed and nothing else", () => {
  const dir = scratch();
  console.log(`Scratch directory: ${dir}`);
  try {
    const bare = path.join(dir, "Org", "internal.git");
    fs.mkdirSync(bare, { recursive: true });
    git(bare, "init", "--bare", "--quiet", "--initial-branch=main");
    const root = path.join(dir, "clone");
    git(dir, "clone", "--quiet", bare, root);
    for (const [k, v] of [["user.name", "Test"], ["user.email", "test@example.com"], ["core.autocrlf", "true"]]) git(root, "config", k, v);
    // The scratch remote stands in for GitHub; only its exact path is accepted.
    const local = { remoteMatches: (url) => path.resolve(url) === path.resolve(bare) };
    assert.throws(() => cloneOf(root, repos), /not https:\/\/github[.]com\/Org\/internal/, "a local namesake of the internal repository is refused");
    assert.throws(() => cloneOf(root, repos, local), /line-end conversion/, "a clone without the attribute is refused");
    fs.writeFileSync(path.join(root, ".gitattributes"), "archive/** -text\n");
    const clone = cloneOf(root, repos, local);
    const paths = [`${ARCHIVE_DIR}/1.md`, `${ARCHIVE_DIR}/2054.md`];
    assert.deepEqual(clone.converted(paths), []);
    fs.writeFileSync(path.join(root, ".gitattributes"), `${ARCHIVE_DIR}/1.md -text\n`);
    assert.deepEqual(clone.converted(paths), [`${ARCHIVE_DIR}/2054.md`], "an attribute that covers only the sampled file is caught for the others");
    fs.writeFileSync(path.join(root, ".gitattributes"), "archive/** -text\n");
    assert.throws(() => cloneOf(path.join(root, "archive"), repos, local), /not the top of its clone|cannot|failed/, "a directory inside the clone is refused");
    git(root, "remote", "set-url", "--add", "origin", "https://elsewhere.invalid/Org/internal.git");
    assert.throws(() => cloneOf(root, repos, local), /elsewhere[.]invalid/, "a second fetch URL elsewhere is refused");
    git(root, "remote", "set-url", "--delete", "origin", "elsewhere");

    const text = renderArchive(record(conversation(1, { comments: [{ body: "CRLF\r\nkept" }] })), repos);
    fs.mkdirSync(path.join(root, ARCHIVE_DIR), { recursive: true });
    fs.writeFileSync(path.join(root, ARCHIVE_DIR, "1.md"), text);
    git(root, "add", ".gitattributes", ARCHIVE_DIR);
    git(root, "commit", "--quiet", "-m", "archive");
    // Committed but not pushed: the default branch has nothing yet.
    assert.throws(() => clone.fetchDefault(), /no default branch|failed/);
    git(root, "push", "--quiet", "origin", "HEAD:main");
    const { branch, commit } = clone.fetchDefault();
    assert.equal(branch, "main");
    assert.equal(clone.show(commit, `${ARCHIVE_DIR}/1.md`), text, "the pushed file reads back byte for byte, CRLF included");
    assert.equal(clone.show(commit, `${ARCHIVE_DIR}/2.md`), null);
    // A later local commit that is not pushed is not what scrub reads.
    fs.writeFileSync(path.join(root, ARCHIVE_DIR, "2.md"), text);
    git(root, "add", ARCHIVE_DIR);
    git(root, "commit", "--quiet", "-m", "more");
    assert.equal(clone.show(clone.fetchDefault().commit, `${ARCHIVE_DIR}/2.md`), null);
    assert.equal(clone.show("HEAD", `${ARCHIVE_DIR}/2.md`), text, "the clone's own HEAD holds it");
    assert.equal(clone.show("HEAD", `${ARCHIVE_DIR}/3.md`), null);
    // Nor can a local replace ref stand the unpushed commit in for the pushed one.
    git(root, "replace", commit, git(root, "rev-parse", "HEAD").trim());
    assert.equal(spawnSync("git", ["-C", root, "cat-file", "blob", `${commit}:${ARCHIVE_DIR}/2.md`], { encoding: "utf8", windowsHide: true }).stdout, text, "plain Git follows the replace ref");
    assert.equal(clone.show(commit, `${ARCHIVE_DIR}/2.md`), null, "the clone's reads do not");
    assert.equal(clone.fetchDefault().commit, commit);
    // A branch that moves between the listing and the fetch is refused.
    const realRun = (args, input) => spawnSync("git", ["--no-replace-objects", "-C", root, ...args], { input, encoding: "utf8", windowsHide: true });
    const moved = cloneOf(root, repos, { ...local, run: (args, input) => (args[0] === "ls-remote" ? { status: 0, stdout: `ref: refs/heads/main\tHEAD\n${"0".repeat(40)}\tHEAD\n`, stderr: "" } : realRun(args, input)) });
    assert.throws(() => moved.fetchDefault(), /moved from 0{40} to /);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Command line

test("the command line takes one mode with its clone and an attempt directory", () => {
  const opts = parseArgs(["--archive", "clone", "--dir", "attempt", "--only", "3,1,3", "--writes-per-hour", "900"]);
  assert.equal(opts.mode, "archive");
  assert.equal(opts.clone, path.resolve("clone"));
  assert.deepEqual(opts.only, [3, 1]);
  assert.equal(opts.writesPerHour, 900);
  assert.throws(() => parseArgs(["--archive", "c"]), /--dir/);
  assert.throws(() => parseArgs(["--scrub", "--dir", "d"]), /needs a value/);
  assert.throws(() => parseArgs(["--archive", "c", "--scrub", "c", "--dir", "d"]), /one mode/);
  assert.throws(() => parseArgs(["--scrub", "c", "--dir", "d", "--only", "1,x"]), /numbers/);
  assert.throws(() => parseArgs(["--dir", "d"]), /give a mode/);
});

test("main refuses an attempt directory inside a Git work tree, and reports refusals with a non-zero exit", async () => {
  const dir = scratch();
  try {
    const inside = path.join(dir, "repo");
    fs.mkdirSync(inside);
    git(inside, "init", "--quiet");
    await assert.rejects(main(["--archive", "c", "--dir", path.join(inside, "attempt")], { repos, tracker: fakeTracker([]), clone: fakeClone(dir) }), /inside a Git work tree/);
    const clone = fakeClone(path.join(dir, "clone"));
    const tracker = fakeTracker([conversation(1, { comments: [{ body: "a" }] })]);
    let printed = "";
    const out = (s) => (printed += s);
    assert.equal(await main(["--archive", "c", "--dir", path.join(dir, "attempt")], { repos, tracker, clone, out, log: quiet }), 0);
    assert.equal(JSON.parse(printed).written, 1);
    printed = "";
    assert.equal(await main(["--scrub", "c", "--dir", path.join(dir, "attempt")], { repos, tracker, clone, out, log: quiet }), 1, "an unpushed archive is refused");
    clone.push();
    printed = "";
    assert.equal(await main(["--scrub", "c", "--dir", path.join(dir, "attempt"), "--dry-run"], { repos, tracker, clone, out, log: quiet }), 0);
    assert.deepEqual(JSON.parse(printed).deleted, { comments: 1, reviewComments: 0 });
    assert.equal(tracker.repo.get(1).comments.length, 1);
    assert.equal(await main(["--scrub", "c", "--dir", path.join(dir, "attempt")], { repos, tracker, clone, out, log: quiet }), 0);
    assert.equal(tracker.repo.get(1).comments.length, 0);
    assert.ok(fs.existsSync(path.join(dir, "attempt", "scrub-report.json")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
