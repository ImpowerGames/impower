import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, realpathSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { readReports } from './feedback-reports.mjs';
import { hydrateReports, persistReports, prepareReports, inspectReportsArchive } from './feedback-archive.mjs';

const REPO = 'ImpowerGames/impower';
const INBOX = 510;
const PLAN_VERSION = 4;
const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 20);
const clean = value => value.replace(/\r\n/g, '\n').trim();
const CELL = '<!-- skill-feedback-cell:v2 -->';
const decode = value => value.startsWith(CELL)
  ? value.slice(CELL.length).replace(/<br>/g, '\n').replace(/&(?:amp|lt|gt|#\d+);/g, entity => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>' })[entity] ?? String.fromCodePoint(Number(entity.slice(2, -1))))
  : value.replace(/<br\s*\/?>/gi, '\n').replace(/&#124;/g, '|');
const literalDisplay = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\r\\`*_\[\]~|]/g, char => `&#${char.codePointAt(0)};`).replace(/\n/g, '<br>');
const statusPattern = /^(open|ticketed #[1-9]\d*|applied in PR #[1-9]\d*)$/;
const canonicalRows = rows => rows.map(({ skill, friction, edit, status, problemId, sessions, historyIncomplete }) => ({ skill, friction, edit, status, problemId, sessions, historyIncomplete }));
const closedUnmerged = pr => pr?.state === 'closed' && !pr.merged_at;
const appliedUnmerged = (status, references) => closedUnmerged(references.prs[status.match(/^applied in PR #(\d+)$/)?.[1]]);
const taskOf = status => Number(status?.match(/^ticketed #(\d+)$/)?.[1]) || null;
const reportCount = row => `${row.sessions.length} recorded${row.historyIncomplete ? '; history incomplete' : ''}`;
const reportExcerpt = text => { const points = Array.from(text); return points.length > 300 ? points.slice(0, 300).join('') + '\n[Full history in Reports archive.]' : text; };
const groupMarker = rows => `Feedback group: ${hash(JSON.stringify(canonicalRows(rows)))}`;
// A row needs a group when it has no Task yet or carries a new observation for its Task.
const needsGroup = row => row.status === 'open' || Boolean(row.observations?.length);
const DEFER_REMOVED = 'The defer action was removed by #947: every counted problem is filed as a workflow: skills Task attached to #510. Group the problem as ticket, existing or applied; close an unwanted Task as not planned.';

function fencedAt(body, offset = body.length) {
  let fence;
  for (const line of body.slice(0, offset).split('\n')) {
    const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (!match) continue;
    if (!fence) {
      if (match[1][0] !== '`' || !match[2].includes('`')) fence = match[1];
    } else if (match[1][0] === fence[0] && match[1].length >= fence.length && !match[2].trim()) fence = undefined;
  }
  return Boolean(fence);
}

function requireClosedFences(body) {
  if (fencedAt(body)) throw new Error('Triage requires closed code fences in the inbox body; close the unfinished fence before planning. Its contents remain untouched.');
}

function refusePendingFoldedIntake(body, comments) {
  const normalized = body.replace(/\r\n/g, '\n');
  const pending = new Set(comments.map(comment => String(comment.id)));
  for (const match of normalized.matchAll(/^<!-- skill-feedback-triage:[a-f0-9]{20} -->\nFolded \d+ intake comments \(([^)]*)\);/gm)) {
    if (fencedAt(normalized, match.index)) continue;
    const folded = match[1].split(',').map(id => id.trim()).filter(id => /^\d+$/.test(id) && pending.has(id));
    if (folded.length) throw new Error(`Intake ${folded.join(', ')} is already recorded as folded but remains live. Preserve the original plan and saved body artifacts; reconcile the interrupted cleanup before making a fresh plan. No intake was folded or deleted.`);
  }
}

function stripSummaryBlocks(body) {
  body = body.replace(/\r\n/g, '\n');
  return body.replace(/^<!-- skill-feedback-triage:[a-f0-9]{20} -->\nFolded (?:(?!\n<!-- skill-feedback-triage:)[\s\S])*?\n<!-- skill-feedback-state:[a-f0-9]{20} -->\n?/gm,
    (block, offset) => fencedAt(body, offset) ? block : '');
}

export function keyOf(skill) {
  const value = clean(skill).toLowerCase().replace(/[`*]/g, '').replace(/\s+/g, ' ');
  const numbered = value.match(/^([a-z0-9_-]+(?:\.[a-z0-9_-]+)*)(?:,\s*|\s+)(?:in\s+)?section\s+(\d+(?:\.\d+)*)(?:\s+\([^()]*\))?\.?$/);
  return numbered ? `${numbered[1]}, section ${numbered[2]}` : value.replace(/\.$/, '');
}

// Targets whose reports predate problem IDs; a counted problem at one of them has an incomplete count.
function historicalTargets(body) {
  body = body.replace(/\r\n/g, '\n');
  const matches = [...body.matchAll(/^<!-- skill-feedback-history:v1 ([A-Za-z0-9+/=]+) -->$/gm)].filter(match => !fencedAt(body, match.index));
  const markers = [...body.matchAll(/<!-- skill-feedback-history/g)].filter(match => !fencedAt(body, match.index));
  if (markers.length !== matches.length) throw new Error('Malformed historical-target marker; preserve the saved history before triage.');
  if (matches.length > 1) throw new Error('Multiple historical-target markers; reconcile the saved history before triage.');
  let saved = [];
  if (matches.length) {
    const bytes = Buffer.from(matches[0][1], 'base64');
    const json = bytes.toString('utf8');
    try { saved = JSON.parse(json); } catch { throw new Error('Invalid historical-target history; preserve the body and reconcile it.'); }
    if (bytes.toString('base64') !== matches[0][1] || !Buffer.from(json).equals(bytes) || JSON.stringify(saved) !== json || !Array.isArray(saved) || saved.some(value => typeof value !== 'string') || new Set(saved).size !== saved.length) throw new Error('Invalid historical-target history; preserve the body and reconcile it.');
  }
  return new Set(saved);
}

function cells(line) {
  return line.trim().slice(1, -1).split(/(?<!\\)\|/).map(s => decode(s.trim().replace(/\\\|/g, '|')));
}

// Reads the table an inbox body carries before its first triage under the sub-issue model.
// Every row must name an archived problem; apply retires the rows into the archive and removes the table.
export function parseLegacyTable(body, savedLedger) {
  const normalized = body.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const candidates = [];
  let offset = 0;
  for (const [index, line] of lines.entries()) {
    if (/^\|\s*Skill, section\s*\|/.test(line) && !fencedAt(normalized, offset)) candidates.push(index);
    offset += line.length + 1;
  }
  if (!candidates.length) return null;
  if (candidates.length > 1) throw new Error('Multiple inbox tables outside code fences; identify the real one before triage.');
  const start = candidates[0];
  if (!/^\|\s*Skill, section\s*\|\s*Friction\s*\|\s*Proposed edit\s*\|\s*Status\s*\|\s*Problem\s*\|\s*Reports\s*\|\s*$/.test(lines[start]) || !/^\|(?:\s*:?-+:?\s*\|){6}\s*$/.test(lines[start + 1] || '')) throw new Error('Inbox table contract not recognized; only the six-column counted table can be retired into the archive.');
  const ledger = savedLedger ?? readReports(body, fencedAt);
  const rows = [];
  let end = start + 2;
  while (lines[end]?.trim().startsWith('|')) {
    const row = cells(lines[end]);
    if (row.length !== 6 || row.some(v => !v.trim()) || !statusPattern.test(row[3])) throw new Error(`Invalid inbox row at line ${end + 1}; nothing will be folded.`);
    const saved = /^F-[1-9]\d*$/.test(row[4]) && Object.hasOwn(ledger, row[4]) ? ledger[row[4]] : null;
    if (!saved) throw new Error(`Table row at line ${end + 1} names ${row[4]}, which is not an archived problem; only counted rows can be retired into the archive.`);
    const entry = { skill: row[0], friction: row[1], edit: row[2], status: row[3] };
    if (entry.status !== saved.status) throw new Error(`Status for ${row[4]} is ${entry.status} in the table but ${saved.status} in the archive; reconcile them before planning.`);
    if (keyOf(entry.skill) !== keyOf(saved.skill)) throw new Error(`Skill for ${row[4]} does not match its saved problem; reconcile the identity before planning.`);
    for (const field of ['friction', 'edit']) {
      if (entry[field] !== saved[field] && entry[field] !== reportExcerpt(saved[field])) throw new Error(`Text for ${row[4]} differs from its saved history; reconcile the archive before planning.`);
      entry[field] = saved[field];
    }
    if (rows.some(previous => previous.problemId === row[4])) throw new Error(`Duplicate problem ${row[4]} in the table; resolve it before triage.`);
    Object.assign(entry, { problemId: row[4], sessions: [...saved.sessions], historyIncomplete: saved.historyIncomplete });
    if (row[5] !== reportCount(entry)) throw new Error(`Reports for ${entry.problemId} do not match the saved session references.`);
    rows.push(entry);
    end++;
  }
  return { lines, start, end, rows };
}

function removeLegacyTable(body, ledger) {
  const table = parseLegacyTable(body, ledger);
  if (!table) return body;
  table.lines.splice(table.start, table.end - table.start);
  return table.lines.join('\n');
}

export function parseIntake(comment) {
  const text = clean(comment.body);
  if (/^<!-- skill-feedback-(?:triage|archive|archive-index):/.test(text)) return null;
  if (fencedAt(text)) throw new Error(`Comment ${comment.id} has an unclosed code fence; close it before triage. Intake remains intact.`);
  const labels = [...text.matchAll(/^(?:\*\*)?(Problem|Session|Skill and section|What happened|Proposed edit)(?:\*\*)?:(?:\*\*)?\s*/gm)].filter(field => !fencedAt(text, field.index));
  const names = labels.map(field => field[1]);
  if (names.join('|') !== 'Problem|Session|Skill and section|What happened|Proposed edit') {
    const distinct = [...new Set(names)];
    const repeated = distinct.filter(name => names.filter(value => value === name).length > 1);
    throw new Error(`Comment ${comment.id} does not match the inbox intake contract: found ${distinct.length} of 5 distinct required labels across ${names.length} occurrences (${names.join(', ') || 'none'}), listed in the order found; repeated labels: ${repeated.join(', ') || 'none'}. Every report needs Problem, Session, Skill and section, What happened, Proposed edit in that order; put quoted field-label examples inside a closed code fence or an indented quote. Leave it intact and distinguish ordinary discussion.`);
  }
  const values = labels.map((field, i) => text.slice(field.index + field[0].length, labels[i + 1]?.index ?? text.length).trim());
  const [problem, session, skill, friction, edit] = values;
  if (values.some(value => !value) || /[\r\n\u0085\u2028\u2029]/u.test(session) || session.length > 200 || !/^(new|F-[1-9]\d*)$/.test(problem) || !Number.isSafeInteger(comment.id) || comment.id < 1) throw new Error(`Comment ${comment.id} has an invalid problem or session reference, or empty field.`);
  return { skill, friction, edit, status: 'open', problemId: problem === 'new' ? `F-${comment.id}` : problem, session, newProblem: problem === 'new' };
}

export function fold(body, comments, references = { prs: {}, issues: {} }, savedLedger) {
  const ledger = savedLedger ?? readReports(body, fencedAt);
  const table = parseLegacyTable(body, ledger);
  const rows = [];
  const byId = new Map();
  const track = row => { rows.push(row); byId.set(row.problemId, row); return row; };
  for (const row of table?.rows || []) track(row);
  // An archived problem still marked open, or applied in a pull request that closed unmerged, has no Task, so this triage files one.
  for (const [id, saved] of Object.entries(ledger)) if ((saved.status === 'open' || appliedUnmerged(saved.status, references)) && !byId.has(id)) track({ ...structuredClone(saved) });
  const folded = [];
  const ignored = [];
  const skipped = [];
  for (const comment of comments) {
    try {
      const report = parseIntake(comment);
      if (!report) {
        if (!/^<!-- skill-feedback-archive(?:-index)?:/.test(clean(comment.body))) skipped.push({ id: comment.id, body: comment.body, reason: 'Marker-prefixed comment; inspect whether it is a triage summary or discussion. Left intact.' });
        continue;
      }
      const saved = byId.get(report.problemId) || ledger[report.problemId];
      if (!saved && !report.newProblem) throw new Error(`Unknown problem ${report.problemId}; reference a counted problem or report a distinct new one.`);
      if (saved && keyOf(saved.skill) !== keyOf(report.skill)) throw new Error(`Skill for ${report.problemId} does not match its saved problem.`);
      if (!saved) {
        track({ skill: report.skill, friction: report.friction, edit: report.edit, status: 'open', problemId: report.problemId, sessions: [report.session], historyIncomplete: false });
      } else {
        const row = byId.get(report.problemId) || track({ ...structuredClone(saved) });
        // A merged edit that did not stop the problem needs a new Task; an unmerged one still carries its proposal.
        if (row.status.startsWith('applied in PR #') && !row.previousStatus) {
          row.previousStatus = row.status;
          const prefix = `Earlier feedback (${row.status}; context only):\n`;
          if (appliedUnmerged(row.status, references)) row.previousUnmerged = true;
          else for (const field of ['friction', 'edit']) if (!row[field].startsWith(prefix)) row[field] = prefix + row[field];
          row.status = 'open';
        }
        (row.observations ||= []).push({ id: comment.id, friction: report.friction, edit: report.edit });
        for (const field of ['friction', 'edit']) row[field] += `\n\nSeen again (intake #${comment.id}):\n${report[field]}`;
        if (!row.sessions.includes(report.session)) row.sessions.push(report.session);
      }
      folded.push(comment);
    } catch (error) { ignored.push({ id: comment.id, body: comment.body, reason: error.message }); }
  }
  const historical = historicalTargets(body);
  for (const row of rows) if (historical.has(keyOf(row.skill))) row.historyIncomplete = true;
  return { rows, folded, ignored, skipped, migrated: table ? table.rows.length : 0 };
}

export function makePlan(body, comments, references = { prs: {}, issues: {} }, savedLedger) {
  requireClosedFences(body);
  refusePendingFoldedIntake(body, comments);
  const ledger = savedLedger ?? readReports(body, fencedAt);
  const { rows, folded, ignored, skipped, migrated } = fold(body, comments, references, ledger);
  for (const row of rows) {
    if (appliedUnmerged(row.status, references)) {
      row.previousStatus = row.status;
      row.previousUnmerged = true;
      row.status = 'open';
    }
  }
  const groups = new Map();
  for (const row of rows.filter(needsGroup)) {
    const task = taskOf(row.status);
    const key = task ? `existing:${task}` : `ticket:${row.problemId}`;
    if (!groups.has(key)) groups.set(key, task
      ? { action: 'existing', number: task, keys: [], context: '' }
      : { action: 'ticket', title: `Address ${row.skill.split(',')[0].split('\n')[0].trim()} feedback ${row.problemId} from the skills inbox`, keys: [], context: '' });
    groups.get(key).keys.push(row.problemId);
  }
  const pending = rows.filter(needsGroup);
  const priorities = pending.map(row => ({ key: row.problemId, skill: row.skill, task: taskOf(row.status), reports: row.sessions.length, historyIncomplete: row.historyIncomplete })).sort((a, b) => b.reports - a.reports);
  const possibleDuplicates = pending.flatMap(row => rows.filter(other => other !== row && keyOf(row.skill) === keyOf(other.skill) && (!needsGroup(other) || rows.indexOf(other) > rows.indexOf(row)))
    .map(other => ({ keys: [row.problemId, other.problemId], reason: 'Same skill target; inspect the observations before grouping work. Counts remain separate unless reports explicitly name the same problem.' })));
  return { version: PLAN_VERSION, repo: REPO, inbox: INBOX, body, comments: folded, ignored, skipped, references, rows, migrated, priorities, possibleDuplicates, reportHistory: ledger, groups: [...groups.values()] };
}

export async function readPlan(api) {
  const body = (await api.inbox()).body;
  requireClosedFences(body);
  const comments = await api.comments();
  const archive = inspectReportsArchive(body, comments, fencedAt);
  const ledger = archive.problems;
  refusePendingFoldedIntake(body, comments);
  const references = { prs: {}, issues: {} };
  // Every applied problem's pull request is read so one that closed unmerged is filed even without new intake.
  // Other archived Tasks stay out of the references, so their state changes cannot invalidate the plan.
  const statuses = [...Object.values(ledger).map(row => row.status).filter(status => status.startsWith('applied in PR #')), ...fold(body, comments, undefined, ledger).rows.flatMap(row => [row.status, row.previousStatus])];
  for (const status of statuses) {
    const match = status?.match(/^(ticketed|applied in PR) #(\d+)$/);
    if (!match) continue;
    const [, kind, number] = match;
    const bucket = kind === 'ticketed' ? references.issues : references.prs;
    if (bucket[number]) continue;
    const item = await (kind === 'ticketed' ? api.issue(Number(number)) : api.pr(Number(number)));
    bucket[number] = kind === 'ticketed' ? { state: item.state } : { state: item.state, merged_at: item.merged_at };
  }
  return { ...makePlan(body, comments, references, ledger), archive: { index: archive.index, chunks: archive.chunks, superseded: archive.superseded } };
}

export async function lookupReports(api, problemId) {
  const body = (await api.inbox()).body;
  const comments = await api.comments();
  const archive = inspectReportsArchive(body, comments, fencedAt);
  if (problemId && !Object.hasOwn(archive.problems, problemId)) throw new Error(`Unknown archived problem ${problemId}; inspect pending intake or run reports without an ID.`);
  const pending = comments.flatMap(comment => {
    let reason;
    try { if (!parseIntake(comment)) return []; } catch (error) { reason = error.message; }
    if (problemId && !new RegExp(`\\b${problemId}\\b`).test(comment.body)) return [];
    const points = Array.from(comment.body);
    return [{ id: comment.id, html_url: comment.html_url, body: problemId ? comment.body : points.slice(0, 1200).join(''), ...(points.length > 1200 && !problemId ? { truncated: true } : {}), ...(reason ? { reason } : {}) }];
  });
  const reports = problemId
    ? [{ ...archive.problems[problemId], task: taskOf(archive.problems[problemId].status) }]
    : Object.values(archive.problems).map(row => ({ problemId: row.problemId, task: taskOf(row.status), skill: row.skill, status: row.status, reports: row.sessions.length, historyIncomplete: row.historyIncomplete, friction: reportExcerpt(row.friction), edit: reportExcerpt(row.edit) }));
  return { reports, pending, archive: { index: archive.index, chunks: archive.chunks, superseded: archive.superseded } };
}

// A recurrence posted to its recorded Task carries only the new observations; a new Task carries the whole record.
const onlyObservations = row => Boolean(row.observations?.length && taskOf(row.status));
function description(rows) {
  return rows.map(row => `### ${row.skill} (${row.problemId}; ${reportCount(row)})\n\n` + (onlyObservations(row)
    ? row.observations.map(item => `Intake #${item.id}:\n\n${item.friction}\n\nProposed change: ${item.edit}`).join('\n\n')
    : `${row.friction}\n\nProposed change: ${row.edit}`)).join('\n\n');
}

function referenceContext(rows, context, target) {
  const references = [
    ...rows.filter(row => row.previousStatus).map(row => `Previous reference for ${row.problemId}: ${row.previousStatus}${row.previousUnmerged ? '; the pull request closed without merging; its proposal remains actionable' : ''}.`),
    ...rows.filter(row => taskOf(row.status) && taskOf(row.status) !== target).map(row => `Recorded Task for ${row.problemId}: #${taskOf(row.status)}.`),
  ];
  return [...references, context].filter(Boolean).join('\n\n');
}

function evidenceBody(rows, marker, context, target) {
  context = referenceContext(rows, context, target);
  return `## Feedback from #510\n\n${description(rows)}${context ? `\n\n## Additional context\n\n${context}` : ''}\n\n${marker}\n`;
}

function ticketBody(rows, marker, context) {
  context = referenceContext(rows, context);
  return `## Description\n\n${description(rows)}\n\n## Motivation\n\nThese items were observed while following the repository skills and collected in #510.\n\n## Scope\n\nAddress the items above. Prefer a checked mechanism for preventable mistakes; confirm prose proposals against current code and instructions before applying them.\n\n## Acceptance criteria\n\n- [ ] Each item above is fixed or explicitly adjudicated.\n- [ ] Any mechanism has a failing-then-passing check and the standalone checks pass.\n- [ ] Skill text describes current behavior and the pull request lists applied feedback.\n\n## Additional context\n\nFiled by the hand-invoked triage-skill-feedback run for #510.${context ? `\n\n${context}` : ''}\n\n${marker}\n`;
}

export function preview(plan) {
  return plan.groups.map(group => {
    if (group.action === 'defer') throw new Error(DEFER_REMOVED);
    const rows = plan.rows.filter(row => group.keys.includes(row.problemId));
    const closed = group.action === 'existing' && plan.references?.issues?.[group.number]?.state === 'closed' && reopensOwnTask(group, plan.rows);
    return { ...group, ...(closed ? { reopen: true } : {}), body: group.action === 'ticket' ? ticketBody(rows, groupMarker(rows), group.context) : group.action === 'existing' ? evidenceBody(rows, groupMarker(rows), group.context, group.number) : undefined };
  });
}

function summaryText(plan, marker, rows, filed, applied, elsewhere = []) {
  const history = [...historicalTargets(plan.body)];
  const mapped = rows.map(row => `${row.problemId} → ${taskOf(row.status) ? `#${taskOf(row.status)}` : row.status}`);
  return `${marker}\nFolded ${plan.comments.length} intake comments (${plan.comments.map(c => c.id).join(', ') || 'none'}); filed or linked ${filed.join(', ') || 'none'}; applied ${applied.join(', ') || 'none'}; left unparsed comments ${(plan.ignored || []).map(c => c.id).join(', ') || 'none'} intact (reasons in the plan); left marker-prefixed comments ${(plan.skipped || []).map(c => c.id).join(', ') || 'none'} intact (inspect skipped IDs and bodies in the plan).${plan.migrated ? ` Retired ${plan.migrated} table rows into the archive.` : ''}${elsewhere.length ? ` Left under another parent: ${elsewhere.join(', ')}.` : ''} Problems: ${mapped.join('; ') || 'none'}.${history.length ? `\n<!-- skill-feedback-history:v1 ${Buffer.from(JSON.stringify(history)).toString('base64')} -->` : ''}`;
}

// Attaches every open Task the triaged problems map to, then confirms the inbox's sub-issue list.
// An issue can have one parent, so an issue under another parent stays there and is reported instead of moved.
async function attachToInbox(api, rows) {
  const numbers = [...new Set(rows.map(row => taskOf(row.status)).filter(Boolean))];
  const listed = async () => new Set((await api.subIssues()).map(issue => issue.number));
  const attached = await listed();
  const elsewhere = new Map();
  const expected = [];
  for (const number of numbers) {
    if (attached.has(number)) { expected.push(number); continue; }
    const issue = await api.issue(number);
    if (issue.state === 'closed') continue;
    const parent = issue.parent_issue_url?.match(/\/repos\/([^/]+\/[^/]+)\/issues\/(\d+)$/);
    if (issue.parent_issue_url && !(parent?.[1] === REPO && Number(parent[2]) === INBOX)) { elsewhere.set(number, `#${number} (parent ${parent ? `${parent[1]}#${parent[2]}` : issue.parent_issue_url})`); continue; }
    if (!issue.parent_issue_url) await api.addSubIssue(issue.id);
    expected.push(number);
  }
  const confirmed = await listed();
  const missing = expected.filter(number => !confirmed.has(number));
  if (missing.length) throw new Error(`${missing.map(number => `#${number}`).join(', ')} is not listed as a sub-issue of #${INBOX} after attaching; no intake deleted. Inspect the sub-issue list and retry the same plan.`);
  return [...elsewhere.values()];
}

// A closed Task is reopened only for the problems it already records.
const reopensOwnTask = (group, rows) => group.action === 'existing' && rows.filter(row => group.keys.includes(row.problemId)).every(row => taskOf(row.status) === group.number);

// The adapter makes persistence ordering testable without touching GitHub.
export async function applyPlan(plan, api) {
  if (plan.groups?.some(group => group.action === 'defer')) throw new Error(DEFER_REMOVED);
  if (plan.version !== PLAN_VERSION || plan.repo !== REPO || plan.inbox !== INBOX) throw new Error('Wrong plan version or inbox; retain the original script for interrupted plans.');
  if (plan.groups.some(group => !Array.isArray(group.keys) || group.keys.length === 0)) throw new Error('Every group needs at least one problem ID; remove empty split groups before applying.');
  const keys = plan.groups.flatMap(group => group.keys);
  const pending = plan.rows.filter(needsGroup).map(row => row.problemId);
  if (keys.length !== new Set(keys).size || JSON.stringify([...keys].sort()) !== JSON.stringify([...pending].sort())) throw new Error('Every problem without a Task, and every recurrence, must occur in exactly one group.');
  for (const group of plan.groups) {
    if (!['ticket', 'applied', 'existing'].includes(group.action) || (group.action === 'ticket' ? !group.title?.trim() : (!Number.isSafeInteger(group.number) || group.number < 1))) throw new Error('Each group needs a ticket title, an existing Task number or an applied PR number.');
  }
  const run = hash(JSON.stringify({ body: plan.body, comments: plan.comments, groups: plan.groups }));
  const marker = `<!-- skill-feedback-triage:${run} -->`;
  let current = await api.inbox();
  // A completed body's marker allows retries to finish cleanup after interruption.
  const latestSummary = [...current.body.matchAll(/^<!-- skill-feedback-triage:[a-f0-9]{20} -->\r?\nFolded /gm)].findLast(match => !fencedAt(current.body, match.index));
  const resumed = Boolean(latestSummary?.[0].startsWith(marker));
  if (resumed) {
    const integrity = current.body.match(/\n<!-- skill-feedback-state:([a-f0-9]{20}) -->\n?$/);
    if (!integrity || hash(current.body.slice(0, integrity.index)) !== integrity[1]) throw new Error('Persisted inbox changed after folding; inspect it before deleting intake.');
  }
  if (!resumed && current.body !== plan.body) throw new Error('Inbox body changed since planning; create a fresh plan before writing.');
  // A Task this plan reopens may already be open when an interrupted apply is retried.
  const reopened = new Set(plan.groups.filter(group => reopensOwnTask(group, plan.rows)).map(group => String(group.number)));
  if (!resumed) for (const [kind, refs] of Object.entries(plan.references || {})) for (const [number, saved] of Object.entries(refs)) {
    const item = await (kind === 'prs' ? api.pr(Number(number)) : api.issue(Number(number)));
    const reopenedByPlan = kind === 'issues' && reopened.has(number) && saved.state === 'closed' && item.state === 'open';
    if ((item.state !== saved.state && !reopenedByPlan) || (kind === 'prs' && item.merged_at !== saved.merged_at)) throw new Error(`Referenced ${kind} #${number} changed since planning; read a fresh plan.`);
  }
  const currentComments = await api.comments();
  const liveLedger = hydrateReports(current.body, currentComments, fencedAt);
  if (!resumed && JSON.stringify(liveLedger) !== JSON.stringify(plan.reportHistory)) throw new Error('Reports history changed since planning; preserve the plan and inspect the archive.');
  if (!resumed) refusePendingFoldedIntake(current.body, currentComments);
  for (const comment of plan.comments) {
    const live = currentComments.find(c => c.id === comment.id);
    if ((!live && !resumed) || (live && live.body !== comment.body)) throw new Error(`Intake ${comment.id} changed since planning; nothing can be deleted from this plan.`);
  }
  let summary;
  if (!resumed) {
    const expected = makePlan(plan.body, plan.comments, plan.references, liveLedger).rows;
    if (JSON.stringify(plan.rows) !== JSON.stringify(expected)) throw new Error('Plan rows differ from the current parser; keep the original plan for recovery and inspect any earlier tickets before creating a fresh plan with existing decisions.');
    const rows = expected.map(row => ({ ...row }));
    const largest = `#${Number.MAX_SAFE_INTEGER}`;
    const projectedRows = rows.map(row => ({ ...row, status: `ticketed ${largest}` }));
    prepareReports({ ...liveLedger, ...Object.fromEntries(canonicalRows(projectedRows).map(row => [row.problemId, row])) });
    // The body carries prose, the archive pointer and one summary; GitHub refuses an issue body or comment over 65,536 characters.
    // Every Task number, reopen note and foreign parent is counted at its largest so the refusal comes before any write.
    const appliedContext = group => literalDisplay(referenceContext(rows.filter(row => group.keys.includes(row.problemId)), ''));
    const projectedSummary = summaryText(plan, marker, projectedRows.map(row => ({ ...row, status: `applied in PR ${largest}` })), plan.groups.map(() => `${largest} (existing, reopened)`), plan.groups.map(group => `${largest} (${appliedContext(group)})`), projectedRows.map(() => `${largest} (parent ${REPO}${largest})`));
    const projectedBody = removeLegacyTable(stripSummaryBlocks(plan.body), liveLedger).trimEnd().length + projectedSummary.length + 512;
    if (projectedBody > 65536 || projectedSummary.length > 65536) throw new Error(`The inbox body would reach ${projectedBody} characters and the summary comment ${projectedSummary.length}, over GitHub's 65,536-character limit. No tickets or intake were changed; shorten the inbox prose before planning again.`);
    const filed = [], applied = [];
    const allIssues = await api.issues();
    for (const group of plan.groups) {
      const grouped = rows.filter(row => group.keys.includes(row.problemId));
      let number = group.number;
      if (group.action === 'ticket') {
        const ticketMarker = groupMarker(grouped);
        const expectedBody = ticketBody(grouped, ticketMarker, group.context);
        const matches = allIssues.filter(issue => !issue.pull_request && issue.body?.includes(ticketMarker));
        if (matches.length > 1) throw new Error('Multiple tickets carry a group recovery marker; inspect them before retrying.');
        const ticket = matches[0] || await api.createTicket(group.title, expectedBody);
        number = ticket.number;
        const readback = await api.issue(number);
        if (readback.type?.name !== 'Task' || !readback.labels.some(label => label.name === 'workflow: skills') || readback.body !== expectedBody || readback.title !== group.title) throw new Error(`Recovered ticket #${number} differs from this plan. Keep the intake; retry the same unedited plan and inspect that ticket. For deliberate changes, make a fresh plan with an existing decision for #${number}.`);
        filed.push(`#${number}`);
      } else if (group.action === 'existing') {
        const ticket = await api.issue(number);
        if (ticket.pull_request || ticket.type?.name !== 'Task' || !ticket.labels.some(label => label.name === 'workflow: skills')) throw new Error(`#${number} is not a workflow: skills Task.`);
        let reopenedNow = false;
        if (ticket.state !== 'open') {
          if (!reopensOwnTask(group, rows)) throw new Error(`Task #${number} is closed and records none of these problems; choose an open Task or file new work.`);
          await api.reopenIssue(number);
          if ((await api.issue(number)).state !== 'open') throw new Error(`Task #${number} did not reopen; preserve intake and retry the same plan.`);
          reopenedNow = true;
        }
        const evidenceMarker = groupMarker(grouped);
        const expectedEvidence = evidenceBody(grouped, evidenceMarker, group.context, number);
        const earlier = (await api.issueComments(number)).filter(comment => comment.body.includes(evidenceMarker));
        if (earlier.length > 1) throw new Error(`Multiple existing-ticket evidence comments carry this marker on Task #${number}: ${earlier.map(comment => '#' + comment.id).join(', ')}. Inspect them and preserve intake.`);
        const evidence = earlier[0] || await api.postIssueComment(number, expectedEvidence);
        const confirmed = (await api.issueComments(number)).find(comment => comment.id === evidence.id);
        if (confirmed?.body !== expectedEvidence) throw new Error(`Existing-ticket evidence failed read-back for Task #${number}, comment #${evidence.id}; preserve intake. Inspect that evidence and retry the original unedited plan with its original script version. If inbox edits require a fresh plan, copy the original group's context exactly and retain this existing target when its scope still fits; changed rows or formatting require inspection before recovery.`);
        filed.push(`#${number} (existing${reopenedNow || plan.references?.issues?.[number]?.state === 'closed' ? ', reopened' : ''})`);
      } else {
        const target = await api.pr(number);
        if (closedUnmerged(target)) throw new Error(`PR #${number} is closed and unmerged; select work that still carries the edit.`);
        const prior = referenceContext(grouped, '');
        applied.push(`#${number}${prior ? ` (${literalDisplay(prior)})` : ''}`);
      }
      for (const row of grouped) row.status = group.action === 'applied' ? `applied in PR #${number}` : `ticketed #${number}`;
    }
    // Attaching before the body is written keeps a failed attachment recoverable by retrying the same plan.
    const elsewhere = await attachToInbox(api, rows);
    summary = summaryText(plan, marker, rows, filed, applied, elsewhere);
    const prior = removeLegacyTable(stripSummaryBlocks(plan.body), liveLedger).trimEnd();
    const ledger = { ...liveLedger, ...Object.fromEntries(canonicalRows(rows).map(row => [row.problemId, row])) };
    const archived = await persistReports(prior, ledger, { comments: api.comments, postComment: api.postSummary }, fencedAt);
    const content = `${archived.trimEnd()}\n\n${summary}`;
    const updated = `${content}\n<!-- skill-feedback-state:${hash(content)} -->\n`;
    current = await api.inbox();
    if (current.body !== plan.body) throw new Error('Inbox changed during triage; tickets are recoverable by marker. Re-plan before overwriting it.');
    await api.updateBody(updated);
    if ((await api.inbox()).body !== updated) throw new Error('Inbox body read-back differs; no intake deleted.');
    // Re-reads the archive through the new body pointer; a failure here stops before any intake is deleted.
    hydrateReports(updated, await api.comments(), fencedAt);
  } else {
    summary = current.body.slice(latestSummary.index, current.body.lastIndexOf('\n<!-- skill-feedback-state:'));
  }
  // Never delete a comment until its complete content and status are persisted.
  for (const comment of plan.comments) {
    const live = (await api.comments()).find(c => c.id === comment.id);
    if (live) {
      if (live.body !== comment.body) throw new Error(`Intake ${comment.id} changed before deletion; left intact.`);
      await api.deleteComment(comment.id);
    }
  }
  const comments = await api.comments();
  if (plan.comments.some(c => comments.some(live => live.id === c.id))) throw new Error('An intake deletion did not persist.');
  let posted = comments.find(c => c.body.includes(marker));
  if (!posted) posted = await api.postSummary(summary);
  const readback = (await api.comments()).find(c => c.id === posted.id);
  if (readback?.body !== summary) throw new Error('Summary failed read-back verification.');
  return { summary, url: readback.html_url, run };
}

function github(scratch) {
  let sequence = 0;
  let directory;
  const gh = args => JSON.parse(execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, windowsHide: true }));
  const api = path => gh(['api', `repos/${REPO}/${path}`]);
  const pages = path => gh(['api', `repos/${REPO}/${path}`, '--paginate', '--slurp']).flat();
  function bodyFile(body) {
    if (!directory) { mkdirSync(scratch, { recursive: true }); directory = mkdtempSync(resolve(scratch, 'triage-bodies-')); }
    const file = resolve(directory, `body-${++sequence}.md`); writeFileSync(file, body); return file;
  }
  return {
    inbox: () => api(`issues/${INBOX}`), comments: () => pages(`issues/${INBOX}/comments?per_page=100`),
    issues: () => pages('issues?state=all&per_page=100'), issue: number => api(`issues/${number}`), pr: number => api(`pulls/${number}`),
    issueComments: number => pages(`issues/${number}/comments?per_page=100`),
    subIssues: () => pages(`issues/${INBOX}/sub_issues?per_page=100`),
    addSubIssue: id => gh(['api', '-X', 'POST', `repos/${REPO}/issues/${INBOX}/sub_issues`, '-F', `sub_issue_id=${id}`]),
    reopenIssue: number => gh(['api', '-X', 'PATCH', `repos/${REPO}/issues/${number}`, '-f', 'state=open']),
    postIssueComment: (number, body) => gh(['api', '-X', 'POST', `repos/${REPO}/issues/${number}/comments`, '-F', `body=@${bodyFile(body)}`]),
    createTicket: (title, body) => gh(['api', '-X', 'POST', `repos/${REPO}/issues`, '-f', `title=${title}`, '-F', `body=@${bodyFile(body)}`, '-f', 'type=Task', '-f', 'labels[]=workflow: skills']),
    updateBody: body => execFileSync('gh', ['issue', 'edit', String(INBOX), '--repo', REPO, '--body-file', bodyFile(body)], { encoding: 'utf8', windowsHide: true }),
    deleteComment: id => execFileSync('gh', ['api', '-X', 'DELETE', `repos/${REPO}/issues/comments/${id}`], { encoding: 'utf8', windowsHide: true }),
    postSummary: body => gh(['api', '-X', 'POST', `repos/${REPO}/issues/${INBOX}/comments`, '-F', `body=@${bodyFile(body)}`]),
  };
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const [command, file, ...extra] = process.argv.slice(2);
    const usage = 'Usage: node triage-skill-feedback.mjs reports [F-id] | plan|preview|apply <absolute-plan.json>';
    if (command === 'reports') {
      if (extra.length || (file && !/^F-[1-9]\d*$/.test(file))) throw new Error(usage);
      console.log(JSON.stringify(await lookupReports(github(tmpdir()), file), null, 2));
    } else {
    if (!['plan', 'preview', 'apply'].includes(command) || !file || extra.length) throw new Error(usage);
    if (!/^(?:[A-Za-z]:[\\/]|\/)/.test(file)) throw new Error('Use an absolute plan path outside the checkout.');
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
    const within = relative(repoRoot, resolve(file));
    if (within !== '..' && !within.startsWith(`..${sep}`) && !isAbsolute(within)) throw new Error('Keep the plan outside the checkout.');
    for (let directory = dirname(resolve(file));; directory = dirname(directory)) {
      if (existsSync(resolve(directory, '.git'))) throw new Error('Keep the plan outside every Git checkout, including other worktrees.');
      if (dirname(directory) === directory) break;
    }
    const api = github(dirname(resolve(file)));
    if (command === 'plan') {
      const plan = await readPlan(api);
      mkdirSync(dirname(resolve(file)), { recursive: true });
      writeFileSync(file, JSON.stringify(plan, null, 2) + '\n', { flag: 'wx' });
      console.log(`Plan written to ${file}: ${plan.rows.length} problems (${plan.migrated} retiring table rows), ${plan.groups.length} groups, ${plan.comments.length} intake comments, ${plan.ignored.length} unparsed and ${plan.skipped.length} marker-prefixed comments left intact. Inspect ignored/skipped IDs, bodies and reasons, then edit groups before apply.`);
    } else {
      const plan = JSON.parse(readFileSync(file, 'utf8'));
      console.log(JSON.stringify(command === 'preview' ? preview(plan) : await applyPlan(plan, api), null, 2));
    }
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
