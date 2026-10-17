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
// rerun keeps it and reports it under keptEarlier.
//
// Both modes take --dir <dir>, a private attempt directory outside any Git
// work tree, which holds the journal, pull-requests.jsonl. Every file
// written and every comment deleted is journaled, so a rerun of the same
// mode resumes: archive skips a pull request whose file it wrote while the
// pull request's updated time has not moved, and scrub reads the live
// comments again, so one already deleted is not deleted twice.
//
// The clone's origin must be the internal repository, so an archive is never
// written into a checkout of the public one, and archive/** must carry the
// attribute -text (in the clone's .gitattributes), so Git stores the bodies'
// line ends exactly as written.
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
import { GhError, Journal, Pacer, checkPrivateDir, estimateHours, ghClient, writeJson } from "./migrate-tracker.mjs";

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

/**
 * What makes an archive record incomplete: lists shorter or longer than the
 * counts the pull request reported. An empty list means the record is
 * complete.
 */
export function archiveProblems(record) {
  const problems = [];
  if (record.comments.length !== record.commentCount) problems.push(`holds ${record.comments.length} of ${record.commentCount} comments`);
  if (record.reviewComments.length !== record.reviewCommentCount) problems.push(`holds ${record.reviewComments.length} of ${record.reviewCommentCount} review comments`);
  return problems;
}

const archivePath = (n) => `${ARCHIVE_DIR}/${n}.md`;
const withSummary = (reviews) => reviews.filter((r) => r.body.trim() !== "");

// ---------------------------------------------------------------------------
// The internal repository's clone

/** True when a remote URL names the repository `slug` (owner/name), in any of Git's URL forms. */
export function remoteNames(url, slug) {
  const escaped = slug.replace(/[.*+?^${}()|[\]\x5c]/g, "\x5c$&");
  return new RegExp(`(?:^|[/:])${escaped}(?:[.]git)?/?$`, "i").test(url.trim().replace(/\x5c/g, "/"));
}

/**
 * Git operations on the clone the archive is written into. Refuses a clone
 * whose origin is not the internal repository and one where archive/** is
 * not stored verbatim.
 */
export function cloneOf(root, repos, run = (args) => spawnSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, windowsHide: true })) {
  const git = (args) => {
    const r = run(args);
    if (r.error) throw r.error;
    return r;
  };
  const ok = (args) => {
    const r = git(args);
    if (r.status !== 0) throw new Error(`git ${args.join(" ")} in ${root} failed: ${(r.stderr ?? "").trim().split("\n")[0]}`);
    return r.stdout;
  };
  const top = ok(["rev-parse", "--show-toplevel"]).trim();
  if (path.resolve(top).toLowerCase() !== path.resolve(root).toLowerCase()) throw new Error(`${root} is not the top of its clone (${top}); give the clone's root`);
  const origin = ok(["remote", "get-url", "origin"]).trim();
  if (!remoteNames(origin, repos.internal)) throw new Error(`${root}'s origin is ${origin}, not ${repos.internal}; the archive is written only into a clone of the internal repository`);
  const attribute = ok(["check-attr", "text", "--", `${ARCHIVE_DIR}/1.md`]).trim();
  if (!/: text: unset$/.test(attribute)) throw new Error(`${root} stores ${ARCHIVE_DIR} with line-end conversion (${attribute}); commit "archive/** -text" to its .gitattributes first`);
  return {
    root,
    /** Fetches the internal repository's default branch and returns the commit it points at. */
    fetchDefault() {
      const head = /^ref: refs\/heads\/(\S+)\s+HEAD$/m.exec(ok(["ls-remote", "--symref", "origin", "HEAD"]))?.[1];
      if (!head) throw new Error(`${repos.internal} reports no default branch`);
      ok(["fetch", "--quiet", "origin", `refs/heads/${head}`]);
      return { branch: head, commit: ok(["rev-parse", "FETCH_HEAD"]).trim() };
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
    findComment: (repo, id) => gone(() => gh.api("GET", `repos/${repo}/issues/comments/${id}`)),
    findReviewComment: (repo, id) => gone(() => gh.api("GET", `repos/${repo}/pulls/comments/${id}`)),
    deleteComment: (repo, id) => gh.api("DELETE", `repos/${repo}/issues/comments/${id}`),
    deleteReviewComment: (repo, id) => gh.api("DELETE", `repos/${repo}/pulls/comments/${id}`),
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
  const written = archivedAt(journal);
  const result = { pullRequests: pulls.length, written: 0, unchanged: 0, keptEarlier: [], comments: 0, reviewComments: 0, reviewsWithSummary: [], failed: [] };
  for (const listed of pulls) {
    const n = listed.number;
    const file = path.join(clone.root, ARCHIVE_DIR, `${n}.md`);
    if (!only && written.get(n) === listed.updated_at && fs.existsSync(file)) {
      try {
        const kept = parseArchive(fs.readFileSync(file, "utf8"), repos);
        if (kept.updatedAt === listed.updated_at && archiveProblems(kept).length === 0) {
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
    const record = await readConversation(tracker, repos, n);
    const problems = archiveProblems(record);
    if (problems.length) {
      // The conversation changed between reading the counts and the lists; a rerun reads it again.
      result.failed.push({ pr: n, problems });
      log(`#${n}: ${problems.join("; ")}`);
      continue;
    }
    // A file that holds a comment the pull request no longer has is the only
    // copy of that comment once the scrub has started, so it is never
    // replaced.
    if (fs.existsSync(file)) {
      let earlier;
      try {
        earlier = parseArchive(fs.readFileSync(file, "utf8"), repos);
      } catch (error) {
        if (!(error instanceof ArchiveFormatError)) throw error;
        result.failed.push({ pr: n, problems: [`${file} exists and does not read back (${error.message}); restore it from the internal repository's history before archiving it again`] });
        continue;
      }
      const gone = ["comments", "reviewComments"].reduce((sum, list) => {
        const live = new Set(record[list].map((c) => c.id));
        return sum + earlier[list].filter((c) => !live.has(c.id)).length;
      }, 0);
      if (gone) {
        result.keptEarlier.push({ pr: n, gone });
        log(`#${n}: kept the earlier archive, which holds ${gone} comments the pull request no longer has`);
        continue;
      }
    }
    const text = renderArchive(record, repos);
    if (!dryRun) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
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

/**
 * Deletes one comment and reports whether it was there. A deletion that
 * failed for a reason other than the comment being gone is checked against
 * the live comment, since the request may have taken effect.
 */
async function deleteOne(remove, find) {
  try {
    await remove();
    return true;
  } catch (error) {
    if (!(error instanceof GhError)) throw error;
    if (error.status === 404 || error.status === 410) return false;
    if ((await find()) === null) return true;
    throw error;
  }
}

export async function runScrub({ tracker, repos, clone, journal, dryRun = false, only = null, log = () => {} }) {
  const { branch, commit } = clone.fetchDefault();
  const pulls = await pullsToVisit(tracker, repos, only);
  const result = { pullRequests: pulls.length, archive: { branch, commit }, scrubbed: 0, alreadyEmpty: 0, deleted: { comments: 0, reviewComments: 0 }, reviewsWithSummary: [], refused: [], failed: [] };
  for (const { number: n } of pulls) {
    const text = clone.show(commit, archivePath(n));
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
    // Replies before the comments they answer, newest first.
    for (const c of [...live.reviewComments].reverse()) {
      const was = await deleteOne(() => tracker.deleteReviewComment(repos.code, c.id), () => tracker.findReviewComment(repos.code, c.id));
      journal.append({ mode: "scrub", pr: n, step: "deleted", kind: "review comment", id: c.id, ...(was ? {} : { alreadyGone: true }) });
      result.deleted.reviewComments++;
    }
    for (const c of [...live.comments].reverse()) {
      const was = await deleteOne(() => tracker.deleteComment(repos.code, c.id), () => tracker.findComment(repos.code, c.id));
      journal.append({ mode: "scrub", pr: n, step: "deleted", kind: "comment", id: c.id, ...(was ? {} : { alreadyGone: true }) });
      result.deleted.comments++;
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
    print({ mode: "archive", ...result, reviewsWithSummary: result.reviewsWithSummary.length, requestsMade: pacer.total, next: result.failed.length ? "rerun --archive; it reads the failed pull requests again" : `commit and push ${ARCHIVE_DIR} in ${opts.clone}, then run --scrub` });
    return result.failed.length ? 1 : 0;
  }
  const result = await runScrub(args);
  if (!opts.dryRun) writeJson(path.join(opts.dir, "scrub-report.json"), result);
  const deletions = result.deleted.comments + result.deleted.reviewComments;
  print({
    mode: "scrub",
    ...result,
    reviewsWithSummary: result.reviewsWithSummary.length,
    ...(opts.dryRun ? { estimateHours: Number(estimateHours({ reads: pacer.total, writes: deletions }, budgets).toFixed(1)) } : {}),
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
