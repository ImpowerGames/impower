// Archives the conversation of every pull request on the code repository
// into a clone of the internal repository, then deletes it from the code
// repository (#1961, #1967). Both repositories are named in
// .agents/repos.json.
//
//   --archive <clone>  for every pull request, write
//                      archive/pull-requests/<N>.md under the clone: the
//                      title, author, state, created, merged and closed
//                      times, the body, and every issue comment, review
//                      comment and review with its id, author, times and
//                      body verbatim; then read each file back and compare
//                      it with what the API returned and with the pull
//                      request's comment counts
//   --scrub <clone>    for every pull request, read its archive back from
//                      the internal repository's default branch as pushed,
//                      check that it is complete and that it holds every
//                      comment still on the pull request with the same body,
//                      and only then delete those issue comments and review
//                      comments, reading the counts back as zero afterwards
//   --dry-run          on either mode: read, check and report, write nothing
//   --only <N,...>     limit either mode to the given pull requests; an
//                      archive rerun with --only reads them again
//
// An archive file is never replaced by one that lacks a comment it holds:
// once the scrub has deleted that comment, the file is its only copy, so a
// rerun carries it into the new file, names it under "Comments kept after
// deletion" and reports the pull request under carried. Files are written
// beside their place and renamed into it, so an interrupted write leaves
// the earlier file whole.
//
// Both modes take --dir <dir>, a private attempt directory outside any Git
// work tree, which holds the journal, pull-requests.jsonl. Every file
// written and every comment deleted is journaled, so a rerun of the same
// mode resumes: archive skips a pull request whose file it wrote while the
// pull request's updated time has not moved, and scrub reads the live
// comments again, so one already deleted is not deleted twice.
//
// The clone's origin must be the internal repository on GitHub, so an
// archive is never written into a checkout of the public one and never
// checked against a backup or another host, and archive/** must carry the
// attribute -text (in the clone's .gitattributes), so Git stores the bodies'
// line ends exactly as written. Git runs with replacement objects off.
//
// GitHub has no conditional deletion. The scrub reads each comment again
// just before deleting it and stops that pull request's scrub on any edit
// since the archive, which leaves about a second between the read and the
// deletion in which an edit would be lost; the cutover window, in which
// nobody else writes, closes it.
//
// Submitted reviews cannot be deleted, so a review's summary text stays on
// its pull request; it is archived, and both modes report the reviews whose
// summary is not empty.
//
// Requests go through REST (`gh api`, paginated), never GraphQL, under the
// migration tool's pacer and retries: 4,500 requests an hour by default, and
// deletions counted as writes, at 60 a minute and 450 an hour unless
// --writes-per-minute and --writes-per-hour raise them. GitHub does not say
// whether a deletion counts against its limits on content-creating
// requests, so the default assumes it does.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { readRepos } from "../.agents/repos.mjs";
import { GhError, Journal, Pacer, checkPrivateDir, estimateHours, ghClient, retryWait, writeJson } from "./migrate-tracker.mjs";

export const ARCHIVE_DIR = "archive/pull-requests";
const MODES = ["archive", "scrub"];

// ---------------------------------------------------------------------------
// The archive format
//
// One Markdown file per pull request. Every text the API returned (the body
// and each comment's and review's body) sits verbatim in a fenced block
// whose fence is longer than any run of backticks in the text, so the text
// cannot close it, and GitHub renders it as text: no mention, reference or
// image in an archived body is resolved. Every other value is written as
// JSON after its field name. parseArchive() reads a file back to the record
// renderArchive() wrote it from, and refuses anything else.

const byCreated = (a, b) => (a.createdAt === b.createdAt ? a.id - b.id : a.createdAt < b.createdAt ? -1 : 1);

/** The archive record of a pull request and its conversation, from the REST API's objects. */
export function describePull(pull, { comments = [], reviewComments = [], reviews = [] } = {}) {
  return {
    number: pull.number,
    title: pull.title ?? "",
    author: pull.user?.login ?? null,
    state: pull.merged_at ? "merged" : pull.state,
    draft: Boolean(pull.draft),
    createdAt: pull.created_at,
    mergedAt: pull.merged_at ?? null,
    closedAt: pull.closed_at ?? null,
    updatedAt: pull.updated_at,
    // The counts the API reports on the pull request itself, which the
    // archived lists are checked against.
    commentCount: pull.comments,
    reviewCommentCount: pull.review_comments,
    // The ids of comments a later archive carries over from an earlier one
    // because they are no longer on the pull request (see carryForward).
    keptComments: [],
    keptReviewComments: [],
    body: pull.body ?? "",
    comments: comments.map((c) => ({ id: c.id, author: c.user?.login ?? null, createdAt: c.created_at, updatedAt: c.updated_at, body: c.body ?? "" })).sort(byCreated),
    reviewComments: reviewComments
      .map((c) => ({ id: c.id, author: c.user?.login ?? null, createdAt: c.created_at, updatedAt: c.updated_at, review: c.pull_request_review_id ?? null, inReplyTo: c.in_reply_to_id ?? null, path: c.path ?? null, line: c.line ?? c.original_line ?? null, body: c.body ?? "" }))
      .sort(byCreated),
    reviews: reviews.map((r) => ({ id: r.id, author: r.user?.login ?? null, state: r.state, submittedAt: r.submitted_at ?? null, body: r.body ?? "" })).sort((a, b) => a.id - b.id),
  };
}

/** A backtick fence longer than any run of backticks in `text`, and at least three long. */
export function fenceFor(text) {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  return "`".repeat(Math.max(3, longest + 1));
}

const block = (text) => {
  const fence = fenceFor(text);
  return `${fence}text\n${text}\n${fence}\n`;
};

// The fields of each section, in the order they are written: the record key
// and the label it is written under.
const PULL_FIELDS = [
  ["title", "Title"],
  ["author", "Author"],
  ["state", "State"],
  ["draft", "Draft"],
  ["createdAt", "Created"],
  ["mergedAt", "Merged"],
  ["closedAt", "Closed"],
  ["updatedAt", "Updated"],
  ["commentCount", "Comments"],
  ["reviewCommentCount", "Review comments"],
  ["keptComments", "Comments kept after deletion"],
  ["keptReviewComments", "Review comments kept after deletion"],
];
const SECTIONS = [
  { list: "comments", heading: "Comment", fields: [["author", "Author"], ["createdAt", "Created"], ["updatedAt", "Updated"]] },
  { list: "reviewComments", heading: "Review comment", fields: [["author", "Author"], ["createdAt", "Created"], ["updatedAt", "Updated"], ["review", "Review"], ["inReplyTo", "In reply to"], ["path", "Path"], ["line", "Line"]] },
  { list: "reviews", heading: "Review", fields: [["author", "Author"], ["state", "State"], ["submittedAt", "Submitted"]] },
];

const fieldLines = (record, fields) => fields.map(([key, label]) => `- ${label}: ${JSON.stringify(record[key])}\n`).join("");

export function renderArchive(record, repos) {
  let out = `# Pull request ${record.number}: ${record.title.replace(/\s+/g, " ").trim()}\n\n`;
  out += `Archived from https://github.com/${repos.code}/pull/${record.number}. Every text below is verbatim from the API, in a fenced block.\n\n`;
  out += fieldLines(record, PULL_FIELDS);
  out += `\n## Body\n\n${block(record.body)}`;
  for (const section of SECTIONS) for (const item of record[section.list]) out += `\n## ${section.heading} ${item.id}\n\n${fieldLines(item, section.fields)}\n${block(item.body)}`;
  return out;
}

export class ArchiveFormatError extends Error {}

/** Reads an archive file back to its record; throws ArchiveFormatError on anything renderArchive() would not have written. */
export function parseArchive(text, repos) {
  let pos = 0;
  const fail = (what) => {
    throw new ArchiveFormatError(`malformed archive at offset ${pos}: ${what}`);
  };
  const line = () => {
    const end = text.indexOf("\n", pos);
    if (end < 0) fail("no line end");
    const out = text.slice(pos, end);
    pos = end + 1;
    return out;
  };
  const blank = () => line() === "" || fail("a blank line expected");
  const fields = (target, list) => {
    for (const [key, label] of list) {
      const prefix = `- ${label}: `;
      const l = line();
      if (!l.startsWith(prefix)) fail(`the field "${label}" expected`);
      try {
        target[key] = JSON.parse(l.slice(prefix.length));
      } catch {
        fail(`the field "${label}" is not JSON`);
      }
    }
  };
  const fenced = () => {
    const opener = line();
    const fence = /^(`{3,})text$/.exec(opener)?.[1] ?? fail("a fenced block expected");
    // The text ends at the first line holding only the fence, which the
    // text itself cannot hold; an empty text is a line end and the fence.
    const close = text.indexOf(`\n${fence}\n`, pos);
    if (close < 0) fail("an unclosed fenced block");
    const body = text.slice(pos, close);
    pos = close + fence.length + 2;
    return body;
  };
  const title = /^# Pull request (\d+): /.exec(line()) ?? fail("the title line expected");
  const record = { number: Number(title[1]) };
  blank();
  line();
  blank();
  fields(record, PULL_FIELDS);
  blank();
  if (line() !== "## Body") fail("the body heading expected");
  blank();
  record.body = fenced();
  for (const section of SECTIONS) record[section.list] = [];
  let at = 0;
  while (pos < text.length) {
    blank();
    const heading = line();
    const index = SECTIONS.findIndex((s, i) => i >= at && new RegExp(`^## ${s.heading} [0-9]+$`).test(heading));
    if (index < 0) fail(`a section heading expected, not ${JSON.stringify(heading.slice(0, 80))}`);
    at = index;
    const section = SECTIONS[index];
    const item = { id: Number(heading.slice(`## ${section.heading} `.length)) };
    blank();
    fields(item, section.fields);
    blank();
    item.body = fenced();
    record[section.list].push(item);
  }
  // The file must be exactly what its record renders to: nothing added,
  // reordered or dropped.
  if (renderArchive(record, repos) !== text) fail("the file is not what its record renders to");
  return record;
}

const LISTS = [
  { list: "comments", count: "commentCount", kept: "keptComments", what: "comments" },
  { list: "reviewComments", count: "reviewCommentCount", kept: "keptReviewComments", what: "review comments" },
];

/**
 * What makes an archive record incomplete: lists shorter or longer than the
 * counts the pull request reported plus the comments carried over from an
 * earlier archive. An empty list means the record is complete.
 */
export function archiveProblems(record) {
  const problems = [];
  for (const { list, count, kept, what } of LISTS) {
    const expected = record[count] + record[kept].length;
    if (record[list].length !== expected) problems.push(`holds ${record[list].length} of ${expected} ${what}`);
    const held = new Set(record[list].map((c) => c.id));
    const missing = record[kept].filter((id) => !held.has(id));
    if (missing.length) problems.push(`names kept ${what} it does not hold: ${missing.join(", ")}`);
  }
  return problems;
}

/**
 * The live record with every comment of the earlier archives that is no
 * longer on the pull request carried over and named as kept: once the scrub
 * has deleted a comment, an earlier archive is its only copy. A comment
 * still on the pull request takes its live text; one in several earlier
 * archives takes its text from the first of them.
 */
export function carryForward(record, earlier) {
  const out = { ...record };
  let carried = 0;
  for (const { list, kept } of LISTS) {
    const seen = new Set(record[list].map((c) => c.id));
    const gone = [];
    for (const copy of earlier) {
      for (const c of copy[list]) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        gone.push(c);
      }
    }
    carried += gone.length;
    out[list] = [...record[list], ...gone].sort(byCreated);
    out[kept] = gone.map((c) => c.id).sort((a, b) => a - b);
  }
  return { record: out, carried };
}

const archivePath = (n) => `${ARCHIVE_DIR}/${n}.md`;
const withSummary = (reviews) => reviews.filter((r) => r.body.trim() !== "");

// ---------------------------------------------------------------------------
// The internal repository's clone

/**
 * True when a remote URL is the GitHub repository `slug` (owner/name) over
 * HTTPS or SSH. A path or another host that ends in the same owner/name is
 * a different repository, such as a local backup, and is refused.
 */
export function githubRemote(url, slug) {
  const escaped = slug.replace(/[.*+?^${}()|[\]\x5c]/g, "\x5c$&");
  return new RegExp(`^(?:https://(?:[^@/]+@)?github[.]com/|ssh://git@github[.]com/|git@github[.]com:)${escaped}(?:[.]git)?/?$`, "i").test(url.trim());
}

const runGit = (root) => (args, input) => spawnSync("git", ["--no-replace-objects", "-C", root, ...args], { input, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, windowsHide: true, env: { ...process.env, GIT_NO_REPLACE_OBJECTS: "1" } });

/**
 * Git operations on the clone the archive is written into. Refuses a clone
 * whose origin is not the internal repository on GitHub (every fetch URL,
 * as Git expands it) and one where archive/** is not stored verbatim.
 * Every command runs with replacement objects off, so a local replace ref
 * cannot stand in for what the internal repository holds.
 */
export function cloneOf(root, repos, { run = runGit(root), remoteMatches = githubRemote } = {}) {
  const git = (args, input) => {
    const r = run(args, input);
    if (r.error) throw r.error;
    return r;
  };
  const ok = (args, input) => {
    const r = git(args, input);
    if (r.status !== 0) throw new Error(`git ${args.join(" ")} in ${root} failed: ${(r.stderr ?? "").trim().split("\n")[0]}`);
    return r.stdout;
  };
  const top = ok(["rev-parse", "--show-toplevel"]).trim();
  // Compared as real paths: Git prints the long form of a Windows path that
  // was given in its 8.3 short form (C:/Users/RUNNER~1/...).
  const real = (p) => fs.realpathSync.native(path.resolve(p)).toLowerCase();
  if (real(top) !== real(root)) throw new Error(`${root} is not the top of its clone (${top}); give the clone's root`);
  const origins = ok(["remote", "get-url", "--all", "origin"]).split("\n").map((u) => u.trim()).filter(Boolean);
  const foreign = origins.filter((u) => !remoteMatches(u, repos.internal));
  if (!origins.length || foreign.length) throw new Error(`${root}'s origin is ${origins.join(", ") || "unset"}, not https://github.com/${repos.internal}; the archive is written only into a clone of the internal repository`);
  const attribute = ok(["check-attr", "text", "--", `${ARCHIVE_DIR}/1.md`]).trim();
  if (!/: text: unset$/.test(attribute)) throw new Error(`${root} stores ${ARCHIVE_DIR} with line-end conversion (${attribute}); commit "archive/** -text" to its .gitattributes first`);
  return {
    root,
    /** Fetches the internal repository's default branch and returns the commit it points at, as the remote reports it. */
    fetchDefault() {
      const listed = ok(["ls-remote", "--symref", "origin", "HEAD"]);
      const head = /^ref: refs\/heads\/(\S+)\s+HEAD$/m.exec(listed)?.[1];
      const reported = /^([0-9a-f]{40,64})\s+HEAD$/m.exec(listed)?.[1];
      if (!head || !reported) throw new Error(`${repos.internal} reports no default branch`);
      ok(["fetch", "--quiet", "origin", `refs/heads/${head}`]);
      const commit = ok(["rev-parse", "FETCH_HEAD"]).trim();
      if (commit !== reported) throw new Error(`${repos.internal}'s ${head} moved from ${reported} to ${commit} while it was fetched; rerun`);
      return { branch: head, commit };
    },
    /** The files among `files` that Git would not store byte for byte. */
    converted(files) {
      if (!files.length) return [];
      const out = ok(["check-attr", "text", "--stdin"], `${files.join("\n")}\n`);
      return out.split("\n").filter((l) => l.trim() && !/: text: unset$/.test(l)).map((l) => l.replace(/: text: [^:]*$/, ""));
    },
    /** The file at `file` in `commit`, or null when the commit has none. */
    show(commit, file) {
      const r = git(["cat-file", "blob", `${commit}:${file}`]);
      if (r.status === 0) return r.stdout;
      if (/does not exist|exists on disk, but not in|not a valid object name|invalid object name/i.test(r.stderr ?? "")) return null;
      throw new Error(`git cat-file blob ${commit}:${file} failed: ${(r.stderr ?? "").trim().split("\n")[0]}`);
    },
  };
}

// ---------------------------------------------------------------------------
// The code repository

/** The REST calls the modes make, in one place. */
export function pullTracker(gh) {
  const gone = async (fn) => {
    try {
      return await fn();
    } catch (error) {
      if (error.status === 404 || error.status === 410) return null;
      throw error;
    }
  };
  return {
    listPulls: (repo) => gh.list(`repos/${repo}/pulls?state=all&per_page=100`),
    getPull: (repo, n) => gh.api("GET", `repos/${repo}/pulls/${n}`),
    comments: (repo, n) => gh.list(`repos/${repo}/issues/${n}/comments?per_page=100`),
    reviewComments: (repo, n) => gh.list(`repos/${repo}/pulls/${n}/comments?per_page=100`),
    reviews: (repo, n) => gh.list(`repos/${repo}/pulls/${n}/reviews?per_page=100`),
    // One attempt each: they are the scrub's last reads before a deletion,
    // and a retry inside the client would take budget the deletion needs.
    findComment: (repo, id) => gone(() => gh.apiOnce("GET", `repos/${repo}/issues/comments/${id}`)),
    findReviewComment: (repo, id) => gone(() => gh.apiOnce("GET", `repos/${repo}/pulls/comments/${id}`)),
    // One attempt each: the scrub reads the comment again before a retry.
    deleteComment: (repo, id) => gh.apiOnce("DELETE", `repos/${repo}/issues/comments/${id}`),
    deleteReviewComment: (repo, id) => gh.apiOnce("DELETE", `repos/${repo}/pulls/comments/${id}`),
    // Room for a comment's read and its deletion together, so neither waits
    // for the budget between them.
    room: () => gh.pacer.room(2, 1),
    // Whether a deletion goes now, with no wait for the budget.
    ready: () => gh.pacer.wait(true) === 0,
  };
}

/** Every pull request, in ascending number, limited to `only` when given; refuses a number that is not a pull request. */
async function pullsToVisit(tracker, repos, only) {
  const pulls = (await tracker.listPulls(repos.code)).sort((a, b) => a.number - b.number);
  if (!only) return pulls;
  const known = new Set(pulls.map((p) => p.number));
  const unknown = only.filter((n) => !known.has(n));
  if (unknown.length) throw new Error(`${repos.code} has no pull request ${unknown.join(", ")}`);
  return pulls.filter((p) => only.includes(p.number));
}

/** Reads a pull request and its whole conversation. */
async function readConversation(tracker, repos, number) {
  const pull = await tracker.getPull(repos.code, number);
  const comments = pull.comments ? await tracker.comments(repos.code, number) : [];
  const reviewComments = pull.review_comments ? await tracker.reviewComments(repos.code, number) : [];
  const reviews = await tracker.reviews(repos.code, number);
  return describePull(pull, { comments, reviewComments, reviews });
}

// ---------------------------------------------------------------------------
// Archive

/** The pull requests whose file the journal records as written at the given updated time. */
function archivedAt(journal) {
  const out = new Map();
  for (const r of journal.of("archive")) if (r.step === "written") out.set(r.pr, r.updatedAt);
  return out;
}

export async function runArchive({ tracker, repos, clone, journal, dryRun = false, only = null, log = () => {} }) {
  const pulls = await pullsToVisit(tracker, repos, only);
  const converted = clone.converted(pulls.map((p) => archivePath(p.number)));
  if (converted.length) throw new Error(`${clone.root} would store ${converted.length} archive files with line-end conversion (first ${converted[0]}); make "archive/** -text" cover all of ${ARCHIVE_DIR} first`);
  const written = archivedAt(journal);
  let pushed;
  const pushedCommit = () => (pushed ??= clone.fetchDefault().commit);
  const result = { pullRequests: pulls.length, written: 0, unchanged: 0, carried: [], comments: 0, reviewComments: 0, reviewsWithSummary: [], failed: [] };
  // A partial file left by an interrupted write was never renamed into place.
  const dir = path.join(clone.root, ARCHIVE_DIR);
  if (!dryRun && fs.existsSync(dir)) for (const name of fs.readdirSync(dir)) if (/^[.][0-9]+[.]md[.]partial$/.test(name)) fs.rmSync(path.join(dir, name));
  for (const listed of pulls) {
    const n = listed.number;
    const file = path.join(clone.root, ARCHIVE_DIR, `${n}.md`);
    // A rerun skips a pull request whose file it wrote while the pull request
    // has not changed since, and only while every committed copy is that same
    // file: a copy that differs may hold a comment the working file lacks.
    const committed = () => [clone.show(pushedCommit(), archivePath(n)), clone.show("HEAD", archivePath(n))].filter((t) => t !== null);
    if (!only && written.get(n) === listed.updated_at && fs.existsSync(file)) {
      try {
        const working = fs.readFileSync(file, "utf8");
        const kept = parseArchive(working, repos);
        if (kept.updatedAt === listed.updated_at && archiveProblems(kept).length === 0 && committed().every((t) => t === working)) {
          result.unchanged++;
          result.comments += kept.comments.length;
          result.reviewComments += kept.reviewComments.length;
          result.reviewsWithSummary.push(...withSummary(kept.reviews).map((r) => ({ pr: n, review: r.id })));
          continue;
        }
      } catch (error) {
        if (!(error instanceof ArchiveFormatError)) throw error;
      }
    }
    const live = await readConversation(tracker, repos, n);
    const problems = archiveProblems(live);
    if (problems.length) {
      // The conversation changed between reading the counts and the lists; a rerun reads it again.
      result.failed.push({ pr: n, problems });
      log(`#${n}: ${problems.join("; ")}`);
      continue;
    }
    // Every earlier copy of the file is read: the internal repository's
    // default branch as pushed, the clone's HEAD and the working file. The
    // pushed copy holds every comment the scrub has deleted, since the scrub
    // deletes only what that copy holds; the others may hold more. Each
    // comment no longer on the pull request is carried into the new file
    // from the first copy that holds it. A working file that does not read
    // back is left out, since files are renamed into place whole and only an
    // interrupted first write or a hand edit leaves one; a committed copy
    // that does not read back stops the pull request.
    const earlier = [];
    let unreadable = null;
    for (const [where, text] of [
      [`${repos.internal}'s ${ARCHIVE_DIR} on its default branch`, clone.show(pushedCommit(), archivePath(n))],
      [`the clone's HEAD`, clone.show("HEAD", archivePath(n))],
      [file, fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null],
    ]) {
      if (text === null) continue;
      try {
        earlier.push(parseArchive(text, repos));
      } catch (error) {
        if (!(error instanceof ArchiveFormatError)) throw error;
        if (where === file) log(`#${n}: replacing ${file}, which does not read back (${error.message})`);
        else unreadable = `the copy of ${archivePath(n)} in ${where} does not read back (${error.message}); repair it by hand before archiving it again`;
      }
    }
    if (unreadable) {
      result.failed.push({ pr: n, problems: [unreadable] });
      continue;
    }
    const { record, carried } = carryForward(live, earlier);
    if (carried) {
      result.carried.push({ pr: n, kept: carried });
      log(`#${n}: carried ${carried} comments the pull request no longer has from the earlier archive`);
    }
    const text = renderArchive(record, repos);
    if (!dryRun) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      // Written beside the file and renamed over it, so an interrupted write
      // leaves the earlier file whole.
      const partial = path.join(path.dirname(file), `.${n}.md.partial`);
      fs.writeFileSync(partial, text);
      fs.renameSync(partial, file);
      let back;
      try {
        back = parseArchive(fs.readFileSync(file, "utf8"), repos);
      } catch (error) {
        if (!(error instanceof ArchiveFormatError)) throw error;
        result.failed.push({ pr: n, problems: [`${file} does not read back: ${error.message}`] });
        continue;
      }
      if (!isDeepStrictEqual(back, record) || archiveProblems(back).length) {
        result.failed.push({ pr: n, problems: [`${file} does not read back as the conversation the API returned`] });
        continue;
      }
      journal.append({ mode: "archive", pr: n, step: "written", updatedAt: record.updatedAt, comments: record.comments.length, reviewComments: record.reviewComments.length, reviews: record.reviews.length });
    }
    result.written++;
    result.comments += record.comments.length;
    result.reviewComments += record.reviewComments.length;
    result.reviewsWithSummary.push(...withSummary(record.reviews).map((r) => ({ pr: n, review: r.id })));
    log(`#${n}: ${record.comments.length} comments, ${record.reviewComments.length} review comments, ${record.reviews.length} reviews`);
  }
  return { ...result, ...(dryRun ? { dryRun: true } : {}) };
}

// ---------------------------------------------------------------------------
// Scrub

/**
 * Why a pull request's live conversation may not be deleted against its
 * archive: the archive is missing, malformed or short, or a live comment is
 * not in it or has been edited since. An empty list means every live
 * comment is archived verbatim.
 */
export function scrubRefusals(archiveText, live, repos) {
  if (archiveText === null) return ["no archive on the internal repository's default branch"];
  let archived;
  try {
    archived = parseArchive(archiveText, repos);
  } catch (error) {
    if (!(error instanceof ArchiveFormatError)) throw error;
    return [`the archive does not read back: ${error.message}`];
  }
  if (archived.number !== live.number) return [`the archive is for pull request ${archived.number}`];
  const refusals = archiveProblems(archived).map((p) => `the archive is short: it ${p}`);
  for (const [list, what] of [["comments", "comment"], ["reviewComments", "review comment"]]) {
    const kept = new Map(archived[list].map((c) => [c.id, c]));
    for (const c of live[list]) {
      const copy = kept.get(c.id);
      if (!copy) refusals.push(`${what} ${c.id} is not in the archive`);
      else if (copy.body !== c.body) refusals.push(`${what} ${c.id} was edited after it was archived`);
    }
  }
  return refusals;
}

const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const TRANSIENT = /timed? ?out|ECONNRESET|connection reset|TLS handshake|unexpected EOF/i;

/**
 * Deletes one comment if it still reads as its archived text: "deleted",
 * "gone" when it was already gone, or "changed" when its text is not the
 * archived one. GitHub has no conditional deletion, so the comment is read
 * just before each attempt, after the pacer has made room for the read and
 * the deletion together. A deletion is made once per attempt with no retry
 * inside the client: after a rate limit, or a failure that may have taken
 * effect, the next attempt waits and reads the comment again first.
 */
async function deleteChecked(target, { tracker, sleep, log }) {
  for (let attempt = 0; ; attempt++) {
    try {
      await tracker.room?.();
      const now = await target.find();
      if (now === null) return attempt ? "deleted" : "gone";
      if ((now.body ?? "") !== target.archived) return "changed";
      // The read and the deletion fit the budget together, so this holds;
      // if it ever did not, the deletion would wait after the comparison,
      // so the attempt starts over with a new read instead.
      if (tracker.ready && !tracker.ready()) continue;
      await target.remove();
      return "deleted";
    } catch (error) {
      if (!(error instanceof GhError)) throw error;
      if (error.status === 404 || error.status === 410) return attempt ? "deleted" : "gone";
      const retry = error.limited || error.status >= 500 || (error.status === 0 && TRANSIENT.test(error.message));
      if (!retry || attempt >= 8) throw error;
      const wait = retryWait(error.limited, attempt);
      log(`${target.kind} ${target.id}: ${error.limited ? "rate limited" : "transient failure"}, reading it again in ${Math.round(wait / 1000)}s`);
      await sleep(wait);
    }
  }
}

export async function runScrub({ tracker, repos, clone, journal, dryRun = false, only = null, sleep = realSleep, log = () => {} }) {
  const { branch, commit } = clone.fetchDefault();
  const pulls = await pullsToVisit(tracker, repos, only);
  const result = { pullRequests: pulls.length, archive: { branch, commit }, scrubbed: 0, alreadyEmpty: 0, emptyWithoutArchive: [], deleted: { comments: 0, reviewComments: 0 }, reviewsWithSummary: [], refused: [], failed: [] };
  for (const { number: n } of pulls) {
    const text = clone.show(commit, archivePath(n));
    if (text === null) {
      // A pull request opened after the archive with nothing on it, such as
      // one opened once the switch is on, has nothing to lose.
      const pull = await tracker.getPull(repos.code, n);
      if (pull.comments === 0 && pull.review_comments === 0) {
        result.alreadyEmpty++;
        result.emptyWithoutArchive.push(n);
      } else result.refused.push({ pr: n, refusals: scrubRefusals(null) });
      continue;
    }
    const live = await readConversation(tracker, repos, n);
    const refusals = scrubRefusals(text, live, repos);
    // The live lists must match the live counts, or a comment the lists
    // missed would survive the scrub unarchived.
    refusals.push(...archiveProblems(live).map((p) => `the live conversation changed while it was read: the lists hold ${p.replace(/^holds /, "")}`));
    if (refusals.length) {
      result.refused.push({ pr: n, refusals });
      log(`#${n}: refused: ${refusals.join("; ")}`);
      continue;
    }
    result.reviewsWithSummary.push(...withSummary(live.reviews).map((r) => ({ pr: n, review: r.id })));
    if (!live.comments.length && !live.reviewComments.length) {
      result.alreadyEmpty++;
      continue;
    }
    if (dryRun) {
      result.deleted.comments += live.comments.length;
      result.deleted.reviewComments += live.reviewComments.length;
      result.scrubbed++;
      continue;
    }
    const archived = parseArchive(text, repos);
    const copies = Object.fromEntries(LISTS.map(({ list }) => [list, new Map(archived[list].map((c) => [c.id, c.body]))]));
    // Replies before the comments they answer, newest first.
    const targets = [
      ...[...live.reviewComments].reverse().map((c) => ({ list: "reviewComments", kind: "review comment", id: c.id, remove: () => tracker.deleteReviewComment(repos.code, c.id), find: () => tracker.findReviewComment(repos.code, c.id) })),
      ...[...live.comments].reverse().map((c) => ({ list: "comments", kind: "comment", id: c.id, remove: () => tracker.deleteComment(repos.code, c.id), find: () => tracker.findComment(repos.code, c.id) })),
    ];
    let changed = null;
    for (const t of targets) {
      // An edit made since the comparison above stops the pull request's
      // scrub instead of being deleted unarchived.
      const outcome = await deleteChecked({ ...t, archived: copies[t.list].get(t.id) }, { tracker, sleep, log });
      if (outcome === "changed") {
        changed = `${t.kind} ${t.id} changed after it was archived`;
        break;
      }
      journal.append({ mode: "scrub", pr: n, step: "deleted", kind: t.kind, id: t.id, ...(outcome === "gone" ? { alreadyGone: true } : {}) });
      result.deleted[t.list]++;
    }
    if (changed) {
      result.refused.push({ pr: n, refusals: [changed] });
      log(`#${n}: refused: ${changed}`);
      continue;
    }
    const after = await tracker.getPull(repos.code, n);
    if (after.comments !== 0 || after.review_comments !== 0) {
      result.failed.push({ pr: n, problems: [`reads back with ${after.comments} comments and ${after.review_comments} review comments`] });
      continue;
    }
    journal.append({ mode: "scrub", pr: n, step: "finished" });
    result.scrubbed++;
    log(`#${n}: deleted ${live.comments.length} comments and ${live.reviewComments.length} review comments`);
  }
  return { ...result, ...(dryRun ? { dryRun: true } : {}) };
}

// ---------------------------------------------------------------------------
// Command line

export function parseArgs(argv) {
  const opts = { mode: null, clone: null, dir: null, dryRun: false, only: null, perHour: 4500, writesPerMinute: 60, writesPerHour: 450 };
  const numeric = { "--requests-per-hour": "perHour", "--writes-per-minute": "writesPerMinute", "--writes-per-hour": "writesPerHour" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      if (i + 1 >= argv.length || argv[i + 1].startsWith("--")) throw new Error(`${arg} needs a value`);
      return argv[++i];
    };
    const mode = MODES.find((m) => arg === `--${m}`);
    if (mode) {
      if (opts.mode) throw new Error(`give one mode, not --${opts.mode} and ${arg}`);
      opts.mode = mode;
      opts.clone = value();
    } else if (arg === "--dir") opts.dir = value();
    else if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--only") {
      const list = value().split(",").map((s) => Number(s.trim()));
      if (!list.length || list.some((n) => !Number.isSafeInteger(n) || n < 1)) throw new Error(`${arg} takes pull request numbers separated by commas`);
      opts.only = [...new Set(list)];
    } else if (numeric[arg]) {
      const n = Number(value());
      if (!Number.isSafeInteger(n) || n < 1) throw new Error(`${arg} must be a positive integer`);
      opts[numeric[arg]] = n;
    } else throw new Error(`unknown argument ${arg}`);
  }
  if (!opts.mode) throw new Error(`give a mode: ${MODES.map((m) => `--${m} <clone of the internal repository>`).join(" or ")}`);
  if (!opts.dir) throw new Error(`--${opts.mode} needs --dir <attempt directory>`);
  opts.clone = path.resolve(opts.clone);
  // The scrub reads each comment and deletes it within one reservation of
  // two requests, so the hourly budget must hold two.
  if (opts.perHour < 2) throw new Error("--requests-per-hour must be at least 2");
  opts.dir = path.resolve(opts.dir);
  return opts;
}

export async function main(argv = process.argv.slice(2), { repos = readRepos(), tracker = null, clone = null, out = (s) => process.stdout.write(s), log = (s) => process.stderr.write(`${s}\n`) } = {}) {
  const opts = parseArgs(argv);
  checkPrivateDir(opts.dir);
  const pacer = new Pacer({ perHour: opts.perHour, writesPerMinute: opts.writesPerMinute, writesPerHour: opts.writesPerHour, log });
  tracker ??= pullTracker(ghClient({ pacer, log }));
  clone ??= cloneOf(opts.clone, repos);
  if (!opts.dryRun) fs.mkdirSync(opts.dir, { recursive: true });
  const journal = new Journal(path.join(opts.dir, "pull-requests.jsonl"));
  if (opts.dryRun) journal.append = (record) => record;
  const budgets = { perHour: opts.perHour, writesPerMinute: opts.writesPerMinute, writesPerHour: opts.writesPerHour };
  const args = { tracker, repos, clone, journal, dryRun: opts.dryRun, only: opts.only, log };
  const print = (value) => out(`${JSON.stringify(value, null, 2)}\n`);
  if (opts.mode === "archive") {
    const result = await runArchive(args);
    if (!opts.dryRun) writeJson(path.join(opts.dir, "archive-report.json"), result);
    print({ mode: "archive", ...result, reviewsWithSummary: result.reviewsWithSummary.length, requestsMade: pacer.total, next: result.failed.length ? "rerun --archive; it reads the failed pull requests again" : opts.dryRun ? "run --archive without --dry-run" : `commit and push ${ARCHIVE_DIR} in ${opts.clone}, then run --scrub` });
    return result.failed.length ? 1 : 0;
  }
  const result = await runScrub(args);
  if (!opts.dryRun) writeJson(path.join(opts.dir, "scrub-report.json"), result);
  const deletions = result.deleted.comments + result.deleted.reviewComments;
  print({
    mode: "scrub",
    ...result,
    reviewsWithSummary: result.reviewsWithSummary.length,
    ...(opts.dryRun ? { estimateHours: Number(estimateHours({ reads: pacer.total + deletions, writes: deletions }, budgets).toFixed(1)) } : {}),
    requestsMade: pacer.total,
    next: result.refused.length || result.failed.length ? "rerun --archive --only <the refused and failed numbers>, commit and push, then rerun --scrub" : "every pull request reads back with no comments and no review comments",
  });
  return result.refused.length || result.failed.length ? 1 : 0;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      process.stderr.write(`scrub-pull-requests: ${error.message}\n`);
      process.exit(2);
    },
  );
}
