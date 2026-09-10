import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'ImpowerGames/impower';
const INBOX = 510;
const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 20);
const clean = value => value.replace(/\r\n/g, '\n').trim();
const decode = value => value.replace(/<br\s*\/?>/gi, '\n').replace(/&#124;/g, '|');
const encode = value => value.replace(/\|/g, '&#124;').replace(/\r?\n/g, '<br>');
const statusPattern = /^(open|ticketed #\d+|applied in PR #\d+)$/;

export function keyOf(skill) {
  const value = clean(skill).toLowerCase().replace(/[`*]/g, '').replace(/\s+/g, ' ');
  const numbered = value.match(/^([^,]+),\s*(section \d+)\b/);
  return numbered ? `${numbered[1]}, ${numbered[2]}` : value.replace(/\s*\([^)]*\)\.?$/, '').replace(/\.$/, '');
}

function cells(line) {
  return line.trim().slice(1, -1).split(/(?<!\\)\|/).map(s => decode(s.trim().replace(/\\\|/g, '|')));
}

export function parseTable(body) {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex(line => /^\|\s*Skill, section\s*\|\s*Friction\s*\|\s*Proposed edit\s*\|\s*Status\s*\|\s*$/.test(line));
  if (start < 0 || !/^\|(?:\s*:?-+:?\s*\|){4}\s*$/.test(lines[start + 1] || '')) throw new Error('Inbox table contract not recognized; read #510 before updating the parser.');
  const rows = [];
  let end = start + 2;
  while (lines[end]?.trim().startsWith('|')) {
    const row = cells(lines[end]);
    if (row.length !== 4 || row.some(v => !v) || !statusPattern.test(row[3])) throw new Error(`Invalid inbox row at line ${end + 1}; nothing will be folded.`);
    rows.push({ skill: row[0], friction: row[1], edit: row[2], status: row[3] });
    end++;
  }
  return { lines, start, end, rows };
}

export function renderTable(body, rows) {
  const table = parseTable(body);
  table.lines.splice(table.start + 2, table.end - table.start - 2, ...rows.map(row => `| ${[row.skill, row.friction, row.edit, row.status].map(encode).join(' | ')} |`));
  return table.lines.join('\n');
}

export function parseIntake(comment) {
  const text = clean(comment.body);
  if (text.startsWith('<!-- skill-feedback-triage:')) return null;
  const fields = [...text.matchAll(/^(?:\*\*)?(Skill and section|What happened|Proposed edit):(?:\*\*)?\s*/gm)];
  if (fields.length !== 3 || fields.map(f => f[1]).join('|') !== 'Skill and section|What happened|Proposed edit') throw new Error(`Comment ${comment.id} does not match the inbox intake contract; leave it intact and inspect it.`);
  const values = fields.map((field, i) => text.slice(field.index + field[0].length, fields[i + 1]?.index ?? text.length).trim());
  if (values.some(v => !v)) throw new Error(`Comment ${comment.id} has an empty intake field.`);
  return { skill: values[0], friction: values[1], edit: values[2], status: 'open' };
}

export function fold(body, comments) {
  const rows = [];
  const byKey = new Map();
  function add(row, repeat) {
    const key = keyOf(row.skill);
    const previous = byKey.get(key);
    if (!previous) { const copy = { ...row }; rows.push(copy); byKey.set(key, copy); return; }
    if (previous.status !== row.status && row.status !== 'open') throw new Error(`Conflicting statuses for ${row.skill}; resolve the table first.`);
    const newWork = ['friction', 'edit'].some(field => !previous[field].includes(row[field]));
    if (newWork && previous.status !== 'open' && row.status === 'open') {
      previous.edit += `\nEarlier item: ${previous.status}; new feedback requires triage.`;
      previous.status = 'open';
    }
    for (const field of ['friction', 'edit']) if (!previous[field].includes(row[field])) previous[field] += `\n${row[field]}`;
    if (repeat && !previous.friction.includes('Seen again')) previous.friction += '\nSeen again.';
  }
  for (const row of parseTable(body).rows) add(row, true);
  const folded = [];
  for (const comment of comments) {
    const row = parseIntake(comment);
    if (row) { add(row, true); folded.push(comment); }
  }
  return { rows, folded };
}

export function makePlan(body, comments) {
  const { rows, folded } = fold(body, comments);
  const groups = new Map();
  for (const row of rows.filter(row => row.status === 'open')) {
    const skill = row.skill.split(',')[0];
    if (!groups.has(skill)) groups.set(skill, { action: 'ticket', title: `Address ${skill} feedback from the skills inbox`, keys: [] });
    groups.get(skill).keys.push(keyOf(row.skill));
  }
  return { version: 1, repo: REPO, inbox: INBOX, body, comments: folded, rows, groups: [...groups.values()] };
}

function ticketBody(rows, marker, context = '') {
  return `## Description\n\n${rows.map(r => `### ${r.skill}\n\n${r.friction}\n\nProposed change: ${r.edit}`).join('\n\n')}\n\n## Motivation\n\nThese items were observed while following the repository skills and collected in #510.\n\n## Scope\n\nAddress the items above. Prefer a checked mechanism for preventable mistakes; confirm prose proposals against current code and instructions before applying them.\n\n## Acceptance criteria\n\n- [ ] Each item above is fixed or explicitly adjudicated.\n- [ ] Any mechanism has a failing-then-passing check and the standalone checks pass.\n- [ ] Skill text describes current behavior and the pull request lists applied feedback.\n\n## Additional context\n\nFiled by the hand-invoked triage-skill-feedback run for #510.${context ? `\n\n${context}` : ''}\n\n${marker}\n`;
}

export function preview(plan) {
  return plan.groups.map(group => {
    const rows = plan.rows.filter(row => group.keys.includes(keyOf(row.skill)));
    return { ...group, body: group.action === 'ticket' ? ticketBody(rows, `Feedback group: ${hash(JSON.stringify(rows))}`, group.context) : undefined };
  });
}

// The adapter makes persistence ordering testable without touching GitHub.
export async function applyPlan(plan, api) {
  if (plan.version !== 1 || plan.repo !== REPO || plan.inbox !== INBOX) throw new Error('Wrong plan version or inbox.');
  const expected = fold(plan.body, plan.comments).rows;
  if (JSON.stringify(plan.rows) !== JSON.stringify(expected)) throw new Error('Edit group decisions, not the captured rows; make a fresh plan for new intake.');
  const keys = plan.groups.flatMap(group => group.keys);
  const open = expected.filter(row => row.status === 'open').map(row => keyOf(row.skill));
  if (keys.length !== new Set(keys).size || JSON.stringify([...keys].sort()) !== JSON.stringify([...open].sort())) throw new Error('Every open row must occur in exactly one group.');
  for (const group of plan.groups) {
    if (!['ticket', 'applied', 'existing'].includes(group.action) || (group.action === 'ticket' ? !group.title?.trim() : !Number.isSafeInteger(group.number) || group.number < 1)) throw new Error('Each group needs a ticket title, an existing issue number, or an applied PR number.');
  }
  const run = hash(JSON.stringify({ body: plan.body, comments: plan.comments, groups: plan.groups }));
  const marker = `<!-- skill-feedback-triage:${run} -->`;
  let current = await api.inbox();
  // A completed body's marker allows retries to finish cleanup after interruption.
  const resumed = current.body.includes(marker);
  if (resumed) {
    const integrity = current.body.match(/\n<!-- skill-feedback-state:([a-f0-9]{20}) -->\n?$/);
    if (!integrity || hash(current.body.slice(0, integrity.index)) !== integrity[1]) throw new Error('Persisted inbox changed after folding; inspect it before deleting intake.');
  }
  if (!resumed && current.body !== plan.body) throw new Error('Inbox body changed since planning; create a fresh plan before writing.');
  const currentComments = await api.comments();
  for (const comment of plan.comments) {
    const live = currentComments.find(c => c.id === comment.id);
    if ((!live && !resumed) || (live && live.body !== comment.body)) throw new Error(`Intake ${comment.id} changed since planning; nothing can be deleted from this plan.`);
  }
  let summary;
  if (!resumed) {
    const rows = expected.map(row => ({ ...row }));
    const filed = [], applied = [], removed = [];
    const allIssues = await api.issues();
    for (const group of plan.groups) {
      const grouped = rows.filter(row => group.keys.includes(keyOf(row.skill)));
      let number = group.number;
      if (group.action === 'ticket') {
        const ticketMarker = `Feedback group: ${hash(JSON.stringify(grouped))}`;
        const expectedBody = ticketBody(grouped, ticketMarker, group.context);
        const matches = allIssues.filter(issue => !issue.pull_request && issue.body?.includes(ticketMarker));
        if (matches.length > 1) throw new Error('Multiple tickets carry a group recovery marker; inspect them before retrying.');
        const ticket = matches[0] || await api.createTicket(group.title, expectedBody);
        number = ticket.number;
        const readback = await api.issue(number);
        if (readback.type?.name !== 'Task' || !readback.labels.some(label => label.name === 'workflow: skills') || readback.body !== expectedBody || readback.title !== group.title) throw new Error(`Ticket #${number} failed read-back verification; keep the intake.`);
        filed.push(`#${number}`);
      } else if (group.action === 'existing') {
        const ticket = await api.issue(number);
        if (ticket.pull_request || ticket.type?.name !== 'Task' || !ticket.labels.some(label => label.name === 'workflow: skills')) throw new Error(`#${number} is not a workflow: skills Task.`);
        filed.push(`#${number} (existing)`);
      } else {
        await api.pr(number);
        applied.push(`#${number}`);
      }
      for (const row of grouped) row.status = group.action === 'applied' ? `applied in PR #${number}` : `ticketed #${number}`;
    }
    const remaining = [];
    for (const row of rows) {
      const number = Number(row.status.match(/#(\d+)/)?.[1]);
      const done = row.status.startsWith('ticketed') ? (await api.issue(number)).state === 'closed' : row.status.startsWith('applied') ? Boolean((await api.pr(number)).merged_at) : false;
      if (done) removed.push(row.skill); else remaining.push(row);
    }
    summary = `${marker}\nFolded ${plan.comments.length} intake comments (${plan.comments.map(c => c.id).join(', ') || 'none'}); filed or linked ${filed.join(', ') || 'none'}; applied ${applied.join(', ') || 'none'}; removed ${removed.join('; ') || 'none'}.`;
    const prior = plan.body.replace(/\n<!-- skill-feedback-triage:[\s\S]*$/, '').trimEnd();
    const content = `${renderTable(prior, remaining).trimEnd()}\n\n${summary}`;
    const updated = `${content}\n<!-- skill-feedback-state:${hash(content)} -->\n`;
    current = await api.inbox();
    if (current.body !== plan.body) throw new Error('Inbox changed during triage; tickets are recoverable by marker. Re-plan before overwriting it.');
    await api.updateBody(updated);
    if ((await api.inbox()).body !== updated) throw new Error('Inbox body read-back differs; no intake deleted.');
  } else {
    summary = current.body.slice(current.body.indexOf(marker)).split('\n').slice(0, 2).join('\n');
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
  const gh = args => JSON.parse(execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }));
  const api = path => gh(['api', `repos/${REPO}/${path}`]);
  const pages = path => gh(['api', `repos/${REPO}/${path}`, '--paginate', '--slurp']).flat();
  function bodyFile(body) { const file = resolve(scratch, `body-${++sequence}.md`); writeFileSync(file, body); return file; }
  return {
    inbox: () => api(`issues/${INBOX}`), comments: () => pages(`issues/${INBOX}/comments?per_page=100`),
    issues: () => pages('issues?state=all&per_page=100'), issue: number => api(`issues/${number}`), pr: number => api(`pulls/${number}`),
    createTicket: (title, body) => gh(['api', '-X', 'POST', `repos/${REPO}/issues`, '-f', `title=${title}`, '-F', `body=@${bodyFile(body)}`, '-f', 'type=Task', '-f', 'labels[]=workflow: skills']),
    updateBody: body => execFileSync('gh', ['issue', 'edit', String(INBOX), '--repo', REPO, '--body-file', bodyFile(body)], { encoding: 'utf8' }),
    deleteComment: id => execFileSync('gh', ['api', '-X', 'DELETE', `repos/${REPO}/issues/comments/${id}`], { encoding: 'utf8' }),
    postSummary: body => gh(['api', '-X', 'POST', `repos/${REPO}/issues/${INBOX}/comments`, '-F', `body=@${bodyFile(body)}`]),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, file, ...extra] = process.argv.slice(2);
    if (!['plan', 'preview', 'apply'].includes(command) || !file || extra.length) throw new Error('Usage: node triage-skill-feedback.mjs plan|preview|apply <absolute-plan.json>');
    if (!/^(?:[A-Za-z]:[\\/]|\/)/.test(file)) throw new Error('Use an absolute plan path outside the checkout.');
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
    const within = relative(repoRoot, resolve(file));
    if (within !== '..' && !within.startsWith(`..${sep}`) && !isAbsolute(within)) throw new Error('Keep the plan outside the checkout.');
    mkdirSync(dirname(resolve(file)), { recursive: true });
    const scratch = mkdtempSync(resolve(dirname(file), 'triage-bodies-'));
    const api = github(scratch);
    if (command === 'plan') {
      const plan = makePlan((await api.inbox()).body, await api.comments());
      writeFileSync(file, JSON.stringify(plan, null, 2) + '\n', { flag: 'wx' });
      console.log(`Plan written to ${file}: ${plan.rows.length} rows, ${plan.comments.length} intake comments. Read and edit groups before apply.`);
    } else {
      const plan = JSON.parse(readFileSync(file, 'utf8'));
      console.log(JSON.stringify(command === 'preview' ? preview(plan) : await applyPlan(plan, api), null, 2));
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
