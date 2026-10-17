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
import { GhError, Journal } from "./migrate-tracker.mjs";
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
  remoteNames,
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
      return find("comments", id) ? { id } : null;
    },
    async findReviewComment(_repo, id) {
      return find("reviewComments", id) ? { id } : null;
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

/** A clone whose pushed default branch is the files committed() was last called with. */
function fakeClone(root) {
  let pushed = new Map();
  return {
    root,
    push() {
      pushed = new Map();
      const dir = path.join(root, ARCHIVE_DIR);
      if (fs.existsSync(dir)) for (const name of fs.readdirSync(dir)) pushed.set(`${ARCHIVE_DIR}/${name}`, fs.readFileSync(path.join(dir, name), "utf8"));
    },
    fetchDefault: () => ({ branch: "main", commit: "c0ffee" }),
    show: (_commit, file) => pushed.get(file) ?? null,
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
  assert.deepEqual(first, { pullRequests: 3, written: 3, unchanged: 0, keptEarlier: [], comments: 1, reviewComments: 1, reviewsWithSummary: [{ pr: 5, review: 50001 }], failed: [] });
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
  assert.deepEqual(unpushed.refused.map((r) => r.pr), [1, 2, 3, 4], "nothing is deleted before the archive is pushed");
  assert.equal(tracker.calls.filter((c) => c.startsWith("delete")).length, 0);

  clone.push();
  const dry = await runScrub({ tracker, repos, clone, journal: { of: () => [], append: (r) => r }, dryRun: true });
  assert.deepEqual(dry.deleted, { comments: 2, reviewComments: 2 });
  assert.equal(tracker.calls.filter((c) => c.startsWith("delete")).length, 0, "a dry run deletes nothing");

  const result = await runScrub({ tracker, repos, clone, journal });
  assert.equal(result.scrubbed, 1);
  assert.equal(result.alreadyEmpty, 1);
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

test("an archive rerun after a partial scrub keeps the file that holds the deleted comments", async () => {
  const dir = scratch();
  const clone = fakeClone(path.join(dir, "clone"));
  const tracker = fakeTracker([conversation(1, { comments: [{ body: "a" }, { body: "b" }] })]);
  const journal = new Journal(path.join(dir, "journal.jsonl"));
  await runArchive({ tracker, repos, clone, journal });
  const file = path.join(clone.root, ARCHIVE_DIR, "1.md");
  const before = fs.readFileSync(file, "utf8");
  // The scrub deleted one comment, which moves the pull request's updated time.
  tracker.repo.get(1).comments.pop();
  tracker.repo.get(1).pull.updated_at = at(40);
  for (const only of [null, [1]]) {
    const result = await runArchive({ tracker, repos, clone, journal, only });
    assert.deepEqual(result.keptEarlier, [{ pr: 1, gone: 1 }]);
    assert.equal(result.written, 0);
    assert.equal(fs.readFileSync(file, "utf8"), before, "the file still holds the deleted comment");
  }
  fs.writeFileSync(file, before.slice(0, -3));
  assert.match((await runArchive({ tracker, repos, clone, journal })).failed[0].problems[0], /does not read back.*restore it/, "a damaged file is not replaced either");
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
  assert.equal((await runScrub({ tracker, repos, clone, journal })).scrubbed, 1, "a 502 after the comment went is a deletion");
  const kept = fakeTracker([conversation(2, { comments: [{ body: "a" }] })]);
  await runArchive({ tracker: kept, repos, clone, journal });
  clone.push();
  kept.deleteComment = async () => {
    throw new GhError(["api"], 502, "gh: Bad Gateway (HTTP 502)");
  };
  await assert.rejects(runScrub({ tracker: kept, repos, clone, journal }), /HTTP 502/, "a 502 with the comment still there stops the run");
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

test("a remote names the internal repository in any URL form, and no other repository", () => {
  for (const url of ["https://github.com/Org/internal.git", "https://github.com/org/Internal", "git@github.com:Org/internal.git", "C:/tmp/x/Org/internal.git", "/tmp/x/Org/internal/"]) assert.ok(remoteNames(url, "Org/internal"), url);
  for (const url of ["https://github.com/Org/code.git", "https://github.com/Org/internal-other.git", "https://github.com/XOrg/internal.git", "https://github.com/Org/internalx"]) assert.ok(!remoteNames(url, "Org/internal"), url);
});

test("the clone must be the internal repository's, store the archive verbatim, and serve what was pushed", () => {
  const dir = scratch();
  console.log(`Scratch directory: ${dir}`);
  try {
    const bare = path.join(dir, "Org", "internal.git");
    fs.mkdirSync(bare, { recursive: true });
    git(bare, "init", "--bare", "--quiet", "--initial-branch=main");
    const root = path.join(dir, "clone");
    git(dir, "clone", "--quiet", bare, root);
    for (const [k, v] of [["user.name", "Test"], ["user.email", "test@example.com"], ["core.autocrlf", "true"]]) git(root, "config", k, v);
    assert.throws(() => cloneOf(root, repos), /line-end conversion/, "a clone without the attribute is refused");
    fs.writeFileSync(path.join(root, ".gitattributes"), "archive/** -text\n");
    const clone = cloneOf(root, repos);
    assert.throws(() => cloneOf(path.join(root, "archive"), repos), /not the top of its clone|cannot|failed/, "a directory inside the clone is refused");
    assert.throws(() => cloneOf(root, { ...repos, internal: "Org/other" }), /not Org\/other/, "a clone of another repository is refused");

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
