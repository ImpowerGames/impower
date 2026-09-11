import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { readReports, writeReports } from './feedback-reports.mjs';
import { hydrateReports, persistReports, prepareReports, inspectReportsArchive } from './feedback-archive.mjs';

const REPO = 'ImpowerGames/impower';
const INBOX = 510;
const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 20);
const clean = value => value.replace(/\r\n/g, '\n').trim();
const CELL = '<!-- skill-feedback-cell:v2 -->';
const decode = value => value.startsWith(CELL)
  ? value.slice(CELL.length).replace(/<br>/g, '\n').replace(/&(?:amp|lt|gt|#\d+);/g, entity => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>' })[entity] ?? String.fromCodePoint(Number(entity.slice(2, -1))))
  : value.replace(/<br\s*\/?>/gi, '\n').replace(/&#124;/g, '|');
const literalDisplay = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\r\\`*_\[\]~|]/g, char => `&#${char.codePointAt(0)};`).replace(/\n/g, '<br>');
const encode = value => CELL + literalDisplay(value);
const statusPattern = /^(open|ticketed #[1-9]\d*|applied in PR #[1-9]\d*)$/;
const canonicalRows = rows => rows.map(({ skill, friction, edit, status, problemId, sessions, historyIncomplete }) => ({ skill, friction, edit, status, ...(problemId ? { problemId, sessions, historyIncomplete } : {}) }));
const rowKey = row => row.problemId || keyOf(row.skill);
const reportCount = row => row.problemId ? `${row.sessions.length} recorded${row.historyIncomplete ? '; history incomplete' : ''}` : 'unknown';
const reportExcerpt = text => { const points = Array.from(text); return points.length > 300 ? points.slice(0, 300).join('') + '\n[Full history in Reports archive.]' : text; };
const groupMarker = rows => `Feedback group: ${hash(JSON.stringify(canonicalRows(rows)))}`;

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

function historicalTargets(body, rows) {
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
  return new Set([...saved, ...rows.filter(row => !row.problemId).map(row => keyOf(row.skill))]);
}

function cells(line) {
  return line.trim().slice(1, -1).split(/(?<!\\)\|/).map(s => decode(s.trim().replace(/\\\|/g, '|')));
}

export function parseTable(body, savedLedger) {
  const normalized = body.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const candidates = [];
  let offset = 0;
  for (const [index, line] of lines.entries()) {
    if (/^\|\s*Skill, section\s*\|\s*Friction\s*\|\s*Proposed edit\s*\|\s*Status\s*\|(?:\s*Problem\s*\|\s*Reports\s*\|)?\s*$/.test(line) && !fencedAt(normalized, offset)) candidates.push(index);
    offset += line.length + 1;
  }
  if (candidates.length > 1) throw new Error('Multiple canonical inbox tables outside code fences; identify one real table before triage.');
  const start = candidates[0] ?? -1;
  const columns = start >= 0 ? cells(lines[start]).length : 0;
  if (start < 0 || !new RegExp(`^\\|(?:\\s*:?-+:?\\s*\\|){${columns}}\\s*$`).test(lines[start + 1] || '')) throw new Error('Inbox table contract not recognized; read #510 before updating the parser.');
  const ledger = savedLedger ?? readReports(body, fencedAt);
  const rows = [];
  let end = start + 2;
  while (lines[end]?.trim().startsWith('|')) {
    const row = cells(lines[end]);
    if (row.length !== columns || row.some(v => !v.trim()) || !statusPattern.test(row[3])) throw new Error(`Invalid inbox row at line ${end + 1}; nothing will be folded.`);
    const entry = { skill: row[0], friction: row[1], edit: row[2], status: row[3] };
    if (columns === 6 && row[4] !== 'unclassified') {
      const saved = /^F-[1-9]\d*$/.test(row[4]) && Object.hasOwn(ledger, row[4]) ? ledger[row[4]] : null;
      if (!saved) throw new Error(`Unknown problem ${row[4]} in the table; preserve its report ledger.`);
      if (keyOf(entry.skill) !== keyOf(saved.skill)) throw new Error(`Skill for ${row[4]} does not match its saved problem; reconcile the identity before planning.`);
      for (const field of ['friction', 'edit']) {
        if (entry[field] !== saved[field] && entry[field] !== reportExcerpt(saved[field])) throw new Error(`Text for ${row[4]} differs from its saved history; reconcile the archive before planning.`);
        entry[field] = saved[field];
      }
      if (rows.some(previous => previous.problemId === row[4])) throw new Error(`Duplicate problem ${row[4]} in the table; resolve it before triage.`);
      Object.assign(entry, { problemId: row[4], sessions: [...saved.sessions], historyIncomplete: saved.historyIncomplete });
    }
    if (columns === 6 && row[5] !== reportCount(entry)) throw new Error(`Reports for ${entry.problemId || entry.skill} do not match the saved session references.`);
    rows.push(entry);
    end++;
  }
  return { lines, start, end, rows };
}

export function renderTable(body, rows, historyRows = rows, savedLedger, archive = false) {
  const table = parseTable(body, savedLedger);
  const ledger = structuredClone(savedLedger ?? readReports(body, fencedAt));
  for (const row of canonicalRows(historyRows)) if (row.problemId) ledger[row.problemId] = row;
  table.lines[table.start] = '| Skill, section | Friction | Proposed edit | Status | Problem | Reports |';
  table.lines[table.start + 1] = '| --- | --- | --- | --- | --- | --- |';
  table.lines.splice(table.start + 2, table.end - table.start - 2, ...rows.map(row => `| ${[row.skill, archive && row.problemId ? reportExcerpt(row.friction) : row.friction, archive && row.problemId ? reportExcerpt(row.edit) : row.edit, row.status, row.problemId || 'unclassified', reportCount(row)].map(encode).join(' | ')} |`));
  if (archive) return table.lines.join('\n');
  return writeReports(table.lines.join('\n'), ledger, fencedAt);
}

export function parseIntake(comment) {
  const text = clean(comment.body);
  if (/^<!-- skill-feedback-(?:triage|archive|archive-index):/.test(text)) return null;
  if (fencedAt(text)) throw new Error(`Comment ${comment.id} has an unclosed code fence; close it before triage. Intake remains intact.`);
  const labelsOutsideFences = [...text.matchAll(/^(?:\*\*)?(Problem|Session|Skill and section|What happened|Proposed edit)(?:\*\*)?:(?:\*\*)?\s*/gm)].filter(field => !fencedAt(text, field.index));
  const paired = ['Problem', 'Session'].every(name => labelsOutsideFences.some(field => field[1] === name));
  const explicitProblem = labelsOutsideFences.some(field => field[1] === 'Problem' && /^(?:new|F-[1-9]\d*)\s*(?:\n|$)/.test(text.slice(field.index + field[0].length)));
  if (paired || explicitProblem || ['Problem', 'Session'].includes(labelsOutsideFences[0]?.[1])) {
    const labels = labelsOutsideFences;
    if (labels.map(field => field[1]).join('|') !== 'Problem|Session|Skill and section|What happened|Proposed edit') throw new Error(`Comment ${comment.id} needs Problem, Session, Skill and section, What happened, Proposed edit in that order; put quoted field-label examples inside a closed code fence or an indented quote.`);
    const values = labels.map((field, i) => text.slice(field.index + field[0].length, labels[i + 1]?.index ?? text.length).trim());
    const [problem, session, skill, friction, edit] = values;
    if (values.some(value => !value) || /[\r\n\u0085\u2028\u2029]/u.test(session) || session.length > 200 || !/^(new|F-[1-9]\d*)$/.test(problem) || !Number.isSafeInteger(comment.id) || comment.id < 1) throw new Error(`Comment ${comment.id} has an invalid problem or session reference, or empty field.`);
    return { skill, friction, edit, status: 'open', problemId: problem === 'new' ? `F-${comment.id}` : problem, session, newProblem: problem === 'new' };
  }
  const fields = labelsOutsideFences.filter(field => !['Problem', 'Session'].includes(field[1]));
  if (fields.length !== 3 || fields.map(f => f[1]).join('|') !== 'Skill and section|What happened|Proposed edit') {
    const names = fields.map(field => field[1]);
    const distinct = [...new Set(names)];
    const repeated = distinct.filter(name => names.filter(value => value === name).length > 1);
    throw new Error(`Comment ${comment.id} does not match the inbox intake contract: found ${distinct.length} of 3 distinct required labels across ${names.length} occurrences (${names.join(', ') || 'none'}), listed in the order found; repeated labels: ${repeated.join(', ') || 'none'}. Leave it intact; inspect incomplete, repeated or misordered intake and distinguish ordinary discussion.`);
  }
  const values = fields.map((field, i) => text.slice(field.index + field[0].length, fields[i + 1]?.index ?? text.length).trim());
  if (values.some(v => !v)) throw new Error(`Comment ${comment.id} has an empty intake field.`);
  return { skill: values[0], friction: values[1], edit: values[2], status: 'open' };
}

export function fold(body, comments, references = { prs: {}, issues: {} }, savedLedger) {
  const ledger = savedLedger ?? readReports(body, fencedAt);
  const rows = [];
  const byKey = new Map();
  function add(row, repeat, id) {
    const key = rowKey(row);
    const previous = byKey.get(key);
    if (!previous) { const { session, newProblem, ...copy } = row; rows.push(copy); byKey.set(key, copy); return; }
    const repeatedSession = row.session && previous.sessions.includes(row.session);
    if (previous.status !== row.status && (!id || row.status !== 'open')) throw new Error(`Conflicting statuses for ${JSON.stringify(previous.skill)} and ${JSON.stringify(row.skill)} at normalized key ${JSON.stringify(key)}; resolve the table first.`);
    if (id && previous.status !== 'open' && !repeatedSession) {
      previous.previousStatus = previous.status;
      const prefix = `Earlier feedback (${previous.status}; context only):\n`;
      const pr = references.prs[previous.status.match(/^applied in PR #(\d+)$/)?.[1]];
      if (!(pr?.state === 'closed' && !pr.merged_at)) for (const field of ['friction', 'edit']) if (!previous[field].startsWith(prefix)) previous[field] = prefix + previous[field];
      previous.status = 'open';
    }
    if (id) {
      (previous.observations ||= []).push({ id, friction: row.friction, edit: row.edit });
      for (const field of ['friction', 'edit']) previous[field] += `\n\nSeen again (intake #${id}):\n${row[field]}`;
      if (row.session && !repeatedSession) previous.sessions.push(row.session);
    } else {
      for (const field of ['friction', 'edit']) if (previous[field] !== row[field]) previous[field] += `\n${row[field]}`;
      if (repeat) previous.friction += '\nSeen again.';
    }
  }
  for (const row of parseTable(body, ledger).rows) add(row, true);
  const folded = [];
  const ignored = [];
  const skipped = [];
  for (const comment of comments) {
    try {
      const row = parseIntake(comment);
      if (row?.problemId) {
        const existing = byKey.get(row.problemId) || ledger[row.problemId];
        if (!existing && !row.newProblem) throw new Error(`Unknown problem ${row.problemId}; reference a counted problem or report a distinct new one.`);
        if (existing && keyOf(existing.skill) !== keyOf(row.skill)) throw new Error(`Skill for ${row.problemId} does not match its saved problem.`);
        if (existing && !byKey.has(row.problemId)) add({ ...existing, sessions: [...existing.sessions] }, false);
        row.sessions = [row.session];
        row.historyIncomplete = rows.some(previous => !previous.problemId && keyOf(previous.skill) === keyOf(row.skill));
      }
      if (row) { add(row, true, comment.id); folded.push(comment); }
      else if (!/^<!-- skill-feedback-archive(?:-index)?:/.test(clean(comment.body))) skipped.push({ id: comment.id, body: comment.body, reason: 'Marker-prefixed comment; inspect whether it is a triage summary or discussion. Left intact.' });
    } catch (error) { ignored.push({ id: comment.id, body: comment.body, reason: error.message }); }
  }
  const historical = historicalTargets(body, rows);
  for (const row of rows) if (row.problemId && historical.has(keyOf(row.skill))) row.historyIncomplete = true;
  return { rows, folded, ignored, skipped };
}

export function makePlan(body, comments, references = { prs: {}, issues: {} }, savedLedger) {
  requireClosedFences(body);
  refusePendingFoldedIntake(body, comments);
  const ledger = savedLedger ?? readReports(body, fencedAt);
  const { rows, folded, ignored, skipped } = fold(body, comments, references, ledger);
  for (const row of rows) {
    const previous = row.previousStatus || row.status;
    const previousTicket = row.previousStatus?.match(/^ticketed #(\d+)$/)?.[1];
    if (previousTicket && references.issues[previousTicket]?.state === 'closed') row.previousTicketClosed = true;
    if (!previous.startsWith('applied in PR #')) continue;
    const number = previous.match(/#(\d+)/)[1];
    const pr = references.prs[number];
    if (pr?.state === 'closed' && !pr.merged_at) {
      row.previousStatus = previous;
      row.previousUnmerged = true;
      row.status = 'open';
    }
  }
  const groups = new Map();
  for (const row of rows.filter(row => row.status === 'open')) {
    const skill = row.skill.split(',')[0];
    const previousTicket = row.previousStatus?.match(/^ticketed #(\d+)$/)?.[1];
    const existing = previousTicket && references.issues[previousTicket]?.state === 'open';
    const key = existing ? `existing:${previousTicket}` : row.problemId ? `defer:${row.problemId}` : `ticket:${skill}`;
    if (!groups.has(key)) groups.set(key, existing
      ? { action: 'existing', number: Number(previousTicket), keys: [], context: '' }
      : row.problemId ? { action: 'defer', keys: [], context: '' } : { action: 'ticket', title: `Address ${skill} feedback from the skills inbox`, keys: [], context: '' });
    const group = groups.get(key);
    group.keys.push(rowKey(row));
  }
  const priorities = rows.filter(row => row.status === 'open' && row.problemId).map(row => ({ key: rowKey(row), skill: row.skill, reports: row.sessions.length, historyIncomplete: row.historyIncomplete })).sort((a, b) => b.reports - a.reports);
  const unknownPriorities = rows.filter(row => row.status === 'open' && !row.problemId).map(row => ({ key: rowKey(row), skill: row.skill, reports: null }));
  const possibleDuplicates = rows.flatMap((row, index) => rows.slice(index + 1).filter(other => keyOf(row.skill) === keyOf(other.skill)).map(other => ({ keys: [rowKey(row), rowKey(other)], reason: 'Same skill target; inspect the observations before grouping work. Counts remain separate unless reports explicitly name the same problem.' })));
  return { version: 3, repo: REPO, inbox: INBOX, body, comments: folded, ignored, skipped, references, rows, priorities, unknownPriorities, possibleDuplicates, reportHistory: ledger, groups: [...groups.values()] };
}

export async function readPlan(api) {
  const body = (await api.inbox()).body;
  requireClosedFences(body);
  const comments = await api.comments();
  const archive = inspectReportsArchive(body, comments, fencedAt);
  const ledger = archive.problems;
  refusePendingFoldedIntake(body, comments);
  const references = { prs: {}, issues: {} };
  for (const row of fold(body, comments, undefined, ledger).rows) for (const status of [row.status, row.previousStatus]) {
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
  const reports = problemId ? [archive.problems[problemId]] : Object.values(archive.problems).map(row => ({ problemId: row.problemId, skill: row.skill, status: row.status, reports: row.sessions.length, historyIncomplete: row.historyIncomplete, friction: reportExcerpt(row.friction), edit: reportExcerpt(row.edit) }));
  return { reports, pending, archive: { index: archive.index, chunks: archive.chunks, superseded: archive.superseded } };
}

function description(rows) {
  return rows.map(row => `### ${row.skill}${row.problemId ? ` (${row.problemId}; ${reportCount(row)})` : ''}\n\n` + (row.previousStatus && !row.previousUnmerged && row.observations?.length
    ? row.observations.map(item => `Intake #${item.id}:\n\n${item.friction}\n\nProposed change: ${item.edit}`).join('\n\n')
    : `${row.friction}\n\nProposed change: ${row.edit}`)).join('\n\n');
}

function referenceContext(rows, context) {
  const references = rows.filter(row => row.previousStatus).map(row => `Previous reference for ${row.skill}: ${row.previousStatus}${row.previousUnmerged ? '; the pull request closed without merging; its proposal remains actionable' : row.previousTicketClosed ? ' (closed; closure does not establish that the proposal shipped)' : ''}.`);
  return [...references, context].filter(Boolean).join('\n\n');
}

function evidenceBody(rows, marker, context = '') {
  context = referenceContext(rows, context);
  return `## Feedback from #510\n\n${description(rows)}${context ? `\n\n## Additional context\n\n${context}` : ''}\n\n${marker}\n`;
}

function ticketBody(rows, marker, context = '') {
  context = referenceContext(rows, context);
  return `## Description\n\n${description(rows)}\n\n## Motivation\n\nThese items were observed while following the repository skills and collected in #510.\n\n## Scope\n\nAddress the items above. Prefer a checked mechanism for preventable mistakes; confirm prose proposals against current code and instructions before applying them.\n\n## Acceptance criteria\n\n- [ ] Each item above is fixed or explicitly adjudicated.\n- [ ] Any mechanism has a failing-then-passing check and the standalone checks pass.\n- [ ] Skill text describes current behavior and the pull request lists applied feedback.\n\n## Additional context\n\nFiled by the hand-invoked triage-skill-feedback run for #510.${context ? `\n\n${context}` : ''}\n\n${marker}\n`;
}

export function preview(plan) {
  return plan.groups.map(group => {
    const rows = plan.rows.filter(row => group.keys.includes(rowKey(row)));
    return { ...group, body: ['ticket', 'existing'].includes(group.action) ? (group.action === 'existing' ? evidenceBody : ticketBody)(rows, groupMarker(rows), group.context) : undefined };
  });
}

function summaryText(plan, marker, rows, filed, applied, removed, observations = '') {
  const history = [...historicalTargets(plan.body, rows)];
  return `${marker}\nFolded ${plan.comments.length} intake comments (${plan.comments.map(c => c.id).join(', ') || 'none'}); filed or linked ${filed.join(', ') || 'none'}; applied ${applied.join(', ') || 'none'}; removed ${removed.map(literalDisplay).join('; ') || 'none'}; left unparsed comments ${(plan.ignored || []).map(c => c.id).join(', ') || 'none'} intact (reasons in the plan); left marker-prefixed comments ${(plan.skipped || []).map(c => c.id).join(', ') || 'none'} intact (inspect skipped IDs and bodies in the plan).${rows.some(row => row.status === 'open') ? ` Deferred: ${rows.filter(row => row.status === 'open').map(row => `${literalDisplay(rowKey(row))} (${reportCount(row)})`).join('; ')}.` : ''}${observations ? `\n\nApplied unclassified observations: ${literalDisplay(observations)}` : ''}${history.length ? `\n<!-- skill-feedback-history:v1 ${Buffer.from(JSON.stringify(history)).toString('base64')} -->` : ''}`;
}

// The adapter makes persistence ordering testable without touching GitHub.
export async function applyPlan(plan, api) {
  if (plan.version !== 3 || plan.repo !== REPO || plan.inbox !== INBOX) throw new Error('Wrong plan version or inbox; retain the original script for interrupted plans.');
  if (plan.groups.some(group => !Array.isArray(group.keys) || group.keys.length === 0)) throw new Error('Every group needs at least one row key; remove empty split groups before applying.');
  const keys = plan.groups.flatMap(group => group.keys);
  const open = plan.rows.filter(row => row.status === 'open').map(rowKey);
  if (keys.length !== new Set(keys).size || JSON.stringify([...keys].sort()) !== JSON.stringify([...open].sort())) throw new Error('Every open row must occur in exactly one group.');
  for (const group of plan.groups) {
    if (!['ticket', 'applied', 'existing', 'defer'].includes(group.action) || (group.action === 'ticket' ? !group.title?.trim() : group.action !== 'defer' && (!Number.isSafeInteger(group.number) || group.number < 1))) throw new Error('Each group needs a ticket title, an existing issue number, an applied PR number, or defer.');
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
  if (!resumed) for (const [kind, refs] of Object.entries(plan.references || {})) for (const [number, saved] of Object.entries(refs)) {
    const item = await (kind === 'prs' ? api.pr(Number(number)) : api.issue(Number(number)));
    if (item.state !== saved.state || (kind === 'prs' && item.merged_at !== saved.merged_at)) throw new Error(`Referenced ${kind} #${number} changed since planning; read a fresh plan.`);
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
    const projectedRows = structuredClone(rows);
    const projectedFiled = [], projectedApplied = [];
    const appliedLegacy = [];
    for (const group of plan.groups) {
      const grouped = projectedRows.filter(row => group.keys.includes(rowKey(row)));
      if (group.action === 'defer') {
        for (const row of grouped) { const prior = referenceContext([row], ''); if (prior && !row.friction.includes(prior)) row.friction += `\n\n${prior}`; }
      } else {
        const number = group.action === 'ticket' ? Number.MAX_SAFE_INTEGER : group.number;
        if (group.action === 'applied') {
          const prior = referenceContext(grouped, '');
          projectedApplied.push(`#${number}${prior ? ` (${literalDisplay(prior)})` : ''}`);
          appliedLegacy.push(...grouped.filter(row => !row.problemId));
        } else projectedFiled.push(`#${number}${group.action === 'existing' ? ' (existing)' : ''}`);
        for (const row of grouped) row.status = group.action === 'applied' ? `applied in PR #${number}` : `ticketed #${number}`;
      }
    }
    const projected = { ...liveLedger, ...Object.fromEntries(canonicalRows(projectedRows).filter(row => row.problemId).map(row => [row.problemId, row])) };
    prepareReports(projected);
    const projectedVisible = projectedRows.filter(row => { const number = row.status.match(/#(\d+)/)?.[1]; return !(row.status.startsWith('ticketed') && plan.references?.issues[number]?.state === 'closed') && !(row.status.startsWith('applied') && plan.references?.prs[number]?.merged_at); });
    const projectedBody = renderTable(stripSummaryBlocks(plan.body), projectedVisible, projectedRows, liveLedger, true);
    parseTable(Buffer.from(projectedBody, 'utf8').toString('utf8'), projected);
    const projectedSummary = summaryText(plan, marker, projectedRows, projectedFiled, projectedApplied, projectedRows.map(row => row.problemId ? `${row.problemId} (${row.skill})` : row.skill), description(appliedLegacy));
    // Count every possible removal as an upper bound; actual Task numbers are no longer than MAX_SAFE_INTEGER.
    // 512 covers the compact archive pointer and integrity marker, independently of report/comment counts.
    if (projectedBody.length + projectedSummary.length + 512 > 50000) throw new Error('Inbox table needs consolidation before applying; its projected body exceeds the supported 50,000-character budget. No tickets or intake were changed.');
    const filed = [], applied = [], removed = [];
    const allIssues = await api.issues();
    for (const group of plan.groups) {
      const grouped = rows.filter(row => group.keys.includes(rowKey(row)));
      if (group.action === 'defer') {
        for (const row of grouped) {
          const prior = referenceContext([row], '');
          if (prior && !row.friction.includes(prior)) row.friction += `\n\n${prior}`;
        }
        continue;
      }
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
        if (ticket.state !== 'open') throw new Error(`Task #${number} is closed; choose an open Task or file new work.`);
        const evidenceMarker = groupMarker(grouped);
        const expectedEvidence = evidenceBody(grouped, evidenceMarker, group.context);
        const earlier = (await api.issueComments(number)).filter(comment => comment.body.includes(evidenceMarker));
        if (earlier.length > 1) throw new Error(`Multiple existing-ticket evidence comments carry this marker on Task #${number}: ${earlier.map(comment => '#' + comment.id).join(', ')}. Inspect them and preserve intake.`);
        const evidence = earlier[0] || await api.postIssueComment(number, expectedEvidence);
        const confirmed = (await api.issueComments(number)).find(comment => comment.id === evidence.id);
        if (confirmed?.body !== expectedEvidence) throw new Error(`Existing-ticket evidence failed read-back for Task #${number}, comment #${evidence.id}; preserve intake. Inspect that evidence and retry the original unedited plan with its original script version. If inbox edits require a fresh plan, copy the original group's context exactly and retain this existing target when its scope still fits; changed rows or formatting require inspection before recovery.`);
        filed.push(`#${number} (existing)`);
      } else {
        const target = await api.pr(number);
        if (target.state === 'closed' && !target.merged_at) throw new Error(`PR #${number} is closed and unmerged; select work that still carries the edit.`);
        const prior = referenceContext(grouped, '');
        applied.push(`#${number}${prior ? ` (${literalDisplay(prior)})` : ''}`);
      }
      for (const row of grouped) row.status = group.action === 'applied' ? `applied in PR #${number}` : `ticketed #${number}`;
    }
    const remaining = [];
    for (const row of rows) {
      const number = Number(row.status.match(/#(\d+)/)?.[1]);
      const done = row.status.startsWith('ticketed') ? (await api.issue(number)).state === 'closed' : row.status.startsWith('applied') ? Boolean((await api.pr(number)).merged_at) : false;
      if (done) {
        if (parseTable(plan.body, liveLedger).rows.some(previous => rowKey(previous) === rowKey(row)) || plan.groups.some(group => group.action !== 'defer' && group.keys.includes(rowKey(row)))) removed.push(row.problemId ? `${row.problemId} (${row.skill})` : row.skill);
      } else remaining.push(row);
    }
    summary = summaryText(plan, marker, rows, filed, applied, removed, description(appliedLegacy));
    const prior = stripSummaryBlocks(plan.body).trimEnd();
    const ledger = { ...liveLedger, ...Object.fromEntries(canonicalRows(rows).filter(row => row.problemId).map(row => [row.problemId, row])) };
    const rendered = renderTable(prior, remaining, rows, liveLedger, true);
    const archived = await persistReports(rendered, ledger, { comments: api.comments, postComment: api.postSummary }, fencedAt);
    const content = `${archived.trimEnd()}\n\n${summary}`;
    const updated = `${content}\n<!-- skill-feedback-state:${hash(content)} -->\n`;
    if (updated.length > 50000) throw new Error('Inbox body exceeds the supported budget; preserve this plan and recover any created evidence before consolidating the table. No intake deleted.');
    current = await api.inbox();
    if (current.body !== plan.body) throw new Error('Inbox changed during triage; tickets are recoverable by marker. Re-plan before overwriting it.');
    await api.updateBody(updated);
    if ((await api.inbox()).body !== updated) throw new Error('Inbox body read-back differs; no intake deleted.');
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
  const gh = args => JSON.parse(execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }));
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
    postIssueComment: (number, body) => gh(['api', '-X', 'POST', `repos/${REPO}/issues/${number}/comments`, '-F', `body=@${bodyFile(body)}`]),
    createTicket: (title, body) => gh(['api', '-X', 'POST', `repos/${REPO}/issues`, '-f', `title=${title}`, '-F', `body=@${bodyFile(body)}`, '-f', 'type=Task', '-f', 'labels[]=workflow: skills']),
    updateBody: body => execFileSync('gh', ['issue', 'edit', String(INBOX), '--repo', REPO, '--body-file', bodyFile(body)], { encoding: 'utf8' }),
    deleteComment: id => execFileSync('gh', ['api', '-X', 'DELETE', `repos/${REPO}/issues/comments/${id}`], { encoding: 'utf8' }),
    postSummary: body => gh(['api', '-X', 'POST', `repos/${REPO}/issues/${INBOX}/comments`, '-F', `body=@${bodyFile(body)}`]),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
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
      console.log(`Plan written to ${file}: ${plan.rows.length} rows, ${plan.comments.length} intake comments, ${plan.ignored.length} unparsed and ${plan.skipped.length} marker-prefixed comments left intact. Inspect ignored/skipped IDs, bodies and reasons, then edit groups before apply.`);
    } else {
      const plan = JSON.parse(readFileSync(file, 'utf8'));
      console.log(JSON.stringify(command === 'preview' ? preview(plan) : await applyPlan(plan, api), null, 2));
    }
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
