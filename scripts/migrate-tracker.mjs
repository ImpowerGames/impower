// Moves every internal ticket from the code repository to the internal
// repository, both named in .agents/repos.json (#1961, #1966). The tool is
// resumable: every step it takes is journaled in a private attempt directory,
// and a rerun of the same mode against the same directory resumes after the
// last finished step.
//
//   --snapshot <dir>  record every issue not filed by an outsider (author
//                     association NONE): number, database id, state, state
//                     reason, closed time, type, labels, milestone, assignees,
//                     sub-issue parent and children, blocked-by, Project
//                     memberships with their Status, the organization issue
//                     fields (Effort, Priority), and the body and comments
//   --transfer        in ascending old number: append the migration line to
//                     the body (reopening a closed issue in the same edit),
//                     transfer it, then close it again on the internal
//                     repository with its original state reason
//   --restore         re-apply from the snapshot whatever transfer dropped
//   --rewrite         set every migrated body and comment to its original
//                     with bare #N references mapped, and rewrite the
//                     closing lines of open pull requests
//   --map             write migration/issue-map.json and read it back
//   --verify          compare the internal repository with the snapshot and
//                     exit non-zero on any difference
//   --rehearsal       create three test issues, run the pipeline on them,
//                     report what transfer kept and dropped, then delete them
//   --dry-run         on any mode: read, plan and report, write nothing
//
// Every mode after --snapshot takes --dir <dir>, the same attempt directory.
// A transfer finishes in the background (it moves comments and links and
// rewrites references in the text), so --restore, --rewrite and the
// rehearsal first wait --settle-seconds (120 by default) after the last
// transfer step.
// Issue data goes through REST (`gh api`, paginated), never through a GraphQL
// issue selection. Three operations have no REST form and go through gh's own
// commands: `gh issue transfer`, `gh issue delete` (rehearsal clean-up only)
// and `gh pr view --json closingIssuesReferences` (verify). The tool is not
// gated by the cutover switch: #1967 runs it inside the cutover window.
//
// Requests are paced under GitHub's limits: 4,500 requests an hour by
// default (the REST limit is 5,000), and content-creating requests at 60 a
// minute and 450 an hour (GitHub documents 80 and 500 as its secondary
// limits). A rate-limit or server error is retried with backoff.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { readRepos } from "../.agents/repos.mjs";

/** The organization Projects whose memberships the snapshot records. */
export const PROJECTS = [1, 5, 6, 8];
/** The API version the issue-field endpoints need. */
export const FIELDS_API_VERSION = "2026-03-10";
export const MAP_PATH = "migration/issue-map.json";

const MODES = ["snapshot", "transfer", "restore", "rewrite", "map", "verify", "rehearsal"];

// ---------------------------------------------------------------------------
// References in Markdown

// A fence opener once a line's blockquote markers are removed, allowing a
// list-item marker before it, and a closer, which is the marker alone: a
// line that starts a list item inside a fence is code, not its end.
const FENCE = /^[ \t]*(?:(?:[-*+]|\d{1,9}[.)])[ \t]+)?(`{3,}|~{3,})(.*)$/;
const FENCE_CLOSE = /^[ \t]*(`{3,}|~{3,})[ \t]*$/;

/** A line's blockquote depth (its leading `>` markers) and the text after them. */
function quoted(line) {
  let depth = 0;
  let i = 0;
  for (;;) {
    let j = i;
    while (line[j] === " " || line[j] === "\t") j++;
    if (line[j] !== ">") break;
    depth++;
    i = j + 1;
    if (line[i] === " " || line[i] === "\t") i++;
  }
  return { depth, rest: line.slice(i) };
}

/**
 * Splits Markdown into prose and code pieces, in order. Fenced blocks
 * (backtick or tilde, an unclosed fence running to the end of its
 * container), code spans (a backtick run closed by a run of the same length
 * within the paragraph) and <code> or <pre> elements are code; GitHub links
 * no reference inside them. A fence belongs to the blockquote depth it
 * opened at: only a marker at that depth closes it, and a line of lesser
 * depth ends the quote and the fence with it. Indented code blocks are not
 * recognised and read as prose.
 */
export function splitCode(text) {
  const pieces = [];
  const push = (code, s) => {
    if (!s) return;
    const last = pieces.at(-1);
    if (last && last.code === code) last.text += s;
    else pieces.push({ code, text: s });
  };
  let prose = "";
  let fence = null;
  for (const line of text.split(/(?<=\n)/)) {
    const { depth, rest } = quoted(line.replace(/\r?\n$/, ""));
    const m = rest.match(FENCE);
    if (fence && depth < fence.depth) fence = null;
    if (fence) {
      push(true, line);
      const close = rest.match(FENCE_CLOSE);
      if (depth === fence.depth && close && close[1][0] === fence.char && close[1].length >= fence.length) fence = null;
      continue;
    }
    if (m && !(m[1][0] === "`" && m[2].includes("`"))) {
      splitInline(prose, push);
      prose = "";
      fence = { char: m[1][0], length: m[1].length, depth };
      push(true, line);
      continue;
    }
    prose += line;
  }
  splitInline(prose, push);
  return pieces;
}

function splitInline(text, push) {
  let start = 0;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    // A backslash escapes the next character, so an escaped backtick opens nothing.
    if (c === "\x5c") {
      i += 2;
      continue;
    }
    if (c === "`") {
      let n = 1;
      while (text[i + n] === "`") n++;
      const close = spanCloser(text, i + n, n);
      if (close < 0) {
        i += n;
        continue;
      }
      push(false, text.slice(start, i));
      push(true, text.slice(i, close + n));
      i = start = close + n;
      continue;
    }
    if (c === "<") {
      const m = /^<(code|pre)\b[^>]*>/i.exec(text.slice(i, i + 200));
      const end = m ? text.toLowerCase().indexOf(`</${m[1].toLowerCase()}>`, i + m[0].length) : -1;
      if (end >= 0) {
        const stop = end + m[1].length + 3;
        push(false, text.slice(start, i));
        push(true, text.slice(i, stop));
        i = start = stop;
        continue;
      }
    }
    i++;
  }
  push(false, text.slice(start));
}

// A line that starts a new block, so no code span reaches into it from the
// line before: a blank line, a list item, a heading or a table row, after
// any blockquote markers.
const BLOCK_START = /^[ \t]*(?:>[ \t]?)*(?:[ \t]*\r?$|(?:[-*+]|\d{1,9}[.)])[ \t]|#{1,6}(?:[ \t]|\r?$)|\|)/;
const HEADING = /^[ \t]{0,3}(?:>[ \t]?)*#{1,6}(?:[ \t]|$)/;

/**
 * The offset of the run of exactly n backticks closing a span that opens
 * before `from`, or -1. A span stays within its block: it ends at a line
 * that starts a new block, and with the line of a heading.
 */
function spanCloser(text, from, n) {
  const re = /`+|\n/g;
  re.lastIndex = from;
  let lineStart = text.lastIndexOf("\n", from - 1) + 1;
  for (let m; (m = re.exec(text)); ) {
    if (m[0] === "\n") {
      if (HEADING.test(text.slice(lineStart, m.index))) return -1;
      lineStart = m.index + 1;
      const end = text.indexOf("\n", lineStart);
      if (BLOCK_START.test(text.slice(lineStart, end < 0 ? text.length : end))) return -1;
      continue;
    }
    if (m[0].length === n) return m.index;
  }
  return -1;
}

// A bare reference: `#N` not preceded by a word character and not followed
// by one, as GitHub links it, so `#216/#218`, `#1386–#1389` and `pre-#1061`
// are references (GitHub's renderer linked each of them in the corpus
// check). `owner/repo#N`, `word#N`, a URL fragment, an HTML entity
// (`&#12;`), `##12` and an escaped `\#12` are not bare references.
const BARE_REF = /(^|[^\w&#\x5c])#(\d+)(?!\w)/g;

// Link destinations are not references: a Markdown inline link's `](...)`
// (see inlineLinkEnd), a link reference definition's `[label]: destination`,
// and a URL written out (`https://host/?q=#12`). Bare references are not
// mapped inside them.
const LINK_DEFINITION_OR_URL = /^[ \t]{0,3}\[[^\]]+\]:[ \t]*\S+|(?:https?|ftp):\/\/[^\s<>]+/gm;

function mapProse(text, fn) {
  return splitCode(text ?? "").map((p) => (p.code ? p.text : fn(p.text))).join("");
}

/**
 * The end of an inline link's `(destination "title")` that starts at
 * `open` (the offset of its `(`), or -1 when none is there. The destination
 * is `<...>` or a run without spaces whose parentheses balance, a backslash
 * escaping the next character, as CommonMark has it.
 */
function inlineLinkEnd(text, open) {
  let i = open + 1;
  const space = () => {
    while (/\s/.test(text[i] ?? "")) i++;
  };
  space();
  if (text[i] === "<") {
    while (i < text.length && text[i] !== ">" && text[i] !== "\n") i += text[i] === "\x5c" ? 2 : 1;
    if (text[i] !== ">") return -1;
    i++;
  } else {
    let depth = 0;
    for (; i < text.length && !/\s/.test(text[i]); i++) {
      if (text[i] === "\x5c") i++;
      else if (text[i] === "(") depth++;
      else if (text[i] === ")") {
        if (depth === 0) break;
        depth--;
      }
    }
    if (depth !== 0) return -1;
  }
  space();
  const quote = { '"': '"', "'": "'", "(": ")" }[text[i]];
  if (quote) {
    for (i++; i < text.length && text[i] !== quote; i++) if (text[i] === "\x5c") i++;
    if (text[i] !== quote) return -1;
    i++;
    space();
  }
  return text[i] === ")" ? i + 1 : -1;
}

/** Applies fn to the parts of prose outside link destinations. */
function outsideLinks(prose, fn) {
  const ranges = [];
  for (let at = prose.indexOf("]("); at >= 0; at = prose.indexOf("](", at + 1)) {
    const end = inlineLinkEnd(prose, at + 1);
    if (end > 0) ranges.push([at, end]);
  }
  for (const m of prose.matchAll(LINK_DEFINITION_OR_URL)) ranges.push([m.index, m.index + m[0].length]);
  ranges.sort((a, b) => a[0] - b[0]);
  let out = "";
  let last = 0;
  for (const [start, end] of ranges) {
    if (end <= last) continue;
    const from = Math.max(start, last);
    out += fn(prose.slice(last, from)) + prose.slice(from, end);
    last = end;
  }
  return out + fn(prose.slice(last));
}

/** Rewrites every bare reference outside code and link destinations; resolve(n) returns the replacement text or null to leave it. */
export function rewriteBareRefs(text, resolve) {
  return mapProse(text, (prose) =>
    outsideLinks(prose, (part) =>
      part.replace(BARE_REF, (all, lead, n) => {
        const to = resolve(Number(n));
        return to === null || to === undefined ? all : lead + to;
      }),
    ),
  );
}

/** The numbers of the bare references outside code and link destinations, in order. */
export function bareRefs(text) {
  const out = [];
  mapProse(text, (prose) =>
    outsideLinks(prose, (part) => {
      for (const m of part.matchAll(BARE_REF)) out.push(Number(m[2]));
      return part;
    }),
  );
  return out;
}

// A closing keyword and the reference it closes: `#N`, `owner/repo#N` or an
// issue URL. GitHub accepts a colon after the keyword.
const CLOSING = /(^|[^\w])((?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)(?:[ \t]*:)?[ \t]+)(?:#(\d+)|([\w.-]+\/[\w.-]+)#(\d+)|https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/issues\/(\d+))(?![\w-])/gi;

function closingMatch(m) {
  if (m[3]) return { repo: null, number: Number(m[3]) };
  if (m[4]) return { repo: m[4], number: Number(m[5]) };
  return { repo: m[6], number: Number(m[7]) };
}

/** Rewrites closing references outside code; resolve({ repo, number }) returns the new reference or null. */
export function rewriteClosingRefs(text, resolve) {
  return mapProse(text, (prose) =>
    prose.replace(CLOSING, (...m) => {
      const to = resolve(closingMatch(m));
      return to === null || to === undefined ? m[0] : m[1] + m[2] + to;
    }),
  );
}

/** The closing references outside code, as { repo, number }; repo is null for a bare #N. */
export function closingRefs(text) {
  const out = [];
  for (const p of splitCode(text ?? "")) if (!p.code) for (const m of p.text.matchAll(CLOSING)) out.push(closingMatch(m));
  return out;
}

// ---------------------------------------------------------------------------
// Records

export const sameRepo = (a, b) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();

/** `owner/name` from an API URL such as a repository_url or parent_issue_url. */
export function repoOf(url) {
  return url?.match(/\/repos\/([^/]+\/[^/]+?)(?:\/issues\/\d+)?\/?$/)?.[1] ?? null;
}

/** `owner/name#N` for an issue API URL, or null. */
export function refOfUrl(url) {
  const m = url?.match(/\/repos\/([^/]+\/[^/]+)\/issues\/(\d+)\/?$/);
  return m ? `${m[1]}#${m[2]}` : null;
}

const refOf = (issue) => `${repoOf(issue.repository_url)}#${issue.number}`;

export function splitRef(ref) {
  const i = ref.lastIndexOf("#");
  return { repo: ref.slice(0, i), number: Number(ref.slice(i + 1)) };
}

// Issue-field types whose value is one string or number, which restore can
// send back as it was read. Any other type stops the snapshot.
const FIELD_TYPES = new Set(["single_select", "date", "text", "number"]);

function fieldValues(values) {
  return (values ?? [])
    .map((v) => {
      if (v.data_type && !FIELD_TYPES.has(v.data_type)) throw new Error(`issue field ${v.issue_field_name} has type ${v.data_type}, which the snapshot cannot record and restore`);
      return { name: v.issue_field_name, fieldId: v.issue_field_id, value: v.single_select_option?.name ?? v.value ?? null };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** A comment as the snapshot keeps it; transfer changes its id but keeps its time, author and order. */
const describeComment = (c) => ({ id: c.id, createdAt: c.created_at, author: c.user?.login ?? null, body: c.body ?? "" });

/** Comments of one issue in thread order. */
const threadOrder = (comments) => [...comments].sort((a, b) => (a.created_at === b.created_at ? a.id - b.id : a.created_at < b.created_at ? -1 : 1));

/** The issue number a comment belongs to, from its issue_url. */
const commentIssue = (c) => Number(c.issue_url?.match(/\/issues\/(\d+)$/)?.[1]);

/** Comments of the given issues, read repository-wide when there are many: issue number to its thread. */
async function gatherThreads(tracker, repo, numbers) {
  const wanted = new Set(numbers);
  const comments = wanted.size > 20 ? await tracker.repoComments(repo) : (await Promise.all([...wanted].map((n) => tracker.issueComments(repo, n)))).flat();
  const threads = new Map([...wanted].map((n) => [n, []]));
  for (const c of comments) if (wanted.has(commentIssue(c))) threads.get(commentIssue(c)).push(c);
  for (const [n, list] of threads) threads.set(n, threadOrder(list));
  return threads;
}

/** The record the snapshot keeps for one issue; links and comments come from the caller. */
export function describeIssue(issue, { children = [], blockedBy = [], projects = [], thread = null } = {}) {
  return {
    number: issue.number,
    id: issue.id,
    title: issue.title,
    state: issue.state,
    stateReason: issue.state_reason ?? null,
    closedAt: issue.closed_at ?? null,
    createdAt: issue.created_at ?? null,
    author: issue.user?.login ?? null,
    authorAssociation: issue.author_association ?? null,
    type: issue.type?.name ?? null,
    labels: (issue.labels ?? []).map((l) => (typeof l === "string" ? l : l.name)).sort(),
    milestone: issue.milestone?.title ?? null,
    assignees: (issue.assignees ?? []).map((a) => a.login).sort(),
    parent: refOfUrl(issue.parent_issue_url),
    children: [...children].sort(),
    blockedBy: [...blockedBy].sort((a, b) => a.ref.localeCompare(b.ref)),
    projects: [...projects].sort((a, b) => a.project - b.project),
    fields: fieldValues(issue.issue_field_values),
    comments: issue.comments ?? 0,
    body: issue.body ?? "",
    ...(thread ? { thread: thread.map(describeComment) } : {}),
  };
}

/**
 * Reads sub-issue children and blockers for the issues whose summaries say
 * they have any, or that `expect(number)` says should: a transfer moves
 * links in the background, and a summary read during it can lag the links.
 */
async function gatherLinks(tracker, repo, issues, expect = () => ({})) {
  const links = new Map();
  for (const issue of issues) {
    const want = expect(issue.number);
    const children = want.children || issue.sub_issues_summary?.total > 0 ? (await tracker.subIssues(repo, issue.number)).map(refOf) : [];
    const blockers = want.blockedBy || issue.issue_dependencies_summary?.total_blocked_by > 0 ? await tracker.blockedBy(repo, issue.number) : [];
    links.set(issue.number, { children, blockedBy: blockers.map((b) => ({ ref: refOf(b), id: b.id })) });
  }
  return links;
}

const optionName = (o) => (typeof o?.name === "object" && o.name ? o.name.raw : o?.name) ?? null;

/** Reads the Projects' Status fields and every item that belongs to an issue of the repository. */
async function gatherProjects(tracker, repo) {
  const meta = [];
  const byIssue = new Map();
  for (const project of PROJECTS) {
    const fields = await tracker.projectFields(project);
    const status = fields.find((f) => f.name === "Status" && f.data_type === "single_select") ?? null;
    meta.push({ number: project, statusFieldId: status?.id ?? null, options: Object.fromEntries((status?.options ?? []).map((o) => [optionName(o), o.id])) });
    for (const item of await tracker.projectItems(project, status ? [status.id] : [])) {
      if (item.content_type !== "Issue" || !sameRepo(repoOf(item.content?.repository_url), repo)) continue;
      const value = item.fields?.find((f) => f.id === status?.id)?.value;
      const entry = { project, itemId: item.id, status: value ? optionName(value) : null, archived: Boolean(item.archived_at) };
      const list = byIssue.get(item.content.number) ?? [];
      list.push(entry);
      byIssue.set(item.content.number, list);
    }
  }
  return { meta, byIssue };
}

/**
 * Reads the code repository. Every issue whose author association is NONE
 * was filed by an outsider and is kept public; every other issue is
 * recorded for migration, with its body and comments, which the rewrite
 * works from: a transfer rewrites bare references itself, so the text on
 * the internal repository no longer says which were bare. `only` limits the
 * snapshot to the given numbers (the rehearsal's test issues).
 */
export async function takeSnapshot(tracker, repos, { only = null, kind = "migration", pullRequests = null, log = () => {} } = {}) {
  log(`reading ${only ? `${only.length} issues` : "every issue and pull request"} of ${repos.code}`);
  const all = only ? await Promise.all(only.map((n) => tracker.getIssue(repos.code, n))) : await tracker.listIssues(repos.code);
  const issues = all.filter((i) => !i.pull_request).sort((a, b) => a.number - b.number);
  const kept = issues.filter((i) => i.author_association === "NONE");
  const moving = issues.filter((i) => i.author_association !== "NONE");
  log(`reading sub-issues and dependencies of ${moving.length} issues`);
  const links = await gatherLinks(tracker, repos.code, moving);
  log(`reading Projects ${PROJECTS.join(", ")}`);
  const projects = await gatherProjects(tracker, repos.code);
  log("reading comments");
  const threads = await gatherThreads(tracker, repos.code, moving.map((i) => i.number));
  const labels = (await tracker.labels(repos.code)).map((l) => ({ name: l.name, color: l.color, description: l.description ?? "" }));
  const milestones = (await tracker.milestones(repos.code)).map((m) => ({ number: m.number, title: m.title, state: m.state, description: m.description ?? "", dueOn: m.due_on ?? null }));
  return {
    version: 1,
    kind,
    takenAt: new Date().toISOString(),
    code: repos.code,
    internal: repos.internal,
    issues: moving.map((i) => describeIssue(i, { ...links.get(i.number), projects: projects.byIssue.get(i.number) ?? [], thread: threads.get(i.number) })),
    kept: kept.map((i) => i.number),
    pullRequests: pullRequests ?? all.filter((i) => i.pull_request).map((p) => ({ number: p.number, state: p.state })).sort((a, b) => a.number - b.number),
    labels,
    milestones,
    projects: projects.meta,
  };
}

const tally = (items, key) => {
  const out = {};
  for (const item of items) {
    const k = key(item) ?? "(none)";
    out[k] = (out[k] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
};

/** The counts a snapshot report prints. */
export function summarize(snapshot) {
  const issues = snapshot.issues;
  return {
    kind: snapshot.kind,
    migrate: issues.length,
    keep: snapshot.kept.length,
    keptNumbers: snapshot.kept,
    byState: tally(issues, (i) => i.state),
    byStateReason: tally(issues, (i) => (i.state === "closed" ? i.stateReason ?? "completed" : null)),
    byType: tally(issues, (i) => i.type),
    byStateAndType: tally(issues, (i) => `${i.state} ${i.type ?? "(none)"}`),
    pullRequests: snapshot.pullRequests.length,
    withParent: issues.filter((i) => i.parent).length,
    withSubIssues: issues.filter((i) => i.children.length).length,
    blocked: issues.filter((i) => i.blockedBy.length).length,
    inProjects: Object.fromEntries(PROJECTS.map((p) => [p, issues.filter((i) => i.projects.some((m) => m.project === p)).length])),
    withFields: tally(issues.flatMap((i) => i.fields), (f) => f.name),
    comments: issues.reduce((sum, i) => sum + (i.thread?.length ?? 0), 0),
    textsWithBareReferences: issues.reduce((sum, i) => sum + [i.body, ...(i.thread ?? []).map((c) => c.body)].filter((t) => bareRefs(t).length).length, 0),
    labels: snapshot.labels.length,
    milestones: snapshot.milestones.length,
  };
}

// ---------------------------------------------------------------------------
// Journal

/**
 * An append-only JSON-lines journal. A crash can leave a partial last line,
 * which is ignored; the modes check live state before repeating a step, so
 * a step whose record was lost is recognised rather than repeated.
 */
export class Journal {
  constructor(file) {
    this.file = file;
    this.records = [];
    // A partial last line has no line end; the next record starts on a line
    // of its own instead of being joined to it.
    this.openLine = false;
    if (fs.existsSync(file)) {
      const text = fs.readFileSync(file, "utf8");
      this.openLine = text.length > 0 && !text.endsWith("\n");
      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        try {
          this.records.push(JSON.parse(line));
        } catch {
          // A partial line from an interrupted write.
        }
      }
    }
  }

  append(record) {
    const entry = { at: new Date().toISOString(), ...record };
    fs.appendFileSync(this.file, `${this.openLine ? "\n" : ""}${JSON.stringify(entry)}\n`);
    this.openLine = false;
    this.records.push(entry);
    return entry;
  }

  of(mode) {
    return this.records.filter((r) => r.mode === mode);
  }
}

/** Old number to { new, reopened, finished } from the transfer records. */
export function transferState(journal) {
  const state = new Map();
  for (const r of journal.of("transfer")) {
    const s = state.get(r.old) ?? {};
    if (r.step === "reopened") s.reopened = true;
    if (r.new) s.new = r.new;
    if (r.step === "finished") s.finished = true;
    state.set(r.old, s);
  }
  return state;
}

/**
 * The transfer map, refusing while any snapshot issue lacks a new number:
 * a link or reference to an issue still on the code repository would be
 * restored or rewritten to the wrong place and never revisited.
 */
export function requireTransferred(snapshot, journal, mode) {
  const map = transferMap(journal);
  const missing = snapshot.issues.filter((i) => !map.has(i.number)).map((i) => i.number);
  if (missing.length) throw new Error(`${mode} needs every snapshot issue transferred; ${missing.length} are not (first ${missing.slice(0, 10).join(", ")}); finish --transfer first`);
  return map;
}

/** Old number to new number for every transferred issue. */
export function transferMap(journal) {
  const map = new Map();
  for (const [old, s] of transferState(journal)) if (s.new) map.set(old, s.new);
  return map;
}

// ---------------------------------------------------------------------------
// Pacing and the gh client

const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sliding-window budgets: every request counts against the hourly budget,
 * and content-creating requests also against the per-minute and hourly
 * write budgets. take() waits until the request fits.
 */
export class Pacer {
  constructor({ perHour = 4500, writesPerMinute = 60, writesPerHour = 450, now = Date.now, sleep = realSleep, log = () => {} } = {}) {
    Object.assign(this, { perHour, writesPerMinute, writesPerHour, now, sleep, log });
    this.requests = [];
    this.writes = [];
    this.total = 0;
    this.totalWrites = 0;
  }

  wait(write) {
    const t = this.now();
    this.requests = this.requests.filter((s) => s > t - 3600e3);
    this.writes = this.writes.filter((s) => s > t - 3600e3);
    const waits = [0];
    if (this.requests.length >= this.perHour) waits.push(this.requests[this.requests.length - this.perHour] + 3600e3 - t);
    if (write) {
      if (this.writes.length >= this.writesPerHour) waits.push(this.writes[this.writes.length - this.writesPerHour] + 3600e3 - t);
      const minute = this.writes.filter((s) => s > t - 60e3);
      if (minute.length >= this.writesPerMinute) waits.push(minute[minute.length - this.writesPerMinute] + 60e3 - t);
    }
    return Math.max(...waits);
  }

  async take(write = false) {
    for (let wait = this.wait(write); wait > 0; wait = this.wait(write)) {
      if (wait > 5000) this.log(`pacing: waiting ${Math.ceil(wait / 1000)}s for the ${write ? "write" : "request"} budget`);
      await this.sleep(wait);
    }
    this.record(1, write);
  }

  /** Counts requests made without waiting, such as the later pages of a paginated read. */
  record(count, write = false) {
    const t = this.now();
    for (let i = 0; i < count; i++) {
      this.requests.push(t);
      if (write) this.writes.push(t);
    }
    this.total += count;
    if (write) this.totalWrites += count;
  }
}

/** Hours the given numbers of reads and writes take at least under the pacer's budgets. */
export function estimateHours({ reads, writes }, { perHour = 4500, writesPerMinute = 60, writesPerHour = 450 } = {}) {
  return Math.max((reads + writes) / perHour, writes / writesPerHour, writes / (writesPerMinute * 60));
}

export class GhError extends Error {
  constructor(args, status, text) {
    super(`gh ${args.join(" ")} failed${status ? ` (HTTP ${status})` : ""}: ${text.trim().split("\n").slice(0, 3).join(" ")}`);
    this.status = status;
  }
}

function runGh(args, input) {
  const r = spawnSync("gh", args, { input, encoding: "utf8", maxBuffer: 512 * 1024 * 1024, windowsHide: true });
  if (r.error) throw r.error;
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/**
 * Calls gh with pacing and retries. A rate-limit refusal (REST 403 or 429,
 * or GraphQL's "submitted too quickly") rejected the request, so any request
 * is retried after it. A server error or a broken connection may have
 * followed a request that took effect, so only an idempotent one (a read,
 * PATCH or PUT) is retried after it; a POST, a transfer or a deletion throws,
 * and the mode's own live-state checks decide on the rerun.
 */
export function ghClient({ pacer = new Pacer(), run = runGh, sleep = realSleep, log = () => {} } = {}) {
  async function call(args, { write = false, idempotent = !write, input } = {}) {
    for (let attempt = 0; ; attempt++) {
      await pacer.take(write);
      const r = run(args, input);
      if (r.status === 0) return r.stdout;
      const text = `${r.stderr}\n${r.stdout}`;
      const status = Number(text.match(/HTTP (\d{3})/)?.[1] ?? 0);
      const limited = ((status === 403 || status === 429) && /rate limit|abuse|secondary/i.test(text)) || /submitted too quickly|secondary rate limit/i.test(text);
      const transient = idempotent && (status >= 500 || /timed? ?out|ECONNRESET|connection reset|TLS handshake|unexpected EOF/i.test(text));
      if ((limited || transient) && attempt < 8) {
        const wait = limited ? Math.min(900e3, 60e3 * 2 ** attempt) : Math.min(120e3, 5e3 * 2 ** attempt);
        log(`gh ${args.slice(0, 4).join(" ")}: ${limited ? "rate limited" : "transient failure"}, retrying in ${Math.round(wait / 1000)}s`);
        await sleep(wait);
        continue;
      }
      throw new GhError(args, status, text);
    }
  }
  const parse = (s) => (s.trim() ? JSON.parse(s) : null);
  const headerArgs = (headers) => headers.flatMap((h) => ["-H", h]);
  return {
    pacer,
    async api(method, endpoint, body, headers = []) {
      const args = ["api", "-X", method, endpoint, ...headerArgs(headers), ...(body === undefined ? [] : ["--input", "-"])];
      return parse(await call(args, { write: method !== "GET", idempotent: ["GET", "PATCH", "PUT"].includes(method), input: body === undefined ? undefined : JSON.stringify(body) }));
    },
    async list(endpoint, headers = []) {
      const pages = parse(await call(["api", "--paginate", "--slurp", endpoint, ...headerArgs(headers)])) ?? [];
      pacer.record(Math.max(0, pages.length - 1));
      return pages.flat();
    },
    async command(args, { write = true } = {}) {
      return call(args, { write, idempotent: !write });
    },
  };
}

/**
 * Every GitHub operation the modes use, in one place. All of them are REST
 * calls except transferIssue, deleteIssue and closingRefs, which have no
 * REST form.
 */
export function restTracker(gh, repos) {
  const org = repos.code.split("/")[0];
  const version = [`X-GitHub-Api-Version: ${FIELDS_API_VERSION}`];
  const gone = async (fn) => {
    try {
      return await fn();
    } catch (error) {
      if (error.status === 404 || error.status === 410) return null;
      throw error;
    }
  };
  return {
    getRepo: (repo) => gone(() => gh.api("GET", `repos/${repo}`)),
    currentUser: () => gh.api("GET", "user"),
    listIssues: (repo) => gh.list(`repos/${repo}/issues?state=all&per_page=100`),
    issuesSince: (repo, since) => gh.list(`repos/${repo}/issues?state=all&per_page=100&since=${encodeURIComponent(since)}`),
    // A transferred issue's old address redirects to its new one, which gh follows.
    getIssue: (repo, n) => gh.api("GET", `repos/${repo}/issues/${n}`),
    findIssue: (repo, n) => gone(() => gh.api("GET", `repos/${repo}/issues/${n}`)),
    createIssue: (repo, fields) => gh.api("POST", `repos/${repo}/issues`, fields),
    updateIssue: (repo, n, fields) => gh.api("PATCH", `repos/${repo}/issues/${n}`, fields),
    async transferIssue(repo, n, dest) {
      const out = await gh.command(["issue", "transfer", String(n), dest, "-R", repo]);
      const number = Number(out.trim().match(/\/issues\/(\d+)\s*$/)?.[1]);
      if (!number) throw new Error(`gh issue transfer ${n} printed no issue URL: ${out.trim()}`);
      return { number };
    },
    deleteIssue: (repo, n) => gh.command(["issue", "delete", String(n), "-R", repo, "--yes"]),
    subIssues: (repo, n) => gh.list(`repos/${repo}/issues/${n}/sub_issues?per_page=100`),
    addSubIssue: (repo, parent, childId, replaceParent = false) => gh.api("POST", `repos/${repo}/issues/${parent}/sub_issues`, { sub_issue_id: childId, ...(replaceParent ? { replace_parent: true } : {}) }),
    blockedBy: (repo, n) => gh.list(`repos/${repo}/issues/${n}/dependencies/blocked_by?per_page=100`),
    addBlockedBy: (repo, n, blockerId) => gh.api("POST", `repos/${repo}/issues/${n}/dependencies/blocked_by`, { issue_id: blockerId }),
    orgIssueFields: () => gh.api("GET", `orgs/${org}/issue-fields`, undefined, version),
    setIssueFields: (repo, n, values) => gh.api("POST", `repos/${repo}/issues/${n}/issue-field-values`, { issue_field_values: values }, version),
    projectFields: (p) => gh.list(`orgs/${org}/projectsV2/${p}/fields?per_page=100`),
    projectItems: (p, fieldIds) => gh.list(`orgs/${org}/projectsV2/${p}/items?per_page=100${fieldIds.length ? `&fields=${fieldIds.join(",")}` : ""}`),
    addProjectItem: (p, issueId) => gh.api("POST", `orgs/${org}/projectsV2/${p}/items`, { type: "Issue", id: issueId }),
    setProjectItemField: (p, itemId, fieldId, value) => gh.api("PATCH", `orgs/${org}/projectsV2/${p}/items/${itemId}`, { fields: [{ id: fieldId, value }] }),
    labels: (repo) => gh.list(`repos/${repo}/labels?per_page=100`),
    createLabel: (repo, label) => gh.api("POST", `repos/${repo}/labels`, label),
    milestones: (repo) => gh.list(`repos/${repo}/milestones?state=all&per_page=100`),
    createMilestone: (repo, milestone) => gh.api("POST", `repos/${repo}/milestones`, milestone),
    repoComments: (repo) => gh.list(`repos/${repo}/issues/comments?per_page=100`),
    issueComments: (repo, n) => gh.list(`repos/${repo}/issues/${n}/comments?per_page=100`),
    createComment: (repo, n, body) => gh.api("POST", `repos/${repo}/issues/${n}/comments`, { body }),
    updateComment: (repo, id, body) => gh.api("PATCH", `repos/${repo}/issues/comments/${id}`, { body }),
    openPulls: (repo) => gh.list(`repos/${repo}/pulls?state=open&per_page=100`),
    latestPull: async (repo) => (await gh.api("GET", `repos/${repo}/pulls?state=closed&per_page=1`))?.[0] ?? null,
    updatePull: (repo, n, body) => gh.api("PATCH", `repos/${repo}/pulls/${n}`, { body }),
    async closingRefs(repo, n) {
      const out = JSON.parse(await gh.command(["pr", "view", String(n), "-R", repo, "--json", "closingIssuesReferences"], { write: false }));
      return (out.closingIssuesReferences ?? []).map((r) => ({ repo: `${r.repository.owner.login}/${r.repository.name}`, number: r.number }));
    },
    getFile: (repo, file) => gone(() => gh.api("GET", `repos/${repo}/contents/${file}`)),
    putFile: (repo, file, fields) => gh.api("PUT", `repos/${repo}/contents/${file}`, fields),
  };
}

// ---------------------------------------------------------------------------
// Transfer

export function migrationLine(repos, issue) {
  return issue.state === "closed" && issue.closedAt
    ? `Migrated from ${repos.code}#${issue.number}; originally closed ${issue.closedAt.slice(0, 10)}`
    : `Migrated from ${repos.code}#${issue.number}`;
}

const hasLine = (body, line) => (body ?? "").split(/\r?\n/).some((l) => l.trim() === line);

export function withMigrationLine(body, line) {
  const text = (body ?? "").replace(/\s+$/, "");
  return text ? `${text}\n\n${line}` : line;
}

/** Writes and reads each transfer step takes, for the dry-run estimate. */
function transferCost(issue) {
  return issue.state === "closed" ? { reads: 2, writes: 3 } : { reads: 1, writes: 2 };
}

/**
 * Transfers every snapshot issue in ascending old number and stops at the
 * first failure, so new numbers stay in the old order and a rerun resumes
 * at the issue that failed. The migration line goes onto the body before
 * the transfer, in the same edit that reopens a closed issue: the transfer
 * rewrites the body in the background, and on an issue with links, Project
 * items or comments that rewrite can land after, and undo, an edit made
 * just after the transfer. After it only the state changes. Before each
 * step the live state is read, so a step whose journal record was lost is
 * not repeated.
 */
export async function runTransfer({ tracker, repos, snapshot, journal, dryRun = false, log = () => {} }) {
  const order = [...snapshot.issues].sort((a, b) => a.number - b.number);
  const state = transferState(journal);
  const pending = order.filter((i) => !state.get(i.number)?.finished);
  const cost = pending.reduce((sum, i) => ({ reads: sum.reads + transferCost(i).reads, writes: sum.writes + transferCost(i).writes }), { reads: 0, writes: 0 });
  const summary = {
    issues: order.length,
    finished: order.length - pending.length,
    pending: pending.length,
    reopenAndClose: pending.filter((i) => i.state === "closed").length,
    first: pending[0]?.number ?? null,
    last: pending.at(-1)?.number ?? null,
    requests: cost,
  };
  if (dryRun) return { ...summary, dryRun: true };
  for (const issue of pending) {
    const old = issue.number;
    let target = state.get(old)?.new;
    if (!target) {
      const live = await tracker.getIssue(repos.code, old);
      if (sameRepo(repoOf(live.repository_url), repos.internal)) {
        target = live.number;
        journal.append({ mode: "transfer", old, step: "transferred", new: target, recovered: true });
      } else {
        if (live.state === "closed" && issue.state !== "closed") throw new Error(`${repos.code}#${old} was open in the snapshot and is closed now; take a fresh snapshot`);
        const line = migrationLine(repos, issue);
        const prepare = {};
        if (!hasLine(live.body, line)) prepare.body = withMigrationLine(live.body, line);
        if (live.state === "closed") prepare.state = "open";
        if (Object.keys(prepare).length) {
          await tracker.updateIssue(repos.code, old, prepare);
          journal.append({ mode: "transfer", old, step: prepare.state ? "reopened" : "annotated" });
        }
        target = (await tracker.transferIssue(repos.code, old, repos.internal)).number;
        journal.append({ mode: "transfer", old, step: "transferred", new: target });
      }
    }
    if (issue.state === "closed") {
      let current = await tracker.getIssue(repos.internal, target);
      if (current.state !== "closed" || normalReason(current) !== normalReason(issue)) {
        // GitHub applies a state reason only when the state changes, so a
        // closed issue with the wrong reason is reopened and closed again.
        if (current.state === "closed") await tracker.updateIssue(repos.internal, target, { state: "open" });
        current = await tracker.updateIssue(repos.internal, target, { state: "closed", state_reason: issue.stateReason ?? "completed" });
      }
      if (current?.state !== "closed" || normalReason(current) !== normalReason(issue)) {
        throw new Error(`${repos.internal}#${target} is ${current?.state} (${current?.state_reason}) after closing it as ${normalReason(issue)}; not marking ${repos.code}#${old} finished`);
      }
    }
    journal.append({ mode: "transfer", old, step: "finished", new: target });
    log(`${repos.code}#${old} -> ${repos.internal}#${target}`);
  }
  return { ...summary, finished: order.length, pending: 0 };
}

/** A closed issue without a reason was closed as completed; an open one has none. */
function normalReason(issue) {
  const reason = issue.stateReason !== undefined ? issue.stateReason : issue.state_reason;
  return issue.state === "closed" ? reason ?? "completed" : null;
}

// ---------------------------------------------------------------------------
// The internal repository against the snapshot

/** The snapshot's ref translated into the internal repository where the issue moved. */
function translator(repos, map) {
  return (ref) => {
    if (!ref) return ref;
    const { repo, number } = splitRef(ref);
    return sameRepo(repo, repos.code) && map.has(number) ? `${repos.internal}#${map.get(number)}` : ref;
  };
}

const projectKey = (m) => `${m.project}:${m.status ?? ""}${m.archived ? ":archived" : ""}`;
const fieldKey = (f) => `${f.name}=${f.value ?? ""}`;

/** The comparable form of a record: every field the snapshot promises, refs in internal space. */
export function comparable(record, translate = (r) => r) {
  return {
    title: record.title,
    author: record.author,
    createdAt: record.createdAt,
    state: record.state,
    stateReason: normalReason(record),
    type: record.type,
    labels: [...record.labels].sort(),
    milestone: record.milestone,
    assignees: [...record.assignees].sort(),
    parent: translate(record.parent) ?? null,
    children: record.children.map(translate).sort(),
    blockedBy: record.blockedBy.map((b) => translate(b.ref)).sort(),
    projects: record.projects.map(projectKey).sort(),
    fields: record.fields.map(fieldKey).sort(),
    comments: record.comments,
  };
}

/** Field-by-field differences between the expected and the actual comparable records. */
export function diffRecords(expected, actual) {
  const out = [];
  for (const field of Object.keys(expected)) {
    if (!isDeepStrictEqual(expected[field], actual[field])) out.push({ field, expected: expected[field], actual: actual[field] });
  }
  return out;
}

/** Reads the migrated issues on the internal repository: old number to { issue, record }. */
/**
 * Reads the migrated issues on the internal repository: old number to
 * { issue, record, thread }. `links` reads sub-issues, dependencies and
 * Project items; `threads` reads comments.
 */
export async function gatherInternal(tracker, repos, snapshot, map, { links: withLinks = true, threads: withThreads = false } = {}) {
  const wanted = new Set(snapshot.issues.map((i) => map.get(i.number)).filter(Boolean));
  const raw = wanted.size > 20 ? (await tracker.listIssues(repos.internal)).filter((i) => !i.pull_request && wanted.has(i.number)) : (await Promise.all([...wanted].map((n) => tracker.findIssue(repos.internal, n)))).filter(Boolean);
  const oldOf = new Map(snapshot.issues.filter((i) => map.has(i.number)).map((i) => [map.get(i.number), i]));
  const expect = (n) => ({ children: oldOf.get(n)?.children.length > 0, blockedBy: oldOf.get(n)?.blockedBy.length > 0 });
  const links = withLinks ? await gatherLinks(tracker, repos.internal, raw, expect) : new Map();
  const projects = withLinks ? await gatherProjects(tracker, repos.internal) : { meta: [], byIssue: new Map() };
  const threads = withThreads ? await gatherThreads(tracker, repos.internal, raw.map((i) => i.number)) : new Map();
  const byNew = new Map(raw.map((i) => [i.number, i]));
  const out = new Map();
  for (const issue of snapshot.issues) {
    const fresh = byNew.get(map.get(issue.number));
    if (!fresh) continue;
    out.set(issue.number, { issue: fresh, record: describeIssue(fresh, { ...links.get(fresh.number), projects: projects.byIssue.get(fresh.number) ?? [] }), thread: threads.get(fresh.number) ?? null });
  }
  return { byOld: out, projectMeta: projects.meta };
}

/**
 * Waits until `settleMs` has passed since the last transfer step: a
 * transfer moves comments, links and Project items and rewrites the body in
 * the background, and a restore or rewrite that runs during it would read,
 * or be undone by, a half-moved issue.
 */
export async function awaitSettle(journal, settleMs, { now = Date.now, sleep = realSleep, log = () => {} } = {}) {
  const last = journal.of("transfer").at(-1);
  if (!last || settleMs <= 0) return;
  const wait = Date.parse(last.at) + settleMs - now();
  if (wait <= 0) return;
  log(`waiting ${Math.ceil(wait / 1000)}s for the last transfer to settle`);
  await sleep(wait);
}

/** Per issue, the fields that differ from the snapshot. */
export function survival(snapshot, current, repos, map) {
  const translate = translator(repos, map);
  return snapshot.issues.map((issue) => {
    const now = current.byOld.get(issue.number);
    if (!now) return { old: issue.number, new: map.get(issue.number) ?? null, missing: true, differences: [] };
    return { old: issue.number, new: now.issue.number, differences: diffRecords(comparable(issue, translate), comparable(now.record)) };
  });
}

async function ensureNamed(existing, wanted, create, key) {
  const have = new Map(existing.map((e) => [e[key], e]));
  const created = [];
  for (const w of wanted) {
    if (have.has(w[key])) continue;
    have.set(w[key], await create(w));
    created.push(w[key]);
  }
  return { have, created };
}

/**
 * Re-applies from the snapshot whatever the internal repository lacks:
 * type, labels, milestone and assignees in one edit, the sub-issue parent,
 * blocked-by dependencies, Project items with their Status, and the issue
 * fields. Each restore reads the live state first, so a rerun repeats
 * nothing that landed.
 */
export async function runRestore({ tracker, repos, snapshot, journal, dryRun = false, settleMs = 0, log = () => {} }) {
  const map = requireTransferred(snapshot, journal, "--restore");
  if (!dryRun) await awaitSettle(journal, settleMs, { log });
  const current = await gatherInternal(tracker, repos, snapshot, map);
  const translate = translator(repos, map);
  const internalId = (ref) => {
    const { repo, number } = splitRef(ref);
    if (!sameRepo(repo, repos.internal)) return null;
    for (const v of current.byOld.values()) if (v.issue.number === number) return v.issue.id;
    return null;
  };
  const metaOf = (p) => snapshot.projects.find((m) => m.number === p);
  const migratedRefs = new Set(snapshot.issues.map((i) => translate(`${repos.code}#${i.number}`)));
  const plan = [];
  const unrestorable = [];
  for (const issue of snapshot.issues) {
    const now = current.byOld.get(issue.number);
    if (!now) {
      unrestorable.push({ old: issue.number, reason: "not on the internal repository" });
      continue;
    }
    const target = now.issue.number;
    const differences = diffRecords(comparable(issue, translate), comparable(now.record));
    const actions = [];
    const edit = {};
    // Every difference either gets an action or is listed as unrestorable,
    // so a restore that leaves something behind says what and why.
    const cannot = (field, expected, actual, reason) => unrestorable.push({ old: issue.number, new: target, field, expected, actual, reason });
    for (const d of differences) {
      if (d.field === "title") edit.title = issue.title;
      if (d.field === "type") edit.type = issue.type;
      if (d.field === "labels") edit.labels = issue.labels;
      if (d.field === "milestone") edit.milestone = issue.milestone;
      if (d.field === "assignees") edit.assignees = issue.assignees;
      if (d.field === "parent") {
        if (d.expected) actions.push({ kind: "parent", parent: d.expected, replace: Boolean(d.actual) });
        else cannot("parent", null, d.actual, "a parent the snapshot did not have is left in place");
      }
      if (d.field === "blockedBy") {
        for (const ref of d.expected.filter((r) => !d.actual.includes(r))) {
          const blocker = issue.blockedBy.find((b) => translate(b.ref) === ref);
          actions.push({ kind: "blockedBy", ref, id: internalId(ref) ?? blocker?.id ?? null });
        }
        const extra = d.actual.filter((r) => !d.expected.includes(r));
        if (extra.length) cannot("blockedBy", d.expected, d.actual, `blockers the snapshot did not have are left in place: ${extra.join(", ")}`);
      }
      if (d.field === "projects") {
        for (const m of issue.projects) {
          const have = now.record.projects.find((p) => p.project === m.project);
          if (!have) actions.push({ kind: "projectItem", project: m.project, status: m.status });
          else if (have.status !== m.status) actions.push({ kind: "projectStatus", project: m.project, itemId: have.itemId, status: m.status });
          // REST has no call that archives a Project item.
          if (m.archived && !have?.archived) cannot("projects", projectKey(m), have ? projectKey(have) : null, "REST cannot archive a Project item; archive it on the board");
        }
        const extra = now.record.projects.filter((p) => !issue.projects.some((m) => m.project === p.project));
        if (extra.length) cannot("projects", d.expected, d.actual, `Project items the snapshot did not have are left in place: ${extra.map((p) => p.project).join(", ")}`);
      }
      if (d.field === "fields") {
        const values = issue.fields.filter((f) => !now.record.fields.some((g) => g.name === f.name && g.value === f.value)).map((f) => ({ field_id: f.fieldId, value: f.value }));
        if (values.length) actions.push({ kind: "fields", values });
        const extra = now.record.fields.filter((g) => !issue.fields.some((f) => f.name === g.name));
        if (extra.length) cannot("fields", d.expected, d.actual, `issue fields the snapshot did not have are left in place: ${extra.map((g) => g.name).join(", ")}`);
      }
      // A migrated child comes back through its own parent link; only a child that stayed behind cannot.
      if (d.field === "children") {
        const stayed = d.expected.filter((ref) => !d.actual.includes(ref) && !migratedRefs.has(ref));
        if (stayed.length) cannot("children", stayed, d.actual, "a child still on the code repository");
      }
      if (["author", "createdAt", "state", "stateReason", "comments"].includes(d.field)) cannot(d.field, d.expected, d.actual, "not settable through the API");
    }
    if (Object.keys(edit).length) actions.unshift({ kind: "edit", fields: edit });
    if (actions.length) plan.push({ old: issue.number, new: target, id: now.issue.id, actions });
  }
  const counts = tally(plan.flatMap((p) => p.actions), (a) => a.kind);
  if (dryRun) return { dryRun: true, issues: plan.length, actions: counts, unrestorable, plan };

  const labels = await ensureNamed(await tracker.labels(repos.internal), snapshot.labels.filter((l) => plan.some((p) => p.actions.some((a) => a.kind === "edit" && a.fields.labels?.includes(l.name)))), (l) => tracker.createLabel(repos.internal, l), "name");
  const milestones = await ensureNamed(
    await tracker.milestones(repos.internal),
    snapshot.milestones.filter((m) => plan.some((p) => p.actions.some((a) => a.kind === "edit" && a.fields.milestone === m.title))),
    (m) => tracker.createMilestone(repos.internal, { title: m.title, state: m.state, description: m.description, ...(m.dueOn ? { due_on: m.dueOn } : {}) }),
    "title",
  );
  if (labels.created.length || milestones.created.length) journal.append({ mode: "restore", step: "created", labels: labels.created, milestones: milestones.created });
  for (const entry of plan) {
    for (const action of entry.actions) {
      if (action.kind === "edit") {
        const fields = { ...action.fields };
        if ("milestone" in fields) fields.milestone = fields.milestone === null ? null : milestones.have.get(fields.milestone)?.number ?? null;
        await tracker.updateIssue(repos.internal, entry.new, fields);
      } else if (action.kind === "parent") {
        const parent = splitRef(action.parent);
        await tracker.addSubIssue(parent.repo, parent.number, entry.id, action.replace);
      } else if (action.kind === "blockedBy") {
        if (!action.id) throw new Error(`no issue id for blocker ${action.ref} of ${repos.internal}#${entry.new}`);
        await tracker.addBlockedBy(repos.internal, entry.new, action.id);
      } else if (action.kind === "projectItem") {
        const item = await tracker.addProjectItem(action.project, entry.id);
        const meta = metaOf(action.project);
        if (action.status && meta?.statusFieldId) await tracker.setProjectItemField(action.project, item.id, meta.statusFieldId, meta.options[action.status]);
      } else if (action.kind === "projectStatus") {
        const meta = metaOf(action.project);
        // A null value clears the field, for an item that had no Status.
        const option = action.status === null ? null : meta?.options[action.status];
        if (!meta?.statusFieldId || option === undefined) throw new Error(`Project ${action.project} has no Status option ${action.status}`);
        await tracker.setProjectItemField(action.project, action.itemId, meta.statusFieldId, option);
      } else if (action.kind === "fields") {
        await tracker.setIssueFields(repos.internal, entry.new, action.values);
      }
    }
    journal.append({ mode: "restore", step: "restored", old: entry.old, new: entry.new, actions: entry.actions.map((a) => a.kind) });
    log(`restored ${repos.internal}#${entry.new}: ${entry.actions.map((a) => a.kind).join(", ")}`);
  }
  return { issues: plan.length, actions: counts, unrestorable, createdLabels: labels.created, createdMilestones: milestones.created };
}

// ---------------------------------------------------------------------------
// Rewrite

/**
 * The replacement for a bare #N on a migrated ticket: the new number for a
 * migrated issue, `owner/code#N` for a pull request or a kept public issue,
 * and nothing for a number the code repository never had.
 */
export function bareResolver(snapshot, map, repos) {
  const stays = new Set([...snapshot.pullRequests.map((p) => p.number), ...snapshot.kept]);
  return (n) => (map.has(n) ? `#${map.get(n)}` : stays.has(n) ? `${repos.code}#${n}` : null);
}

/** The replacement for a closing reference on a public pull request that names a migrated issue. */
export function closingResolver(map, repos) {
  return ({ repo, number }) => ((repo === null || sameRepo(repo, repos.code)) && map.has(number) ? `${repos.internal}#${map.get(number)}` : null);
}

/** CRLF and LF line ends compare equal; GitHub may store either. */
const sameText = (a, b) => (a ?? "").replace(/\r\n/g, "\n") === (b ?? "").replace(/\r\n/g, "\n");

/**
 * What every migrated text reads once rewritten, computed from the
 * snapshot's original: the body with its bare references mapped and the
 * migration line, and each comment with its bare references mapped. The
 * transfer itself rewrites bare references (`#N` becomes `owner/code#N`, or
 * `owner/internal#M` for an issue that already moved), so the text on the
 * internal repository cannot say which references were bare. Working from
 * the original also makes the rewrite idempotent: a new number equal to
 * another old one is never mapped twice.
 */
export function targetTexts(snapshot, map, repos) {
  const resolve = bareResolver(snapshot, map, repos);
  return new Map(
    snapshot.issues.map((i) => [
      i.number,
      {
        body: withMigrationLine(rewriteBareRefs(i.body, resolve), migrationLine(repos, i)),
        thread: (i.thread ?? []).map((c) => ({ ...c, body: rewriteBareRefs(c.body, resolve) })),
      },
    ]),
  );
}

/**
 * Pairs a migrated issue's comments with the snapshot's by position, since
 * transfer gives comments new ids but keeps their order, time and author.
 * A thread whose length changed, or a pair whose time or author differ, is
 * a mismatch, and none of its comments is rewritten.
 */
function pairThread(expected, actual) {
  if (!actual || actual.length !== expected.length) return { pairs: [], mismatch: `${expected.length} comments in the snapshot, ${actual?.length ?? 0} now` };
  const pairs = expected.map((e, k) => ({ expected: e, actual: actual[k] }));
  const bad = pairs.find((p) => p.expected.createdAt !== p.actual.created_at || p.expected.author !== (p.actual.user?.login ?? null));
  if (bad) return { pairs: [], mismatch: `snapshot comment ${bad.expected.id} of ${bad.expected.createdAt} pairs with ${bad.actual.id} of ${bad.actual.created_at}` };
  // Comments by one author in one second have no order of their own, so
  // within such a group each is paired with the one whose text matches once
  // references are masked; a group that cannot be matched one to one is a
  // mismatch rather than a guess.
  for (let start = 0; start < pairs.length; ) {
    let end = start + 1;
    while (end < pairs.length && pairs[end].expected.createdAt === pairs[start].expected.createdAt && pairs[end].expected.author === pairs[start].expected.author) end++;
    if (end - start > 1) {
      const group = pairs.slice(start, end);
      const free = group.map((p) => p.actual);
      for (const p of group) {
        const k = free.findIndex((a) => a && maskRefs(a.body) === maskRefs(p.expected.body));
        if (k < 0) return { pairs: [], mismatch: `comments of ${p.expected.createdAt} by ${p.expected.author} cannot be told apart` };
        p.actual = free[k];
        free[k] = null;
      }
    }
    start = end;
  }
  return { pairs, mismatch: null };
}

/** Text with every issue reference, bare or qualified, masked, and line ends normalised. */
const maskRefs = (text) => (text ?? "").replace(/\r\n/g, "\n").replace(/(?:[\w.-]+\/[\w.-]+)?#\d+/g, "#");

/** Every migrated body and comment that differs from its target, with the edit that sets it. */
async function textDifferences(tracker, repos, snapshot, map) {
  const targets = targetTexts(snapshot, map, repos);
  const current = await gatherInternal(tracker, repos, snapshot, map, { links: false, threads: true });
  const out = [];
  for (const issue of snapshot.issues) {
    const now = current.byOld.get(issue.number);
    if (!now) continue;
    const target = targets.get(issue.number);
    const n = now.issue.number;
    if (!sameText(now.issue.body, target.body)) out.push({ old: issue.number, new: n, key: `body:${n}`, expected: target.body, actual: now.issue.body ?? "", write: () => tracker.updateIssue(repos.internal, n, { body: target.body }) });
    const { pairs, mismatch } = pairThread(target.thread, now.thread);
    if (mismatch) out.push({ old: issue.number, new: n, key: `comments:${n}`, mismatch });
    for (const p of pairs) {
      if (!sameText(p.actual.body, p.expected.body)) out.push({ old: issue.number, new: n, key: `comment:${p.actual.id}`, expected: p.expected.body, actual: p.actual.body ?? "", write: () => tracker.updateComment(repos.internal, p.actual.id, p.expected.body) });
    }
  }
  return out;
}

/** Open public pull requests whose closing lines still name a migrated issue on the code repository. */
async function pullDifferences(tracker, repos, map) {
  const closing = closingResolver(map, repos);
  const out = [];
  for (const pull of await tracker.openPulls(repos.code)) {
    const after = rewriteClosingRefs(pull.body ?? "", closing);
    if (after !== (pull.body ?? "")) out.push({ pull: pull.number, key: `pull:${pull.number}`, expected: after, actual: pull.body ?? "", write: () => tracker.updatePull(repos.code, pull.number, after) });
  }
  return out;
}

/**
 * Sets every migrated body and comment to its target and, for the
 * migration, rewrites the closing lines of open public pull requests
 * through the map. Each run reads the live texts and edits only those that
 * differ, so a rerun after an interruption, or after a transfer's background
 * work undid an edit, finishes the job and edits nothing twice.
 */
export async function runRewrite({ tracker, repos, snapshot, journal, dryRun = false, settleMs = 0, log = () => {} }) {
  const map = requireTransferred(snapshot, journal, "--rewrite");
  if (!dryRun) await awaitSettle(journal, settleMs, { log });
  const texts = await textDifferences(tracker, repos, snapshot, map);
  const pulls = snapshot.kind === "migration" ? await pullDifferences(tracker, repos, map) : [];
  const edits = [...texts, ...pulls].filter((d) => d.write);
  const result = {
    dryRun,
    bodies: edits.filter((d) => d.key.startsWith("body:")).length,
    comments: edits.filter((d) => d.key.startsWith("comment:")).length,
    pullRequests: pulls.length,
    mismatchedThreads: texts.filter((d) => d.mismatch).map(({ old, new: n, mismatch }) => ({ old, new: n, mismatch })),
  };
  if (dryRun) return result;
  for (const d of edits) {
    await d.write();
    journal.append({ mode: "rewrite", key: d.key, step: "edited", ...(d.old ? { old: d.old, new: d.new } : {}) });
    if (d.pull) log(`rewrote the closing lines of ${repos.code}#${d.pull}`);
  }
  return result;
}

/** Qualified references to the code repository that name a migrated issue, outside code and the migration line. */
export function staleRefs(text, repos, map) {
  const out = [];
  const prose = splitCode(text ?? "")
    .filter((p) => !p.code)
    .map((p) => p.text)
    .join("\n")
    .split(/\r?\n/)
    .filter((line) => !/^Migrated from \S+#\d+(; originally closed \d{4}-\d{2}-\d{2})?$/.test(line.trim()));
  for (const line of prose) {
    for (const m of line.matchAll(/(?:^|[^\w/.-])([\w.-]+\/[\w.-]+)#(\d+)(?!\w)/g)) if (sameRepo(m[1], repos.code) && map.has(Number(m[2]))) out.push(Number(m[2]));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Map

export function buildMap(snapshot, journal, repos) {
  const map = requireTransferred(snapshot, journal, "--map");
  return {
    from: repos.code,
    to: repos.internal,
    issues: snapshot.issues.map((i) => ({ old: i.number, new: map.get(i.number), state: i.state, type: i.type })),
  };
}

export async function runMap({ tracker, repos, snapshot, journal, dir, dryRun = false }) {
  const content = `${JSON.stringify(buildMap(snapshot, journal, repos), null, 2)}\n`;
  const local = path.join(dir, "issue-map.json");
  if (dryRun) return { dryRun: true, entries: JSON.parse(content).issues.length, wouldWrite: [local, `${repos.internal}:${MAP_PATH}`] };
  fs.writeFileSync(local, content);
  if (fs.readFileSync(local, "utf8") !== content) throw new Error(`${local} did not read back as written`);
  if (snapshot.kind !== "migration") return { entries: JSON.parse(content).issues.length, local, remote: "skipped for a rehearsal" };
  const existing = await tracker.getFile(repos.internal, MAP_PATH);
  const decoded = (file) => Buffer.from(file.content ?? "", "base64").toString("utf8");
  if (!existing || decoded(existing) !== content) {
    await tracker.putFile(repos.internal, MAP_PATH, { message: `Record the issue map from ${repos.code}`, content: Buffer.from(content).toString("base64"), ...(existing ? { sha: existing.sha } : {}) });
    journal.append({ mode: "map", step: "written", entries: JSON.parse(content).issues.length });
  }
  const back = await tracker.getFile(repos.internal, MAP_PATH);
  if (!back || decoded(back) !== content) throw new Error(`${repos.internal}:${MAP_PATH} did not read back as written`);
  return { entries: JSON.parse(content).issues.length, local, remote: `${repos.internal}:${MAP_PATH}` };
}

// ---------------------------------------------------------------------------
// Verify

/**
 * The closing references a pull request's body names that GitHub should
 * compute, and the ones it did, as lower-case `owner/name#N`, both limited
 * to the code and internal repositories. A body's reference counts when it
 * names the internal repository, or a kept public issue on the code one; a
 * code-repository number that is a pull request or was never issued closes
 * nothing, and one that moved is a stale closing line, reported apart.
 */
export function closingComparison(body, computedRefs, snapshot, repos) {
  const ours = (repo) => sameRepo(repo, repos.code) || sameRepo(repo, repos.internal);
  const key = (repo, n) => `${repo.toLowerCase()}#${n}`;
  const kept = new Set(snapshot.kept);
  const expected = [];
  for (const ref of closingRefs(body)) {
    const repo = ref.repo ?? repos.code;
    if (sameRepo(repo, repos.internal) || (sameRepo(repo, repos.code) && kept.has(ref.number))) expected.push(key(repo, ref.number));
  }
  const computed = computedRefs.filter((r) => ours(r.repo)).map((r) => key(r.repo, r.number));
  return { expected: [...new Set(expected)].sort(), computed: [...new Set(computed)].sort() };
}

/**
 * Compares the internal repository with the snapshot field by field;
 * compares every migrated body and comment with its rewritten original (so
 * a body without its migration line, a bare reference to an old number, or
 * a reference the transfer qualified and the rewrite did not restore, is a
 * difference); and, for the migration, checks that the public issue list
 * holds exactly the kept issues and that every open pull request's closing
 * references name the internal repository. Returns the differences.
 */
export async function runVerify({ tracker, repos, snapshot, journal }) {
  const map = transferMap(journal);
  const differences = [];
  for (const issue of snapshot.issues) if (!map.has(issue.number)) differences.push({ old: issue.number, field: "transfer", expected: "a new number", actual: null });
  const current = await gatherInternal(tracker, repos, snapshot, map);
  for (const row of survival(snapshot, current, repos, map)) {
    if (row.missing) {
      if (map.has(row.old)) differences.push({ old: row.old, new: row.new, field: "presence", expected: "on the internal repository", actual: null });
      continue;
    }
    for (const d of row.differences) differences.push({ old: row.old, new: row.new, ...d });
  }
  for (const d of await textDifferences(tracker, repos, snapshot, map)) {
    if (d.mismatch) differences.push({ old: d.old, new: d.new, field: "comment thread", expected: "the snapshot's comments in order", actual: d.mismatch });
    else differences.push({ old: d.old, new: d.new, field: `text of ${d.key}`, expected: { bareReferences: bareRefs(d.expected) }, actual: { bareReferences: bareRefs(d.actual), oldQualifiedReferences: staleRefs(d.actual, repos, map), migrationLine: d.key.startsWith("body:") ? hasLine(d.actual, migrationLine(repos, snapshot.issues.find((i) => i.number === d.old))) : undefined } });
  }
  if (snapshot.kind === "migration") {
    const publicIssues = (await tracker.listIssues(repos.code)).filter((i) => !i.pull_request).map((i) => i.number).sort((a, b) => a - b);
    if (!isDeepStrictEqual(publicIssues, [...snapshot.kept].sort((a, b) => a - b))) differences.push({ field: "public issues", expected: snapshot.kept, actual: publicIssues });
    for (const pull of await tracker.openPulls(repos.code)) {
      for (const ref of closingRefs(pull.body)) {
        if ((ref.repo === null || sameRepo(ref.repo, repos.code)) && map.has(ref.number)) differences.push({ pull: pull.number, field: "closing line", expected: `${repos.internal}#${map.get(ref.number)}`, actual: `${ref.repo ?? ""}#${ref.number}` });
      }
      // GitHub computes closing references only for a pull request into the default branch.
      if (pull.base?.ref && pull.base?.repo?.default_branch && pull.base.ref !== pull.base.repo.default_branch) continue;
      const { expected, computed } = closingComparison(pull.body, await tracker.closingRefs(repos.code, pull.number), snapshot, repos);
      for (const ref of expected.filter((r) => !computed.includes(r))) differences.push({ pull: pull.number, field: "closing reference missing", expected: ref, actual: computed });
      for (const ref of computed.filter((r) => !expected.includes(r))) differences.push({ pull: pull.number, field: "closing reference unexpected", expected, actual: ref });
    }
  }
  return differences;
}

// ---------------------------------------------------------------------------
// Rehearsal

const REHEARSAL_ROLES = ["parent", "child", "dependent"];

function rehearsalState(journal) {
  const created = {};
  const creating = {};
  let deleted = false;
  for (const r of journal.of("rehearsal")) {
    if (r.step === "creating") creating[r.role] = { title: r.title, at: r.at };
    if (r.step === "created") created[r.role] = r.number;
    if (r.step === "deleted") deleted = true;
  }
  return { created, creating, deleted, step: (name) => journal.of("rehearsal").some((r) => r.step === name) };
}

/**
 * Finds a rehearsal issue whose creation was journaled as intended but not
 * as done (the response was lost, or the run died before recording it), by
 * its run-specific title among the code repository's issues updated since.
 */
async function findCreated(tracker, repos, intent) {
  const since = new Date(Date.parse(intent.at) - 60e3).toISOString();
  const matches = (await tracker.issuesSince(repos.code, since)).filter((i) => !i.pull_request && i.title === intent.title);
  if (matches.length > 1) throw new Error(`${matches.length} issues are titled "${intent.title}" (${matches.map((i) => `#${i.number}`).join(", ")}); delete the extras by hand`);
  return matches[0] ?? null;
}

/** What the rehearsal's test issues use: a label, a milestone, Project 8's Status and the Effort field. */
async function rehearsalInputs(tracker, repos) {
  const labels = await tracker.labels(repos.code);
  const label = labels.find((l) => l.name === "workflow: tickets") ?? labels[0];
  const milestone = (await tracker.milestones(repos.code)).find((m) => m.state === "open") ?? null;
  const fields = await tracker.projectFields(8);
  const status = fields.find((f) => f.name === "Status" && f.data_type === "single_select");
  const todo = status?.options?.find((o) => optionName(o) === "Todo");
  const orgFields = (await tracker.orgIssueFields()) ?? [];
  const effort = orgFields.find((f) => f.name === "Effort");
  const effortOption = effort?.options?.find((o) => o.name === "Low") ?? effort?.options?.[0];
  const pull = await tracker.latestPull(repos.code);
  const user = await tracker.currentUser();
  const internal = await tracker.getRepo(repos.internal);
  const problems = [];
  if (!label) problems.push(`${repos.code} has no label`);
  if (!milestone) problems.push(`${repos.code} has no open milestone`);
  if (!status || !todo) problems.push("Project 8 has no Status option Todo");
  if (!effort || !effortOption) problems.push("the organization has no Effort issue field with options");
  if (!pull) problems.push(`${repos.code} has no closed pull request to reference`);
  if (!internal) problems.push(`${repos.internal} does not exist; #1967's runbook creates it`);
  return { label, milestone, status, todo, effort, effortOption, pull, user, internal, problems };
}

/**
 * Creates three typed test issues on the code repository (a labeled,
 * milestoned and assigned parent, a closed sub-issue, and a dependent in
 * Project 8 with Status and Effort set, carrying references in prose, a
 * code span and a fence, and a comment), then runs snapshot, transfer,
 * restore, rewrite and verify on them, reports field by field what transfer
 * kept, and deletes them unless `keep` is set. Each step is journaled, so a
 * rerun resumes; `cleanupOnly` deletes whatever a kept or failed rehearsal
 * left.
 */
export async function runRehearsal({ tracker, repos, dir, journal, dryRun = false, keep = false, cleanupOnly = false, settleMs = 0, log = () => {} }) {
  const r = rehearsalState(journal);
  if (cleanupOnly) return { cleanup: await rehearsalCleanup({ tracker, repos, journal, dryRun, log }) };
  const inputs = await rehearsalInputs(tracker, repos);
  const plan = {
    create: [
      `parent: Task, label "${inputs.label?.name}", milestone "${inputs.milestone?.title}", assigned to ${inputs.user?.login}`,
      "child: Bug, sub-issue of the parent, closed as a duplicate",
      `dependent: Feature, blocked by the parent, in Project 8 with Status Todo and Effort ${inputs.effortOption?.name}, references in prose, a span and a fence, one comment`,
    ],
    prepareInternal: `create label "${inputs.label?.name}" and milestone "${inputs.milestone?.title}" on ${repos.internal} if missing`,
    then: ["snapshot", "transfer", "survival report", "restore", "rewrite", "verify", keep ? "keep the issues" : "delete the issues from both repositories"],
    problems: inputs.problems,
  };
  if (dryRun) return { dryRun: true, plan };
  if (inputs.problems.length) throw new Error(`rehearsal cannot run: ${inputs.problems.join("; ")}`);
  if (r.deleted) throw new Error(`this rehearsal already ran and deleted its issues; use a fresh --dir`);

  const runId = path.basename(dir);
  const title = (role) => `[migrate-tracker rehearsal ${runId}] ${role}`;
  const note = "Created by `scripts/migrate-tracker.mjs --rehearsal`; it is deleted when the rehearsal ends.";
  const created = { ...r.created };
  const create = async (role, fields) => {
    if (created[role]) return tracker.getIssue(repos.code, created[role]);
    // The intent goes first, so a creation whose response is lost is found by its title, not made twice.
    const found = r.creating[role] ? await findCreated(tracker, repos, r.creating[role]) : null;
    if (!found) journal.append({ mode: "rehearsal", step: "creating", role, title: title(role) });
    const issue = found ?? (await tracker.createIssue(repos.code, { title: title(role), ...fields }));
    created[role] = issue.number;
    journal.append({ mode: "rehearsal", step: "created", role, number: issue.number, id: issue.id });
    return issue;
  };
  const parent = await create("parent", { type: "Task", body: note, labels: [inputs.label.name], milestone: inputs.milestone.number, assignees: [inputs.user.login] });
  const child = await create("child", { type: "Bug", body: `${note}\n\nSub-issue of #${parent.number}.` });
  const dependent = await create("dependent", {
    type: "Feature",
    body: [note, "", `Blocked by #${parent.number}; see #${inputs.pull.number} and the child #${child.number}.`, "", `In a span: \`#${parent.number}\`.`, "", "```", `#${parent.number} in a fence`, "```"].join("\n"),
  });
  if (!r.step("linked")) {
    const live = (n) => tracker.getIssue(repos.code, n);
    if (!(await live(child.number)).parent_issue_url) await tracker.addSubIssue(repos.code, parent.number, child.id);
    if (!((await live(dependent.number)).issue_dependencies_summary?.total_blocked_by > 0)) await tracker.addBlockedBy(repos.code, dependent.number, parent.id);
    const items = await tracker.projectItems(8, [inputs.status.id]);
    const item = items.find((i) => i.content?.id === dependent.id) ?? (await tracker.addProjectItem(8, dependent.id));
    await tracker.setProjectItemField(8, item.id, inputs.status.id, inputs.todo.id);
    await tracker.setIssueFields(repos.code, dependent.number, [{ field_id: inputs.effort.id, value: optionName(inputs.effortOption) }]);
    if (!(await tracker.issueComments(repos.code, dependent.number)).length) await tracker.createComment(repos.code, dependent.number, `Comment naming the child #${child.number} and the parent #${parent.number}, and \`#${parent.number}\` in a span.`);
    if ((await live(child.number)).state !== "closed") await tracker.updateIssue(repos.code, child.number, { state: "closed", state_reason: "duplicate" });
    journal.append({ mode: "rehearsal", step: "linked" });
  }
  if (!r.step("prepared")) {
    // Transfer keeps a label or milestone only when the destination has one of the same name.
    const labels = await ensureNamed(await tracker.labels(repos.internal), [{ name: inputs.label.name, color: inputs.label.color, description: inputs.label.description ?? "" }], (l) => tracker.createLabel(repos.internal, l), "name");
    const milestones = await ensureNamed(await tracker.milestones(repos.internal), [{ title: inputs.milestone.title, description: inputs.milestone.description ?? "" }], (m) => tracker.createMilestone(repos.internal, m), "title");
    journal.append({ mode: "rehearsal", step: "prepared", labels: labels.created, milestones: milestones.created });
  }

  const snapshotFile = path.join(dir, "snapshot.json");
  let snapshot;
  if (fs.existsSync(snapshotFile)) snapshot = JSON.parse(fs.readFileSync(snapshotFile, "utf8"));
  else {
    snapshot = await takeSnapshot(tracker, repos, { only: REHEARSAL_ROLES.map((role) => created[role]), kind: "rehearsal", pullRequests: [{ number: inputs.pull.number, state: inputs.pull.state }], log });
    writeJson(snapshotFile, snapshot);
  }
  await runTransfer({ tracker, repos, snapshot, journal, log });
  await awaitSettle(journal, settleMs, { log });
  const survivalFile = path.join(dir, "survival.json");
  let report;
  if (fs.existsSync(survivalFile)) report = JSON.parse(fs.readFileSync(survivalFile, "utf8"));
  else {
    const map = transferMap(journal);
    const current = await gatherInternal(tracker, repos, snapshot, map, { threads: true });
    report = { fields: survivalReport(snapshot, survival(snapshot, current, repos, map)), texts: textSurvival(snapshot, current, repos) };
    writeJson(survivalFile, report);
  }
  const restored = await runRestore({ tracker, repos, snapshot, journal, log });
  const rewritten = await runRewrite({ tracker, repos, snapshot, journal, log });
  const differences = await runVerify({ tracker, repos, snapshot, journal });
  writeJson(path.join(dir, "verify-report.json"), differences);
  const cleanup = keep ? "kept; rerun with --rehearsal --cleanup to delete" : await rehearsalCleanup({ tracker, repos, journal, log });
  return { survival: report, restored, rewritten, verify: differences.length ? differences : "passed", cleanup };
}

/** Per field, which test issues kept it through transfer and which lost it. */
export function survivalReport(snapshot, rows) {
  const fields = Object.keys(comparable(snapshot.issues[0]));
  const out = {};
  for (const field of fields) {
    out[field] = {};
    for (const row of rows) {
      const d = row.differences.find((x) => x.field === field);
      out[field][`#${row.old}`] = row.missing ? "issue missing" : d ? `dropped or changed: expected ${JSON.stringify(d.expected)}, found ${JSON.stringify(d.actual)}` : "kept";
    }
  }
  return out;
}

/** Per test issue, whether transfer kept its database id, its body (with the migration line) and each comment. */
export function textSurvival(snapshot, current, repos) {
  const out = {};
  for (const issue of snapshot.issues) {
    const now = current.byOld.get(issue.number);
    if (!now) {
      out[`#${issue.number}`] = "issue missing";
      continue;
    }
    const { pairs, mismatch } = pairThread(issue.thread ?? [], now.thread);
    out[`#${issue.number}`] = {
      id: now.issue.id === issue.id ? "kept" : "changed",
      body: sameText(now.issue.body, withMigrationLine(issue.body, migrationLine(repos, issue))) ? "kept" : `changed to ${JSON.stringify(now.issue.body)}`,
      comments: mismatch ?? pairs.map((p) => ({ id: p.actual.id === p.expected.id ? "kept" : "changed", body: sameText(p.actual.body, p.expected.body) ? "kept" : `changed to ${JSON.stringify(p.actual.body)}` })),
    };
  }
  return out;
}

async function rehearsalCleanup({ tracker, repos, journal, dryRun = false, log = () => {} }) {
  const { created: recorded, creating } = rehearsalState(journal);
  const created = { ...recorded };
  for (const [role, intent] of Object.entries(creating)) {
    if (created[role]) continue;
    const found = await findCreated(tracker, repos, intent);
    if (found) created[role] = found.number;
  }
  const map = transferMap(journal);
  const report = {};
  for (const [role, old] of Object.entries(created)) {
    const places = [];
    const atOld = await tracker.findIssue(repos.code, old);
    if (atOld) places.push({ repo: repoOf(atOld.repository_url), number: atOld.number });
    if (map.has(old) && !places.some((p) => sameRepo(p.repo, repos.internal))) {
      const atNew = await tracker.findIssue(repos.internal, map.get(old));
      if (atNew && atNew.title?.includes("[migrate-tracker rehearsal")) places.push({ repo: repos.internal, number: atNew.number });
    }
    if (dryRun) {
      report[role] = places.length ? places.map((p) => `would delete ${p.repo}#${p.number}`) : "already gone";
      continue;
    }
    for (const p of places) await tracker.deleteIssue(p.repo, p.number);
    const leftOld = await tracker.findIssue(repos.code, old);
    const leftNew = map.has(old) ? await tracker.findIssue(repos.internal, map.get(old)) : null;
    if (leftOld || leftNew) throw new Error(`rehearsal issue ${role} is still present after deletion`);
    report[role] = `gone from ${repos.code}#${old}${map.has(old) ? ` and ${repos.internal}#${map.get(old)}` : ""}`;
    log(`deleted the rehearsal ${role}`);
  }
  if (!dryRun) journal.append({ mode: "rehearsal", step: "deleted" });
  return report;
}

// ---------------------------------------------------------------------------
// Command line

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  if (!isDeepStrictEqual(JSON.parse(fs.readFileSync(file, "utf8")), JSON.parse(JSON.stringify(value)))) throw new Error(`${file} did not read back as written`);
}

export function parseArgs(argv) {
  const opts = { mode: null, dir: null, dryRun: false, keep: false, cleanup: false, perHour: 4500, writesPerMinute: 60, writesPerHour: 450, settleSeconds: 120 };
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
      if (mode === "snapshot") opts.dir = value();
    } else if (arg === "--dir") opts.dir = value();
    else if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--keep") opts.keep = true;
    else if (arg === "--cleanup") opts.cleanup = true;
    else if (arg === "--settle-seconds") {
      const n = Number(value());
      if (!Number.isSafeInteger(n) || n < 0) throw new Error(`${arg} must be a whole number of seconds`);
      opts.settleSeconds = n;
    }
    else if (numeric[arg]) {
      const n = Number(value());
      if (!Number.isSafeInteger(n) || n < 1) throw new Error(`${arg} must be a positive integer`);
      opts[numeric[arg]] = n;
    } else throw new Error(`unknown argument ${arg}`);
  }
  if (!opts.mode) throw new Error(`give a mode: ${MODES.map((m) => `--${m}`).join(", ")}`);
  if (!opts.dir) throw new Error(`--${opts.mode} needs ${opts.mode === "snapshot" ? "a directory" : "--dir <attempt directory>"}`);
  if ((opts.keep || opts.cleanup) && opts.mode !== "rehearsal") throw new Error("--keep and --cleanup belong to --rehearsal");
  opts.dir = path.resolve(opts.dir);
  return opts;
}

/** Refuses an attempt directory inside a Git work tree, where a snapshot or journal could be committed. */
function checkPrivateDir(dir) {
  let probe = dir;
  while (!fs.existsSync(probe)) probe = path.dirname(probe);
  const r = spawnSync("git", ["-C", probe, "rev-parse", "--is-inside-work-tree"], { encoding: "utf8", windowsHide: true });
  if (r.status === 0 && r.stdout.trim() === "true") throw new Error(`${dir} is inside a Git work tree; keep the attempt directory private, outside any checkout`);
}

function loadSnapshot(dir) {
  const file = path.join(dir, "snapshot.json");
  if (!fs.existsSync(file)) throw new Error(`${file} does not exist; run --snapshot ${dir} first`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export async function main(argv = process.argv.slice(2), { repos = readRepos(), tracker = null, out = (s) => process.stdout.write(s), log = (s) => process.stderr.write(`${s}\n`) } = {}) {
  const opts = parseArgs(argv);
  checkPrivateDir(opts.dir);
  const pacer = new Pacer({ perHour: opts.perHour, writesPerMinute: opts.writesPerMinute, writesPerHour: opts.writesPerHour, log });
  tracker ??= restTracker(ghClient({ pacer, log }), repos);
  const print = (value) => out(`${JSON.stringify(value, null, 2)}\n`);
  if (!opts.dryRun) fs.mkdirSync(opts.dir, { recursive: true });
  const journal = new Journal(path.join(opts.dir, "journal.jsonl"));
  if (opts.dryRun) journal.append = (record) => record;
  const budgets = { perHour: opts.perHour, writesPerMinute: opts.writesPerMinute, writesPerHour: opts.writesPerHour };

  if (opts.mode === "snapshot") {
    const file = path.join(opts.dir, "snapshot.json");
    if (fs.existsSync(file)) throw new Error(`${file} exists; a snapshot is taken once per attempt directory`);
    const snapshot = await takeSnapshot(tracker, repos, { log });
    const summary = summarize(snapshot);
    if (!opts.dryRun) writeJson(file, snapshot);
    const transfer = await runTransfer({ tracker, repos, snapshot, journal: { of: () => [] }, dryRun: true });
    print({ mode: "snapshot", dryRun: opts.dryRun, file: opts.dryRun ? null : file, ...summary, transferEstimate: { ...transfer.requests, hours: Number(estimateHours(transfer.requests, budgets).toFixed(1)) }, requestsMade: pacer.total });
    return 0;
  }
  if (opts.mode === "rehearsal") {
    if (fs.existsSync(path.join(opts.dir, "snapshot.json")) && loadSnapshot(opts.dir).kind !== "rehearsal") throw new Error(`${opts.dir} holds a migration snapshot; give the rehearsal its own directory`);
    print({ mode: "rehearsal", ...(await runRehearsal({ tracker, repos, dir: opts.dir, journal, dryRun: opts.dryRun, keep: opts.keep, cleanupOnly: opts.cleanup, settleMs: opts.settleSeconds * 1000, log })), requestsMade: pacer.total });
    return 0;
  }
  const snapshot = loadSnapshot(opts.dir);
  if (!sameRepo(snapshot.code, repos.code) || !sameRepo(snapshot.internal, repos.internal)) throw new Error(`the snapshot moves ${snapshot.code} to ${snapshot.internal}, but .agents/repos.json names ${repos.code} and ${repos.internal}`);
  const args = { tracker, repos, snapshot, journal, dir: opts.dir, dryRun: opts.dryRun, settleMs: opts.settleSeconds * 1000, log };
  if (opts.mode === "transfer") {
    const result = await runTransfer(args);
    print({ mode: "transfer", ...result, estimateHours: Number(estimateHours(result.requests, budgets).toFixed(1)), requestsMade: pacer.total });
  } else if (opts.mode === "restore") {
    const { plan, ...result } = await runRestore(args);
    print({ mode: "restore", ...result, requestsMade: pacer.total });
  } else if (opts.mode === "rewrite") print({ mode: "rewrite", ...(await runRewrite(args)), requestsMade: pacer.total });
  else if (opts.mode === "map") print({ mode: "map", ...(await runMap(args)), requestsMade: pacer.total });
  else if (opts.mode === "verify") {
    const differences = await runVerify(args);
    if (!opts.dryRun) writeJson(path.join(opts.dir, "verify-report.json"), differences);
    print({ mode: "verify", passed: differences.length === 0, differences, requestsMade: pacer.total });
    return differences.length ? 1 : 0;
  }
  return 0;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      process.stderr.write(`migrate-tracker: ${error.message}\n`);
      process.exit(2);
    },
  );
}
