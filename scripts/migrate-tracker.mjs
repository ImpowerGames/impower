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
//   --verify          compare the internal repository with the snapshot,
//                     including a render check of every rewritten reference
//                     through GitHub's Markdown API, and exit non-zero on any
//                     difference
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
import { createHash } from "node:crypto";
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
//
// GitHub links no reference inside code (fenced blocks, code spans, <code>
// and <pre>), an inline link's text, destination and title, a link reference
// definition, or a URL written out. protectedRanges() finds those regions
// in the order CommonMark does: fenced blocks first, by the blockquote and
// list item they open in; then, within each block (a paragraph, list item,
// heading or table cell), code spans, code elements and inline links from
// left to right; then definitions, which only start a block, and URLs.
// Indented code blocks are not recognised and read as prose.

const LIST_MARKER = /^(?:[-*+]|(\d{1,9})[.)])(?:[ \t]+|$)/;
const FENCE_OPEN = /^((?:[-*+]|\d{1,9}[.)])[ \t]+)?(`{3,}|~{3,})(.*)$/;
const FENCE_CLOSE = /^[ \t]*(`{3,}|~{3,})[ \t]*$/;
const HEADING_LINE = /^#{1,6}(?:[ \t]|$)/;
const TABLE_DELIMITER = /^\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
const DEFINITION = /^\[(?:[^\]\x5c]|\x5c.)+\]:[ \t]*\S+(?:[ \t]+(?:"[^"]*"|'[^']*'|\([^)]*\)))?[ \t]*$/;
const URL = /(?:https?|ftp):\/\/[^\s<>]+/g;

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
  return { depth, rest: line.slice(i), at: i };
}

/** Offsets of the unescaped `|` in a table row; GitHub splits a row into cells before it reads code spans. */
function cellBreaks(text, start, end) {
  const out = [];
  for (let i = start; i < end; i++) {
    if (text[i] === "\x5c") i++;
    else if (text[i] === "|") out.push(i);
  }
  return out;
}

/**
 * The end of an inline link's `(destination "title")` that starts at
 * `open` (the offset of its `(`), within `limit`, or -1 when none is there.
 * The destination is `<...>` or a run without spaces whose parentheses
 * balance, a backslash escaping the next character, as CommonMark has it.
 */
function inlineLinkEnd(text, open, limit = text.length) {
  let i = open + 1;
  const space = () => {
    while (i < limit && /\s/.test(text[i])) i++;
  };
  space();
  if (text[i] === "<") {
    while (i < limit && text[i] !== ">" && text[i] !== "\n") i += text[i] === "\x5c" ? 2 : 1;
    if (text[i] !== ">") return -1;
    i++;
  } else {
    let depth = 0;
    for (; i < limit && !/\s/.test(text[i]); i++) {
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
    for (i++; i < limit && text[i] !== quote; i++) if (text[i] === "\x5c") i++;
    if (text[i] !== quote) return -1;
    i++;
    space();
  }
  return i < limit && text[i] === ")" ? i + 1 : -1;
}

/** Code spans, code elements and inline link destinations in one block's inline text, left to right. */
function inlineRanges(text, start, end, ranges) {
  const brackets = [];
  for (let i = start; i < end; ) {
    const c = text[i];
    if (c === "\x5c") {
      i += 2;
      continue;
    }
    if (c === "`") {
      let n = 1;
      while (text[i + n] === "`") n++;
      let close = -1;
      for (let j = i + n; j < end; ) {
        if (text[j] !== "`") {
          j++;
          continue;
        }
        let k = 1;
        while (text[j + k] === "`") k++;
        if (k === n) {
          close = j;
          break;
        }
        j += k;
      }
      if (close < 0) {
        i += n;
        continue;
      }
      ranges.push([i, close + n]);
      i = close + n;
      continue;
    }
    if (c === "<") {
      const m = /^<(code|pre)\b[^>]*>/i.exec(text.slice(i, Math.min(end, i + 200)));
      const close = m ? text.toLowerCase().indexOf(`</${m[1].toLowerCase()}>`, i + m[0].length) : -1;
      if (close >= 0 && close < end) {
        const stop = close + m[1].length + 3;
        ranges.push([i, stop]);
        i = stop;
        continue;
      }
    }
    if (c === "[") brackets.push(i);
    if (c === "]" && brackets.length) {
      const open = brackets.pop();
      if (text[i + 1] === "(") {
        const stop = inlineLinkEnd(text, i + 1, end);
        if (stop > 0) {
          // GitHub links no reference in a link's text either.
          ranges.push([open, stop]);
          brackets.length = 0;
          i = stop;
          continue;
        }
      }
    }
    i++;
  }
}

/**
 * The [start, end) ranges of the text in which GitHub links no reference.
 * A fence belongs to the blockquote depth and list item it opened in: only
 * its marker alone at that depth closes it, and a line of lesser depth, or
 * a non-blank line less indented than its list item's content, ends it with
 * its container. A block ends at a blank line or at a line that starts
 * another block: a heading, a bullet list item, an ordered item numbered 1
 * (or any number within a list), a deeper quote, or a table row. A
 * definition counts only at the start of a block.
 */
export function protectedRanges(text) {
  const ranges = [];
  const lines = [];
  for (let at = 0; at <= text.length; ) {
    const nl = text.indexOf("\n", at);
    const end = nl < 0 ? text.length : nl;
    lines.push({ start: at, end: end > at && text[end - 1] === "\r" ? end - 1 : end, next: nl < 0 ? text.length : nl + 1 });
    if (nl < 0) break;
    at = nl + 1;
  }
  let fence = null;
  let block = null;
  let table = false;
  let listIndent = 0;
  let previousBlank = true;
  const endBlock = () => {
    if (block) inlineRanges(text, block.start, block.end, ranges);
    block = null;
  };
  const cells = (start, end) => {
    let from = start;
    for (const b of [...cellBreaks(text, start, end), end]) {
      inlineRanges(text, from, b, ranges);
      from = b + 1;
    }
  };
  for (const line of lines) {
    const raw = text.slice(line.start, line.end);
    const { depth, rest, at } = quoted(raw);
    const indent = rest.length - rest.trimStart().length;
    const body = rest.slice(indent);
    const blank = body.trim() === "";
    const bodyStart = line.start + at + indent;
    if (fence) {
      const ended = depth < fence.depth || (!blank && depth === fence.depth && indent < fence.indent);
      if (!ended) {
        const close = rest.match(FENCE_CLOSE);
        if (depth === fence.depth && close && close[1][0] === fence.char && close[1].length >= fence.length) {
          ranges.push([fence.start, line.next]);
          fence = null;
        }
        continue;
      }
      ranges.push([fence.start, line.start]);
      fence = null;
    }
    if (blank) {
      endBlock();
      table = false;
      previousBlank = true;
      continue;
    }
    const list = body.match(LIST_MARKER);
    if (list) listIndent = indent + list[0].length;
    else if (previousBlank && indent < listIndent) listIndent = 0;
    const open = body.match(FENCE_OPEN);
    if (open && !(open[2][0] === "`" && open[3].includes("`"))) {
      endBlock();
      table = false;
      const markerIndent = open[1] ? indent + open[1].length : 0;
      fence = { char: open[2][0], length: open[2].length, depth, indent: markerIndent || (listIndent && indent >= listIndent ? listIndent : 0), start: line.start };
      previousBlank = false;
      continue;
    }
    const heading = HEADING_LINE.test(body);
    // A table's rows run until a blank line or another block; each cell is a block of its own.
    if (table && !heading && !list && depth === table.depth) {
      cells(bodyStart, line.end);
      previousBlank = false;
      continue;
    }
    table = false;
    // A delimiter row under a line with a pipe makes that line a table's header.
    if (block && !block.heading && depth === block.depth && TABLE_DELIMITER.test(body.trimEnd()) && body.includes("-") && text.slice(block.lastStart, block.end).includes("|")) {
      const header = { start: block.lastStart, end: block.end };
      if (block.lastStart > block.start) {
        block.end = block.lastEnd;
        endBlock();
      }
      block = null;
      cells(header.start, header.end);
      table = { depth };
      previousBlank = false;
      continue;
    }
    const startsBlock = !block || heading || block.heading || depth > block.depth || (list && (!list[1] || list[1] === "1" || block.list));
    if (startsBlock) {
      endBlock();
      // A definition opens a block of its own; its destination and title link nothing.
      if (!list && !heading && DEFINITION.test(body.trimEnd())) {
        ranges.push([bodyStart, line.end]);
        previousBlank = false;
        continue;
      }
      block = { start: bodyStart, end: line.end, lastStart: bodyStart, lastEnd: line.start, depth, list: Boolean(list), heading };
    } else {
      block.lastEnd = block.end;
      block.lastStart = bodyStart;
      block.end = line.end;
    }
    previousBlank = false;
  }
  if (fence) ranges.push([fence.start, text.length]);
  endBlock();
  for (const m of text.matchAll(URL)) ranges.push([m.index, m.index + m[0].length]);
  return ranges.sort((a, b) => a[0] - b[0]);
}

/** True when the offset lies in one of the sorted ranges. */
function covered(ranges, offset) {
  for (const [start, end] of ranges) {
    if (start > offset) return false;
    if (offset < end) return true;
  }
  return false;
}

// A bare reference: `#N` not preceded by a word character and not followed
// by one, as GitHub links it, so `#216/#218`, `#1386–#1389` and `pre-#1061`
// are references (GitHub's renderer linked each of them in the corpus
// check). `owner/repo#N`, `word#N`, a URL fragment, an HTML entity
// (`&#12;`), `##12` and an escaped `\#12` are not bare references.
const BARE_REF = /(^|[^\w&#\x5c])#(\d+)(?!\w)/g;

/** Rewrites every bare reference outside protected ranges; resolve(n) returns the replacement text or null to leave it. */
export function rewriteBareRefs(text, resolve) {
  const source = text ?? "";
  const ranges = protectedRanges(source);
  return source.replace(BARE_REF, (all, lead, n, offset) => {
    if (covered(ranges, offset + lead.length)) return all;
    const to = resolve(Number(n));
    return to === null || to === undefined ? all : lead + to;
  });
}

/** The numbers of the bare references outside protected ranges, in order. */
export function bareRefs(text) {
  const source = text ?? "";
  const ranges = protectedRanges(source);
  const out = [];
  for (const m of source.matchAll(BARE_REF)) if (!covered(ranges, m.index + m[1].length)) out.push(Number(m[2]));
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

/** A closing match counts when its keyword is outside code; an issue URL after it is the closing reference itself. */
const closingCounts = (ranges, m) => !covered(ranges, m.index + m[1].length);

/** Rewrites closing references outside code; resolve({ repo, number }) returns the new reference or null. */
export function rewriteClosingRefs(text, resolve) {
  const source = text ?? "";
  const ranges = protectedRanges(source);
  return source.replace(CLOSING, (...m) => {
    const match = Object.assign([...m.slice(0, 8)], { index: m[8] });
    if (!closingCounts(ranges, match)) return m[0];
    const to = resolve(closingMatch(m));
    return to === null || to === undefined ? m[0] : m[1] + m[2] + to;
  });
}

/** The closing references outside code, as { repo, number }; repo is null for a bare #N. */
export function closingRefs(text) {
  const source = text ?? "";
  const ranges = protectedRanges(source);
  const out = [];
  for (const m of source.matchAll(CLOSING)) if (closingCounts(ranges, m)) out.push(closingMatch(m));
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
    // A render creates nothing, so it is paced and retried as a read.
    async render(text, context) {
      return call(["api", "-X", "POST", "markdown", "--input", "-"], { write: false, idempotent: true, input: JSON.stringify({ text, mode: "gfm", context }) });
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
    pullNumbers: async (repo) => (await gh.list(`repos/${repo}/pulls?state=all&per_page=100`)).map((p) => p.number),
    renderMarkdown: (text, context) => gh.render(text, context),
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
 *
 * With a gate, the references mapped are exactly the tokens GitHub linked
 * (see githubReferences), and everything else, code included, stays as the
 * original has it; a text the gate has no consistent answer for has no
 * target (null). Without one, the tool's own reading picks them; that is
 * used only to pair comment threads, which ignores the references.
 */
export function targetTexts(snapshot, map, repos, gate) {
  const resolve = bareResolver(snapshot, map, repos);
  const mapped = (text, key) => {
    if (![...(text ?? "").matchAll(BARE_REF)].length) return text ?? "";
    if (!gate) return rewriteBareRefs(text, resolve);
    const answer = gate.get(key);
    return answer?.consistent ? mapTokens(text, answer.tokens, resolve) : null;
  };
  return new Map(
    snapshot.issues.map((i) => {
      const body = mapped(i.body, textKey(i.number));
      return [
        i.number,
        {
          body: body === null ? null : withMigrationLine(body, migrationLine(repos, i)),
          thread: (i.thread ?? []).map((c) => ({ ...c, target: mapped(c.body, textKey(i.number, c.id)) })),
        },
      ];
    }),
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

/**
 * Every migrated body and comment that differs from its target, with the
 * edit that sets it, and the texts left as transferred. A text the gate has
 * no consistent answer for (GitHub's two renders of it disagree, or a render
 * failed) is not rewritten: it keeps the text the transfer gave it, a body
 * only has its migration line restored, and it is listed so that verify
 * reports it and the maintainer reads it by hand.
 */
async function textDifferences(tracker, repos, snapshot, map, gate) {
  const targets = targetTexts(snapshot, map, repos, gate);
  const current = await gatherInternal(tracker, repos, snapshot, map, { links: false, threads: true });
  const why = (key) => {
    const answer = gate.get(key);
    return answer?.unanswered ? `GitHub could not be asked: ${answer.reason}` : "GitHub's two renders of the original disagree (a stand-in per token against one per number)";
  };
  const out = [];
  const left = [];
  for (const issue of snapshot.issues) {
    const now = current.byOld.get(issue.number);
    if (!now) continue;
    const target = targets.get(issue.number);
    const n = now.issue.number;
    let body = target.body;
    if (body === null) {
      body = withExactMigrationLine(now.issue.body, migrationLine(repos, issue));
      left.push({ old: issue.number, new: n, key: `body:${n}`, original: textKey(issue.number), reason: why(textKey(issue.number)) });
    }
    if (!sameText(now.issue.body, body)) out.push({ old: issue.number, new: n, key: `body:${n}`, expected: body, actual: now.issue.body ?? "", write: () => tracker.updateIssue(repos.internal, n, { body }) });
    const { pairs, mismatch } = pairThread(target.thread, now.thread);
    if (mismatch) out.push({ old: issue.number, new: n, key: `comments:${n}`, mismatch });
    for (const p of pairs) {
      if (p.expected.target === null) {
        left.push({ old: issue.number, new: n, key: `comment:${p.actual.id}`, original: textKey(issue.number, p.expected.id), reason: why(textKey(issue.number, p.expected.id)) });
        continue;
      }
      if (!sameText(p.actual.body, p.expected.target)) out.push({ old: issue.number, new: n, key: `comment:${p.actual.id}`, expected: p.expected.target, actual: p.actual.body ?? "", write: () => tracker.updateComment(repos.internal, p.actual.id, p.expected.target) });
    }
  }
  out.leftAsTransferred = left;
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
 * through the map. Before any text is rewritten, the reference gate asks
 * GitHub's renderer which references the original holds; a text whose
 * reading disagrees is left as transferred and listed. Each run reads the
 * live texts and edits only those that differ, so a rerun after an
 * interruption, or after a transfer's background work undid an edit,
 * finishes the job and edits nothing twice.
 */
export async function runRewrite({ tracker, repos, snapshot, journal, dryRun = false, settleMs = 0, log = () => {} }) {
  const map = requireTransferred(snapshot, journal, "--rewrite");
  if (!dryRun) await awaitSettle(journal, settleMs, { log });
  const { gate, renders } = await referenceGate(tracker, repos, snapshot, journal, log);
  const texts = await textDifferences(tracker, repos, snapshot, map, gate);
  const pulls = snapshot.kind === "migration" ? await pullDifferences(tracker, repos, map) : [];
  const edits = [...texts, ...pulls].filter((d) => d.write);
  const result = {
    dryRun,
    bodies: edits.filter((d) => d.key.startsWith("body:")).length,
    comments: edits.filter((d) => d.key.startsWith("comment:")).length,
    pullRequests: pulls.length,
    mismatchedThreads: texts.filter((d) => d.mismatch).map(({ old, new: n, mismatch }) => ({ old, new: n, mismatch })),
    gateRenders: renders,
    leftAsTransferred: texts.leftAsTransferred,
    // Texts the tool's own reading would have read differently from GitHub's; GitHub's reading was used.
    readerDisagreed: [...gate.values()].filter((a) => a.readerAgrees === false).map((a) => a.key),
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
  const source = text ?? "";
  const ranges = protectedRanges(source);
  for (const m of source.matchAll(/(^|[^\w/.-])([\w.-]+\/[\w.-]+)#(\d+)(?!\w)/g)) {
    const at = m.index + m[1].length;
    const lineStart = source.lastIndexOf("\n", at) + 1;
    const lineEnd = source.indexOf("\n", at);
    const line = source.slice(lineStart, lineEnd < 0 ? source.length : lineEnd).trim();
    if (covered(ranges, at) || /^Migrated from \S+#\d+(; originally closed \d{4}-\d{2}-\d{2})?$/.test(line)) continue;
    if (sameRepo(m[2], repos.code) && map.has(Number(m[3]))) out.push(Number(m[3]));
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

// ---------------------------------------------------------------------------
// Render check: GitHub's renderer as the oracle for references

/** The (repository, number) of every issue or pull request link GitHub rendered, in order, as `owner/name#N`. */
export function renderedLinks(html) {
  const out = [];
  for (const m of (html ?? "").matchAll(/<a\s[^>]*>/g)) {
    if (!/\bclass="[^"]*\bissue-link\b/.test(m[0])) continue;
    const href = m[0].match(/\bhref="https:\/\/github\.com\/([^/"]+\/[^/"]+)\/(?:issues|pull)\/(\d+)/);
    if (href) out.push(`${href[1].toLowerCase()}#${Number(href[2])}`);
  }
  return out;
}

/**
 * The text with the number of each `#N` that could be a bare reference (the
 * lead rule alone, with no reading of the Markdown) replaced by a pull
 * request number from `pool`, and the tokens in order. Only digits change.
 * With `perNumber`, every token of one number gets the same stand-in, so
 * text that must stay equal to other text (a reference link's label and
 * its definition) stays equal and the Markdown means the same; GitHub then
 * links a stand-in wherever it reads a token of that number as a reference.
 * Without it, each token gets its own stand-in, which locates each
 * reference but can break such an equality. A pool number whose digits the
 * text already holds anywhere (written out, as an entity such as `&#35;N`,
 * in a URL) is not used, so no link the text already makes can pass for a
 * stand-in.
 */
export function withSentinels(text, pool, { perNumber = false } = {}) {
  const source = text ?? "";
  const free = pool.filter((n) => !new RegExp(`(?<![0-9])${n}(?![0-9])`).test(source));
  const tokens = [];
  const byNumber = new Map();
  let used = 0;
  const replaced = source.replace(BARE_REF, (all, lead, n) => {
    let sentinel = perNumber ? byNumber.get(n) : undefined;
    if (sentinel === undefined) {
      if (used >= free.length) throw new Error(`more possible references than pull request numbers to stand in for them (${free.length})`);
      sentinel = free[used++];
      byNumber.set(n, sentinel);
    }
    tokens.push({ sentinel, number: Number(n) });
    return `${lead}#${sentinel}`;
  });
  return { text: replaced, tokens };
}

/** The pull request numbers that stand in for possible references: every pull request of the code repository. */
async function standInPool(tracker, repos, snapshot) {
  const pulls = new Set([...(await tracker.pullNumbers(repos.code)), ...snapshot.pullRequests.map((p) => p.number)]);
  return { pulls, pool: [...pulls].sort((a, b) => b - a) };
}

/**
 * Which possible references of an original text GitHub reads as
 * references, asked twice in the code repository's context: with a
 * stand-in per token, for which tokens it links, and with a stand-in per
 * number, for which numbers it links in order with every label and
 * definition intact. The two are consistent when the per-token tokens'
 * numbers, in order, are the per-number render's; then `tokens` is GitHub's
 * own reading, which the rewrite maps. Whether the tool's Markdown reading
 * agrees is recorded too, as a cross-check that decides nothing.
 */
export async function githubReferences(tracker, repos, text, pool) {
  const source = text ?? "";
  const all = [...source.matchAll(BARE_REF)].map((m) => ({ number: Number(m[2]), at: m.index + m[1].length }));
  if (!all.length) return { consistent: true, tokens: [], numbers: [], readerAgrees: true, renders: 0 };
  const code = repos.code.toLowerCase();
  const each = withSentinels(source, pool);
  const linkedEach = new Set(renderedLinks(await tracker.renderMarkdown(each.text, repos.code)));
  const tokens = each.tokens.map((t, k) => (linkedEach.has(`${code}#${t.sentinel}`) ? k : -1)).filter((k) => k >= 0);
  const same = withSentinels(source, pool, { perNumber: true });
  const numberOf = new Map(same.tokens.map((t) => [`${code}#${t.sentinel}`, t.number]));
  const numbers = renderedLinks(await tracker.renderMarkdown(same.text, repos.code))
    .filter((l) => numberOf.has(l))
    .map((l) => numberOf.get(l));
  const consistent = isDeepStrictEqual(tokens.map((k) => all[k].number), numbers);
  const ranges = protectedRanges(source);
  const readerTokens = all.map((t, k) => (covered(ranges, t.at) ? -1 : k)).filter((k) => k >= 0);
  return { consistent, tokens, numbers, readerAgrees: isDeepStrictEqual(readerTokens, tokens), renders: 2 };
}

/** The text with the possible references at the given token positions mapped, and nothing else changed. */
export function mapTokens(text, tokens, resolve) {
  const at = new Set(tokens);
  let k = -1;
  return (text ?? "").replace(BARE_REF, (all, lead, n) => {
    k++;
    if (!at.has(k)) return all;
    const to = resolve(Number(n));
    return to === null || to === undefined ? all : lead + to;
  });
}

/** The snapshot key of a text: its issue's old number and the body or the snapshot comment's id. */
const textKey = (old, commentId = null) => (commentId === null ? `${old}:body` : `${old}:comment:${commentId}`);

/** A digest of an original text, which binds a journaled gate answer to the text it answered. */
const digestOf = (text) => createHash("sha256").update(text ?? "").digest("hex");

/**
 * GitHub's reading of every snapshot text with a possible reference, by
 * text key. Each answer is journaled with a digest of the text it read, so
 * a rerun of the rewrite, and the verify after it, reuse it only for the
 * same text. A render that failed is not an answer: it is not journaled,
 * the text is not rewritten in this run, and the next run asks again.
 */
async function referenceGate(tracker, repos, snapshot, journal, log = () => {}) {
  const journaled = new Map();
  for (const r of journal.of("reference-check")) if (typeof r.consistent === "boolean" && Array.isArray(r.tokens)) journaled.set(r.key, r);
  const { pool } = await standInPool(tracker, repos, snapshot);
  const texts = snapshot.issues.flatMap((i) => [{ key: textKey(i.number), text: i.body }, ...(i.thread ?? []).map((c) => ({ key: textKey(i.number, c.id), text: c.body }))]);
  const gate = new Map();
  let renders = 0;
  for (const { key, text } of texts) {
    if (![...(text ?? "").matchAll(BARE_REF)].length) continue;
    const digest = digestOf(text);
    const known = journaled.get(key);
    if (known && known.digest === digest) {
      gate.set(key, known);
      continue;
    }
    try {
      const { renders: used, ...answer } = await githubReferences(tracker, repos, text, pool);
      renders += used;
      gate.set(key, journal.append({ mode: "reference-check", key, digest, ...answer }));
      if (!answer.consistent) log(`GitHub's two renders of ${key} disagree; it is left as transferred`);
    } catch (error) {
      gate.set(key, { key, unanswered: true, reason: error.message });
      log(`could not ask GitHub about ${key}: ${error.message}; it is not rewritten in this run`);
    }
  }
  return { gate, renders };
}

/**
 * A body with the migration line the transfer step appended restored,
 * where GitHub's own rewrite of the moved text qualified its reference,
 * and nothing else changed. That line is the body's last non-blank line;
 * a line of the same shape the author wrote earlier is left alone.
 */
function withExactMigrationLine(body, line) {
  const lines = (body ?? "").split(/\r?\n/);
  let k = lines.length - 1;
  while (k >= 0 && !lines[k].trim()) k--;
  if (k < 0 || !/^Migrated from \S+#\d+(; originally closed \d{4}-\d{2}-\d{2})?$/.test(lines[k].trim())) return withMigrationLine(body, line);
  lines[k] = line;
  return lines.join("\n");
}

/** A body without its migration line, which names the old address the render check does not compare. */
function withoutMigrationLine(body, line) {
  return (body ?? "")
    .split(/\r?\n/)
    .filter((l) => l.trim() !== line)
    .join("\n")
    .replace(/\s+$/, "");
}

/** Each migrated body and comment with a possible reference: its original from the snapshot and its text now. */
async function renderPairs(tracker, repos, snapshot, map) {
  const current = await gatherInternal(tracker, repos, snapshot, map, { links: false, threads: true });
  const targets = targetTexts(snapshot, map, repos);
  const pairs = [];
  const possible = (t) => [...(t ?? "").matchAll(BARE_REF)].length > 0;
  for (const issue of snapshot.issues) {
    const now = current.byOld.get(issue.number);
    if (!now) continue;
    const n = now.issue.number;
    const final = withoutMigrationLine(now.issue.body, migrationLine(repos, issue));
    if (possible(issue.body) || possible(final)) pairs.push({ old: issue.number, new: n, key: `body:${n}`, original: issue.body ?? "", final });
    const { pairs: comments } = pairThread(targets.get(issue.number).thread, now.thread);
    for (const p of comments) {
      const original = (issue.thread ?? []).find((c) => c.id === p.expected.id)?.body ?? "";
      if (possible(original) || possible(p.actual.body)) pairs.push({ old: issue.number, new: n, key: `comment:${p.actual.id}`, original, final: p.actual.body ?? "" });
    }
  }
  return pairs;
}

/** Renders a migration must make for the render check: two per text with a possible reference. */
export function renderCount(snapshot) {
  const possible = (t) => [...(t ?? "").matchAll(BARE_REF)].length > 0;
  return 2 * snapshot.issues.reduce((sum, i) => sum + [i.body, ...(i.thread ?? []).map((c) => c.body)].filter(possible).length, 0);
}

/**
 * Checks the rewritten references with GitHub's renderer, independent of the
 * tool's own Markdown reading. For each migrated text with a possible
 * reference, the original is rendered in the code repository's context with
 * its possible references replaced by pull request numbers, one per number
 * so that labels and definitions stay equal (a moved issue's old number
 * renders no link in either repository after the transfer, but a pull
 * request never moves); the links GitHub renders on those stand-ins,
 * mapped through the map (a migrated ticket to its new internal number, a
 * pull request or kept public issue to the code repository; a number the
 * code repository never had to no link), together with every other link
 * GitHub renders there, are the links the final text must render, in order,
 * in the internal repository's context. A reference the rewrite left with
 * its old number, mapped where GitHub reads code, or mapped wrongly, is a
 * difference.
 */
export async function renderCheck(tracker, repos, snapshot, map) {
  const { pulls, pool } = await standInPool(tracker, repos, snapshot);
  const kept = new Set(snapshot.kept);
  const image = (n) => (map.has(n) ? `${repos.internal.toLowerCase()}#${map.get(n)}` : pulls.has(n) || kept.has(n) ? `${repos.code.toLowerCase()}#${n}` : null);
  const differences = [];
  const checked = [];
  let renders = 0;
  for (const pair of await renderPairs(tracker, repos, snapshot, map)) {
    let stand;
    try {
      stand = withSentinels(pair.original, pool, { perNumber: true });
    } catch (error) {
      differences.push({ old: pair.old, new: pair.new, field: `linked references of ${pair.key}`, expected: "a render check", actual: error.message });
      continue;
    }
    const bySentinel = new Map(stand.tokens.map((t) => [`${repos.code.toLowerCase()}#${t.sentinel}`, t.number]));
    const expected = [];
    for (const link of renderedLinks(await tracker.renderMarkdown(stand.text, repos.code))) {
      if (!bySentinel.has(link)) expected.push(link);
      else if (image(bySentinel.get(link))) expected.push(image(bySentinel.get(link)));
    }
    const actual = renderedLinks(await tracker.renderMarkdown(pair.final, repos.internal));
    renders += 2;
    checked.push({ key: pair.key, expected, actual });
    if (!isDeepStrictEqual(expected, actual)) differences.push({ old: pair.old, new: pair.new, field: `linked references of ${pair.key}`, expected, actual });
  }
  return { differences, renders, checked };
}

/** What the render check compared, for the report: texts, renders, links and each text's lists. */
function renderSummary(result) {
  return { texts: result.checked.length, renders: result.renders, links: result.checked.reduce((n, c) => n + c.expected.length, 0), differences: result.differences.length, checked: result.checked };
}

/**
 * Compares the internal repository with the snapshot field by field;
 * compares every migrated body and comment with its rewritten original (so
 * a body without its migration line, a bare reference to an old number, or
 * a reference the transfer qualified and the rewrite did not restore, is a
 * difference); checks the references GitHub links in each of them against
 * the original through the map with the render check, which does not rely
 * on the tool's own Markdown reading; and, for the migration, checks that
 * the public issue list
 * holds exactly the kept issues and that every open pull request's closing
 * references name the internal repository. Returns the differences.
 */
export async function runVerify({ tracker, repos, snapshot, journal, report = {} }) {
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
  // The rewrite's journaled gate says which texts it left as transferred; a gate it never ran is run here.
  const { gate } = await referenceGate(tracker, repos, snapshot, journal);
  const texts = await textDifferences(tracker, repos, snapshot, map, gate);
  report.leftAsTransferred = texts.leftAsTransferred;
  // A text left as transferred keeps whatever GitHub's transfer did to it, code included, so nothing here can vouch for it.
  for (const t of texts.leftAsTransferred) differences.push({ old: t.old, new: t.new, field: `left as transferred: ${t.key}`, expected: "a text the rewrite set from its original", actual: `${t.reason}; read it by hand` });
  for (const d of texts) {
    if (d.mismatch) differences.push({ old: d.old, new: d.new, field: "comment thread", expected: "the snapshot's comments in order", actual: d.mismatch });
    else differences.push({ old: d.old, new: d.new, field: `text of ${d.key}`, expected: { bareReferences: bareRefs(d.expected) }, actual: { bareReferences: bareRefs(d.actual), oldQualifiedReferences: staleRefs(d.actual, repos, map), migrationLine: d.key.startsWith("body:") ? hasLine(d.actual, migrationLine(repos, snapshot.issues.find((i) => i.number === d.old))) : undefined } });
  }
  const rendered = await renderCheck(tracker, repos, snapshot, map);
  differences.push(...rendered.differences);
  report.renderCheck = renderSummary(rendered);
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
  const verified = {};
  const differences = await runVerify({ tracker, repos, snapshot, journal, report: verified });
  writeJson(path.join(dir, "verify-report.json"), differences);
  writeJson(path.join(dir, "render-check.json"), verified.renderCheck);
  const cleanup = keep ? "kept; rerun with --rehearsal --cleanup to delete" : await rehearsalCleanup({ tracker, repos, journal, log });
  const { checked, ...renderCheck } = verified.renderCheck;
  return { survival: report, restored, rewritten, verify: differences.length ? differences : "passed", renderCheck, leftAsTransferred: verified.leftAsTransferred, cleanup };
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
    print({ mode: "snapshot", dryRun: opts.dryRun, file: opts.dryRun ? null : file, ...summary, transferEstimate: { ...transfer.requests, hours: Number(estimateHours(transfer.requests, budgets).toFixed(1)) }, rewriteEstimate: { gateRenders: renderCount(snapshot), hours: Number(estimateHours({ reads: renderCount(snapshot), writes: summary.textsWithBareReferences }, budgets).toFixed(1)) }, verifyEstimate: { renders: renderCount(snapshot), hours: Number(estimateHours({ reads: renderCount(snapshot), writes: 0 }, budgets).toFixed(1)) }, requestsMade: pacer.total });
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
  } else if (opts.mode === "rewrite") {
    const result = await runRewrite(args);
    if (!opts.dryRun) writeJson(path.join(opts.dir, "left-as-transferred.json"), result.leftAsTransferred);
    print({ mode: "rewrite", ...result, requestsMade: pacer.total });
  } else if (opts.mode === "map") print({ mode: "map", ...(await runMap(args)), requestsMade: pacer.total });
  else if (opts.mode === "verify") {
    const verified = {};
    const differences = await runVerify({ ...args, report: verified });
    if (!opts.dryRun) {
      writeJson(path.join(opts.dir, "verify-report.json"), differences);
      writeJson(path.join(opts.dir, "render-check.json"), verified.renderCheck);
      writeJson(path.join(opts.dir, "left-as-transferred.json"), verified.leftAsTransferred);
    }
    const { checked, ...renderCheck } = verified.renderCheck;
    print({ mode: "verify", passed: differences.length === 0, differences, renderCheck, leftAsTransferred: verified.leftAsTransferred, requestsMade: pacer.total });
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
