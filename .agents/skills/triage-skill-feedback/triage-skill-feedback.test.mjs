import { hydrateReports } from './feedback-archive.mjs';
import { writeReports } from './feedback-reports.mjs';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseLegacyTable, parseIntake, keyOf, fold, makePlan, readPlan, preview, applyPlan, lookupReports } from './triage-skill-feedback.mjs';

const body = 'Intro\n\n## Intake\n\nPost one report per comment.\n\nFooter stays.\n';
const reported = (id, session, problem = 'new', friction = 'Completion lost', skill = 'review-pr, section 3') => ({ id, body: `Problem: ${problem}\n\nSession: ${session}\n\nSkill and section: ${skill}\n\nWhat happened: ${friction}\n\nProposed edit: Preserve the result.`, html_url: `https://example.test/${id}` });
const problem = (id, status, sessions = ['codex:alpha'], skill = 'review-pr, section 3') => ({ skill, friction: `Friction ${id}`, edit: `Edit ${id}`, status, problemId: id, sessions, historyIncomplete: false });
const withLedger = (text, problems) => writeReports(text, Object.fromEntries(problems.map(row => [row.problemId, row])));
const task = (number, state = 'open') => ({ number, state, type: { name: 'Task' }, labels: [{ name: 'workflow: skills' }] });
let passed = 0;
async function test(name, run) { try { await run(); console.log(`PASS: ${name}`); passed++; } catch (error) { console.error(`FAIL: ${name}`); throw error; } }

function fixture(comments = [reported(1, 'codex:alpha')], initialBody = body) {
  const state = { body: initialBody, comments: structuredClone(comments), issues: [], references: new Map(), discussion: new Map(), parents: new Map(), subIssueCalls: [], reopenCalls: [], bodyWrites: [], events: [], fail: null, nextSummaryId: 999 };
  const checkpoint = name => { state.events.push(name); if (state.fail === name) { state.fail = null; throw new Error(`interrupted ${name}`); } };
  const databaseId = number => number + 1000000;
  const find = number => state.issues.find(i => i.number === number) || state.references.get(number);
  const api = {
    inbox: async () => ({ body: state.body }), comments: async () => structuredClone(state.comments), issues: async () => structuredClone(state.issues),
    issue: async number => {
      const issue = find(number);
      if (!issue) throw new Error(`Fixture has no issue #${number}`);
      const parent = state.parents.get(number);
      return { id: databaseId(number), parent_issue_url: parent ? `https://api.github.com/repos/${parent.repo || 'ImpowerGames/impower'}/issues/${parent.number}` : null, ...structuredClone(issue) };
    },
    subIssues: async () => [...state.parents].filter(([, parent]) => parent.number === 510 && !parent.repo).map(([number]) => ({ number, id: databaseId(number) })),
    addSubIssue: async id => {
      state.subIssueCalls.push(id);
      const number = id - 1000000;
      if (state.parents.has(number)) throw new Error(`Fixture issue #${number} already has a parent`);
      state.parents.set(number, { number: 510 });
      checkpoint('attached');
    },
    reopenIssue: async number => { state.reopenCalls.push(number); find(number).state = 'open'; checkpoint('reopened'); },
    pr: async number => ({ number, state: [503, 504].includes(number) ? 'closed' : 'open', merged_at: number === 503 ? '2026-01-01' : null }),
    issueComments: async number => structuredClone(state.discussion.get(number) || []),
    postIssueComment: async (number, text) => { const discussion = state.discussion.get(number) || []; const comment = { id: 800 + discussion.length, body: text }; discussion.push(comment); state.discussion.set(number, discussion); checkpoint('evidence'); return comment; },
    createTicket: async (title, text) => { const issue = { ...task(state.issues.length + 600), title, body: text }; state.issues.push(issue); checkpoint('created'); return issue; },
    updateBody: async text => { state.bodyWrites.push(text); state.body = text; checkpoint('persisted'); },
    deleteComment: async id => { checkpoint('delete'); state.comments = state.comments.filter(c => c.id !== id); },
    postSummary: async text => { while (state.comments.some(comment => comment.id === state.nextSummaryId)) state.nextSummaryId++; const comment = { id: state.nextSummaryId++, body: text, html_url: 'https://example.test/summary' }; state.comments.push(comment); checkpoint(text.startsWith('<!-- skill-feedback-archive') ? 'archive' : 'summary'); return comment; },
  };
  return { state, api };
}
const ledgerOf = state => hydrateReports(state.body, state.comments);

await test('intake needs all five labels; bold labels, marker comments and malformed intake are distinguished', () => {
  const plain = reported(1, 'codex:alpha');
  assert.deepEqual(parseIntake(plain), parseIntake({ ...plain, body: plain.body.replace(/^(Problem|Session|Skill and section|What happened|Proposed edit):/gm, '**$1:**') }));
  assert.equal(parseIntake({ body: '<!-- skill-feedback-triage:abc -->\nFolded 2.' }), null);
  assert.throws(() => parseIntake({ id: 9, body: 'Unknown comment' }), /Comment 9 does not match the inbox intake contract: found 0 of 5/);
  const legacy = { id: 10, body: 'Skill and section: review-pr, section 3\n\nWhat happened: x\n\nProposed edit: y' };
  assert.throws(() => parseIntake(legacy), /Comment 10 .*found 3 of 5.*Problem, Session, Skill and section, What happened, Proposed edit in that order/);
  assert.throws(() => parseIntake({ id: 11, body: reported(11, 'codex:alpha').body.replace('Completion lost', '') }), /empty field/);
  assert.throws(() => parseIntake({ id: 12, body: reported(12, 'x'.repeat(201)).body }), /invalid problem or session/);
  assert.throws(() => parseIntake({ id: 13, body: reported(13, 'codex:alpha').body + '\n\n```text' }), /unclosed code fence/);
  assert.throws(() => parseIntake({ id: 14, body: reported(14, 'codex:alpha').body.replace('Proposed edit:', 'Session: again\n\nProposed edit:') }), /repeated labels: Session/);
});

await test('each new counted problem gets its own ticket group and no plan offers defer', () => {
  const plan = makePlan(body, [reported(1, 'codex:alpha'), reported(2, 'codex:beta', 'new', 'Other', 'write-regression-test, section 3')]);
  assert.equal(plan.version, 4);
  assert.deepEqual(plan.groups.map(group => [group.action, group.keys]), [['ticket', ['F-1']], ['ticket', ['F-2']]]);
  assert.match(plan.groups[0].title, /^Address review-pr feedback F-1 from the skills inbox$/);
  assert.ok(plan.groups.every(group => ['ticket', 'existing', 'applied'].includes(group.action)));
  assert.deepEqual(plan.priorities.map(item => item.key), ['F-1', 'F-2']);
});

await test('apply files one Task per problem, attaches it, maps it in the archive and deletes intake last', async () => {
  const { state, api } = fixture([reported(1, 'codex:alpha'), reported(2, 'codex:beta', 'new', 'Other', 'write-regression-test, section 3')]);
  const plan = await readPlan(api);
  const result = await applyPlan(plan, api);
  assert.deepEqual(state.events, ['created', 'created', 'attached', 'attached', 'archive', 'archive', 'persisted', 'delete', 'delete', 'summary']);
  assert.deepEqual(state.subIssueCalls, [1000600, 1000601]);
  assert.equal(ledgerOf(state)['F-1'].status, 'ticketed #600');
  assert.equal(ledgerOf(state)['F-2'].status, 'ticketed #601');
  assert.match(state.issues[0].body, /## Acceptance criteria/);
  assert.match(state.issues[0].body, /### review-pr, section 3 \(F-1; 1 recorded\)/);
  assert.ok(!state.issues[0].body.includes('<!--'));
  assert.ok(!state.body.includes('| Skill, section'));
  assert.ok(state.body.startsWith('Intro\n'));
  assert.ok(state.body.includes('Footer stays.'));
  assert.match(result.summary, /Problems: F-1 → #600; F-2 → #601\./);
  assert.match(result.summary, /filed or linked #600, #601;/);
  await applyPlan(plan, api);
  assert.equal(state.issues.length, 2);
  assert.equal(state.comments.filter(comment => comment.body.includes('Folded 2 intake')).length, 1);
});

await test('a recurrence posts only its new observation to the open Task the archive maps it to', async () => {
  const text = withLedger(body, [problem('F-5', 'ticketed #737')]);
  const { state, api } = fixture([reported(20, 'codex:beta', 'F-5', 'Seen in review')], text);
  state.references.set(737, task(737));
  state.parents.set(737, { number: 510 });
  const plan = await readPlan(api);
  assert.deepEqual(plan.groups, [{ action: 'existing', number: 737, keys: ['F-5'], context: '' }]);
  await applyPlan(plan, api);
  assert.equal(state.issues.length, 0);
  assert.deepEqual(state.reopenCalls, []);
  const evidence = state.discussion.get(737)[0].body;
  assert.match(evidence, /F-5; 2 recorded/);
  assert.match(evidence, /Intake #20:\n\nSeen in review/);
  assert.ok(!evidence.includes('Friction F-5'));
  assert.deepEqual(ledgerOf(state)['F-5'].sessions, ['codex:alpha', 'codex:beta']);
  assert.equal(ledgerOf(state)['F-5'].status, 'ticketed #737');
});

await test('a recurrence reopens its closed Task, attaches it and survives an interrupted retry', async () => {
  const text = withLedger(body, [problem('F-5', 'ticketed #740')]);
  const { state, api } = fixture([reported(20, 'codex:beta', 'F-5', 'Seen again')], text);
  state.references.set(740, task(740, 'closed'));
  const plan = await readPlan(api);
  assert.deepEqual(plan.groups.map(group => [group.action, group.number]), [['existing', 740]]);
  assert.equal(preview(plan)[0].reopen, true);
  state.fail = 'evidence';
  await assert.rejects(applyPlan(plan, api), /interrupted evidence/);
  assert.equal(state.references.get(740).state, 'open');
  assert.equal(state.bodyWrites.length, 0);
  assert.equal(state.comments.length, 1);
  const result = await applyPlan(plan, api);
  assert.deepEqual(state.reopenCalls, [740]);
  assert.equal(state.discussion.get(740).length, 1);
  assert.deepEqual(state.subIssueCalls, [1000740]);
  assert.match(result.summary, /#740 \(existing, reopened\)/);
  assert.match(result.summary, /Problems: F-5 → #740\./);
});

await test('an existing group on a closed Task that records none of its problems is refused before writes', async () => {
  const { state, api } = fixture();
  state.references.set(701, task(701, 'closed'));
  const plan = await readPlan(api);
  plan.groups = [{ action: 'existing', number: 701, keys: ['F-1'], context: '' }];
  await assert.rejects(applyPlan(plan, api), /Task #701 is closed and records none of these problems/);
  assert.deepEqual(state.reopenCalls, []);
  assert.equal(state.bodyWrites.length, 0);
  assert.equal(state.comments.length, 1);
});

await test('a plan containing defer is refused by preview and apply with a message naming the change', async () => {
  const { state, api } = fixture();
  const plan = await readPlan(api);
  plan.groups = [{ action: 'defer', keys: ['F-1'], context: '' }];
  assert.throws(() => preview(plan), /defer action was removed by #947/);
  await assert.rejects(applyPlan(plan, api), /defer action was removed by #947.*close an unwanted Task as not planned/);
  await assert.rejects(applyPlan({ ...plan, version: 3 }, api), /defer action was removed by #947/);
  assert.equal(state.events.length, 0);
});

await test('old plan versions, missing groups and empty groups refuse before any write', async () => {
  const { state, api } = fixture([reported(1, 'codex:alpha'), reported(2, 'codex:beta', 'new', 'Other', 'write-regression-test, section 3')]);
  const plan = await readPlan(api);
  await assert.rejects(applyPlan({ ...plan, version: 3 }, api), /Wrong plan version/);
  await assert.rejects(applyPlan({ ...plan, groups: plan.groups.slice(1) }, api), /must occur in exactly one group/);
  await assert.rejects(applyPlan({ ...plan, groups: [...plan.groups, { action: 'ticket', title: 'Empty', keys: [] }] }, api), /at least one problem ID/);
  await assert.rejects(applyPlan({ ...plan, groups: [{ ...plan.groups[0], title: ' ' }, plan.groups[1]] }, api), /ticket title/);
  assert.equal(state.events.length, 0);
});

await test('merged applied problems recur as new Tasks with context; unmerged ones keep their proposal', async () => {
  const text = withLedger(body, [problem('F-5', 'applied in PR #503'), problem('F-6', 'applied in PR #504', ['codex:alpha'], 'review-pr, section 4')]);
  const { state, api } = fixture([reported(20, 'codex:beta', 'F-5', 'Still happens'), reported(21, 'codex:beta', 'F-6', 'Unmerged', 'review-pr, section 4')], text);
  const plan = await readPlan(api);
  assert.deepEqual(plan.groups.map(group => [group.action, group.keys]).sort(), [['ticket', ['F-5']], ['ticket', ['F-6']]]);
  const merged = preview(plan).find(group => group.keys[0] === 'F-5');
  const unmerged = preview(plan).find(group => group.keys[0] === 'F-6');
  assert.match(merged.body, /Intake #20:\n\nStill happens/);
  assert.match(merged.body, /Previous reference for F-5: applied in PR #503\./);
  assert.match(unmerged.body, /Friction F-6\n\nSeen again \(intake #21\):\nUnmerged/);
  assert.match(unmerged.body, /closed without merging; its proposal remains actionable/);
  await applyPlan(plan, api);
  assert.match(ledgerOf(state)['F-5'].status, /^ticketed #60[01]$/);
  assert.match(ledgerOf(state)['F-5'].friction, /^Earlier feedback \(applied in PR #503; context only\):/);
  assert.ok(!ledgerOf(state)['F-6'].friction.startsWith('Earlier feedback'));
});

await test('an applied group records a merged edit in the archive and the summary without a Task', async () => {
  const { state, api } = fixture();
  const plan = await readPlan(api);
  plan.groups = [{ action: 'applied', number: 503, keys: ['F-1'] }];
  const result = await applyPlan(plan, api);
  assert.equal(state.issues.length, 0);
  assert.deepEqual(state.subIssueCalls, []);
  assert.equal(ledgerOf(state)['F-1'].status, 'applied in PR #503');
  assert.match(result.summary, /applied #503;.*Problems: F-1 → applied in PR #503\./);
  await assert.rejects(applyPlan({ ...(await readPlan(fixture().api)), groups: [{ action: 'applied', number: 504, keys: ['F-1'] }] }, fixture().api), /closed and unmerged/);
});

const legacyTable = rows => `| Skill, section | Friction | Proposed edit | Status | Problem | Reports |\n| --- | --- | --- | --- | --- | --- |\n${rows.map(row => `| ${row.skill} | ${row.friction} | ${row.edit} | ${row.status} | ${row.problemId} | ${row.sessions.length} recorded |`).join('\n')}`;

await test('migration retires every table row into the archive with its status and unchanged counts', async () => {
  const rows = [problem('F-5', 'ticketed #737', ['codex:a', 'codex:b']), problem('F-6', 'ticketed #740', ['codex:c'], 'review-pr, section 4'), problem('F-7', 'applied in PR #600', ['codex:d'], 'file-bug, section 2')];
  const archivedOnly = problem('F-4', 'applied in PR #503', ['codex:z'], 'file-task, section 1');
  const text = withLedger(`Intro\n\n## Table\n\n${legacyTable(rows)}\n\nFooter stays.\n`, [archivedOnly, ...rows]);
  const { state, api } = fixture([], text);
  state.references.set(737, task(737));
  state.references.set(740, task(740, 'closed'));
  const before = await lookupReports(api);
  const plan = await readPlan(api);
  assert.equal(plan.migrated, 3);
  assert.deepEqual(plan.groups, []);
  const result = await applyPlan(plan, api);
  assert.equal(parseLegacyTable(state.body, ledgerOf(state)), null);
  assert.ok(state.body.includes('## Table\n\n\nFooter stays.') || state.body.includes('## Table\n\nFooter stays.'));
  assert.deepEqual(state.subIssueCalls, [1000737]);
  assert.match(result.summary, /Retired 3 table rows into the archive\./);
  assert.match(result.summary, /Problems: F-5 → #737; F-6 → #740; F-7 → applied in PR #600\./);
  const after = await lookupReports(api);
  assert.deepEqual(after.reports.map(({ problemId, task, status, reports }) => ({ problemId, task, status, reports })).sort((a, b) => a.problemId.localeCompare(b.problemId)),
    before.reports.map(({ problemId, task, status, reports }) => ({ problemId, task, status, reports })).sort((a, b) => a.problemId.localeCompare(b.problemId)));
  const next = await readPlan(api);
  assert.equal(next.migrated, 0);
  assert.deepEqual(next.groups, []);
});

await test('an open table row becomes a Task in the first apply and unclassified rows refuse migration', async () => {
  const rows = [problem('F-5', 'open')];
  const text = withLedger(`Intro\n\n${legacyTable(rows)}\n`, rows);
  const { state, api } = fixture([], text);
  const plan = await readPlan(api);
  assert.deepEqual(plan.groups.map(group => [group.action, group.keys]), [['ticket', ['F-5']]]);
  await applyPlan(plan, api);
  assert.equal(ledgerOf(state)['F-5'].status, 'ticketed #600');
  const unclassified = withLedger(`Intro\n\n${legacyTable(rows).replace('| F-5 |', '| unclassified |')}\n`, rows);
  assert.throws(() => makePlan(unclassified, [], undefined, hydrateReports(unclassified, [])), /names unclassified, which is not an archived problem/);
  assert.throws(() => makePlan('| Skill, section | Friction | Proposed edit | Status |\n| --- | --- | --- | --- |\n', []), /six-column counted table/);
});

await test('an archived problem still marked open is ticketed in the next triage', () => {
  const text = withLedger(body, [problem('F-5', 'open')]);
  const plan = makePlan(text, [], undefined, hydrateReports(text, []));
  assert.deepEqual(plan.groups.map(group => [group.action, group.keys]), [['ticket', ['F-5']]]);
});

await test('forty-five new problems apply without a body-size refusal and every ID maps to a Task', async () => {
  const detail = 'A long reproduction with `code` and | pipes. '.repeat(30);
  const comments = Array.from({ length: 45 }, (_, i) => reported(100 + i, `codex:s${i}`, 'new', `${detail}${i}`, `skill-${i}, section 1`));
  const { state, api } = fixture(comments);
  const plan = await readPlan(api);
  assert.equal(plan.groups.length, 45);
  const result = await applyPlan(plan, api);
  assert.equal(state.issues.length, 45);
  assert.equal(state.comments.filter(comment => /^Problem:/.test(comment.body)).length, 0);
  const ledger = ledgerOf(state);
  assert.equal(Object.values(ledger).filter(row => /^ticketed #\d+$/.test(row.status)).length, 45);
  assert.ok(state.body.length < 10000, `body stays small: ${state.body.length}`);
  assert.equal((result.summary.match(/F-\d+ → #\d+/g) || []).length, 45);
});

await test('reports lookup prints the Task beside each problem and exposes invalid pending intake', async () => {
  const text = withLedger(body, [problem('F-5', 'ticketed #737'), problem('F-6', 'applied in PR #503')]);
  const invalid = { id: 21, body: reported(21, 'codex:alpha').body.replace('Proposed edit:', 'Proposed change:') };
  const calls = [];
  const api = { inbox: async () => { calls.push('inbox'); return { body: text }; }, comments: async () => { calls.push('comments'); return [reported(20, 'codex:alpha', 'F-5'), invalid, { id: 23, body: '<!-- skill-feedback-archive:v1 fixture -->' }]; } };
  const all = await lookupReports(api);
  assert.deepEqual(all.reports.map(row => [row.problemId, row.task]), [['F-5', 737], ['F-6', null]]);
  assert.deepEqual(all.pending.map(comment => comment.id), [20, 21]);
  assert.match(all.pending[1].reason, /contract/);
  const one = await lookupReports(api, 'F-5');
  assert.equal(one.reports[0].task, 737);
  assert.deepEqual(one.pending.map(comment => comment.id), [20]);
  assert.deepEqual([...new Set(calls)].sort(), ['comments', 'inbox']);
});

await test('unknown problems, changed skills and marker comments stay intact with reasons', () => {
  const text = withLedger(body, [problem('F-5', 'ticketed #737')]);
  const plan = makePlan(text, [reported(1, 'codex:a', 'F-9'), reported(2, 'codex:a', 'F-5', 'x', 'file-bug, section 1'), { id: 3, body: '<!-- skill-feedback-triage:0123 -->\nhuman note' }, reported(4, 'codex:a')], undefined, hydrateReports(text, []));
  assert.deepEqual(plan.ignored.map(item => [item.id, item.reason.slice(0, 29)]), [[1, 'Unknown problem F-9; referenc'], [2, 'Skill for F-5 does not match ']]);
  assert.deepEqual(plan.skipped.map(item => item.id), [3]);
  assert.deepEqual(plan.comments.map(item => item.id), [4]);
});

await test('changed body, changed intake, and changed references stop before mutations', async () => {
  for (const change of [
    state => { state.body += '\nEdited'; },
    state => { state.comments[0].body += ' edited'; },
    state => { state.references.get(737).state = 'closed'; },
  ]) {
    const text = withLedger(body, [problem('F-5', 'ticketed #737')]);
    const { state, api } = fixture([reported(20, 'codex:beta', 'F-5')], text);
    state.references.set(737, task(737));
    const plan = await readPlan(api);
    change(state);
    await assert.rejects(applyPlan(plan, api), /changed since planning/);
    assert.deepEqual(state.events, []);
  }
});

await test('created Task read-back rejects wrong type, label, body or title and keeps intake', async () => {
  for (const tamper of [issue => { issue.type = { name: 'Bug' }; }, issue => { issue.labels = []; }, issue => { issue.body += 'x'; }, issue => { issue.title += 'x'; }]) {
    const { state, api } = fixture();
    const create = api.createTicket;
    api.createTicket = async (...args) => { const issue = await create(...args); tamper(state.issues[0]); return issue; };
    await assert.rejects(applyPlan(await readPlan(api), api), /Recovered ticket #600 differs from this plan/);
    assert.equal(state.comments.length, 1);
    assert.equal(state.bodyWrites.length, 0);
  }
});

await test('an issue with another parent stays where it is and a missing attachment fails before the body write', async () => {
  const text = withLedger(body, [problem('F-5', 'ticketed #737')]);
  const { state, api } = fixture([reported(20, 'codex:beta', 'F-5')], text);
  state.references.set(737, task(737));
  state.parents.set(737, { number: 12, repo: 'Other/repo' });
  const result = await applyPlan(await readPlan(api), api);
  assert.match(result.summary, /Left under another parent: #737 \(parent Other\/repo#12\)\./);
  const second = fixture();
  second.api.addSubIssue = async id => { second.state.subIssueCalls.push(id); };
  await assert.rejects(applyPlan(await readPlan(second.api), second.api), /#600 is not listed as a sub-issue of #510/);
  assert.equal(second.state.bodyWrites.length, 0);
  assert.equal(second.state.comments.length, 1);
});

await test('summaries are replaced on the next run while fenced examples and appended prose stay', async () => {
  const example = '```text\n<!-- skill-feedback-triage:0123456789abcdef0123 -->\nFolded 1 intake comments (5); example\n<!-- skill-feedback-state:0123456789abcdef0123 -->\n```\n';
  const { state, api } = fixture([reported(1, 'codex:alpha')], body + example);
  await applyPlan(await readPlan(api), api);
  state.body += '\nMaintainer note.\n';
  state.comments.push(reported(2, 'codex:beta', 'F-1', 'Again'));
  await applyPlan(await readPlan(api), api);
  assert.equal((state.body.match(/^<!-- skill-feedback-triage:/gm) || []).length, 2);
  assert.ok(state.body.includes(example));
  assert.ok(state.body.includes('Maintainer note.'));
  assert.match(state.body, /Folded 1 intake comments \(2\)/);
  assert.equal(state.discussion.get(600).length, 1);
});

await test('folded-but-live intake refuses a fresh plan and an interrupted cleanup resumes from the body', async () => {
  const { state, api } = fixture();
  const plan = await readPlan(api);
  state.fail = 'delete';
  await assert.rejects(applyPlan(plan, api), /interrupted delete/);
  await assert.rejects(readPlan(api), /already recorded as folded but remains live/);
  const result = await applyPlan(plan, api);
  assert.equal(state.issues.length, 1);
  assert.equal(state.comments.filter(comment => comment.body === result.summary).length, 1);
});

await test('historical targets mark new problems at a pre-ID target as history incomplete and persist', async () => {
  const history = `<!-- skill-feedback-history:v1 ${Buffer.from(JSON.stringify(['review-pr, section 3'])).toString('base64')} -->`;
  const { state, api } = fixture([reported(1, 'codex:alpha')], `${body}\n<!-- skill-feedback-triage:0123456789abcdef0123 -->\nFolded 0 intake comments (none); x\n${history}\n<!-- skill-feedback-state:0123456789abcdef0123 -->\n`);
  const plan = await readPlan(api);
  assert.equal(plan.rows[0].historyIncomplete, true);
  await applyPlan(plan, api);
  assert.ok(state.body.includes(history));
  assert.equal(ledgerOf(state)['F-1'].historyIncomplete, true);
});

await test('same-target problems stay separate and are disclosed as possible duplicates', () => {
  const plan = makePlan(body, [reported(1, 'codex:a'), reported(2, 'codex:b', 'new', 'Different')]);
  assert.deepEqual(plan.groups.map(group => group.keys), [['F-1'], ['F-2']]);
  assert.deepEqual(plan.possibleDuplicates.map(item => item.keys), [['F-1', 'F-2']]);
  assert.equal(keyOf('review-pr, section 3 (prompt)'), keyOf('review-pr, section 3'));
  assert.equal(fold(body, [reported(1, 'codex:a'), reported(2, 'codex:a', 'F-1')]).rows[0].sessions.length, 1);
});

await test('a problem reported twice in one triage files a Task carrying its first report and the repeat', () => {
  const plan = makePlan(body, [reported(1, 'codex:alpha', 'new', 'ORIGINAL-REPORT'), reported(2, 'codex:beta', 'F-1', 'SECOND-REPORT')]);
  assert.deepEqual(plan.groups.map(group => [group.action, group.keys]), [['ticket', ['F-1']]]);
  const [ticket] = preview(plan);
  assert.match(ticket.body, /F-1; 2 recorded/);
  assert.match(ticket.body, /ORIGINAL-REPORT/);
  assert.match(ticket.body, /Seen again \(intake #2\):\nSECOND-REPORT/);
});

await test('an applied problem whose PR closed unmerged is filed without new intake; a merged one is not', async () => {
  const text = withLedger(body, [problem('F-5', 'applied in PR #504'), problem('F-6', 'applied in PR #503', ['codex:alpha'], 'review-pr, section 4')]);
  const { state, api } = fixture([], text);
  const plan = await readPlan(api);
  assert.deepEqual(plan.groups.map(group => [group.action, group.keys]), [['ticket', ['F-5']]]);
  assert.match(preview(plan)[0].body, /Friction F-5[\s\S]*closed without merging; its proposal remains actionable/);
  await applyPlan(plan, api);
  assert.equal(ledgerOf(state)['F-5'].status, 'ticketed #600');
  assert.equal(ledgerOf(state)['F-6'].status, 'applied in PR #503');
  assert.deepEqual((await readPlan(api)).groups, []);
});

await test('migration refuses a table status that disagrees with the archive', () => {
  const rows = [problem('F-5', 'ticketed #737')];
  const text = withLedger(`Intro\n\n${legacyTable([{ ...rows[0], status: 'open' }])}\n`, rows);
  assert.throws(() => makePlan(text, [], undefined, hydrateReports(text, [])), /Status for F-5 is open in the table but ticketed #737 in the archive/);
});

await test('migration refuses changed text, changed counts, duplicate rows and a second real table', () => {
  const rows = [problem('F-5', 'ticketed #737')];
  const check = (table, pattern) => { const text = withLedger(`Intro\n\n${table}\n`, rows); assert.throws(() => makePlan(text, [], undefined, hydrateReports(text, [])), pattern); };
  check(legacyTable(rows).replace('Friction F-5', 'Edited friction'), /Text for F-5 differs from its saved history/);
  check(legacyTable(rows).replace('1 recorded', '2 recorded'), /Reports for F-5 do not match/);
  check(legacyTable([...rows, ...rows]), /Duplicate problem F-5/);
  check(`${legacyTable(rows)}\n\n${legacyTable(rows)}`, /Multiple inbox tables/);
  const fenced = withLedger(`Intro\n\n\`\`\`text\n${legacyTable(rows)}\n\`\`\`\n`, rows);
  assert.equal(makePlan(fenced, [], undefined, hydrateReports(fenced, [])).migrated, 0);
});

await test('a projected body over the GitHub limit is refused before any write', async () => {
  const { state, api } = fixture([reported(1, 'codex:alpha')], `${body}${'Long inbox prose. '.repeat(3700)}\n`);
  await assert.rejects(applyPlan(await readPlan(api), api), /over GitHub's 65,536-character limit\. No tickets or intake were changed/);
  assert.deepEqual(state.events, []);
});

await test('fences decide what is prose: closers with info or deep indent stay open, backtick info strings never open', () => {
  assert.throws(() => makePlan(`${body}\`\`\`text\nexample\n\`\`\` trailing\n`, []), /closed code fences/);
  assert.throws(() => makePlan(`${body}\`\`\`text\nexample\n    \`\`\`\n`, []), /closed code fences/);
  assert.doesNotThrow(() => makePlan(`${body}\`\`\` not a \`fence\`\nprose\n`, []));
  assert.doesNotThrow(() => makePlan(`${body}\`\`\`\`text\n\`\`\`\nnested\n\`\`\`\n\`\`\`\`\n`, []));
  assert.throws(() => makePlan(`${body}<!-- skill-feedback-history:v1 !!! -->\n`, []), /Malformed historical-target marker/);
});

await test('every write-side guard refuses with intake intact', async () => {
  const cases = [
    ['duplicate ticket recovery markers', ({ state, api }, plan) => { const marker = preview(plan)[0].body.match(/Feedback group: [a-f0-9]{20}/)[0]; state.issues.push({ ...task(650), body: marker }, { ...task(651), body: marker }); }, /Multiple tickets carry a group recovery marker/],
    ['inbox edited during triage', ({ state, api }) => { const create = api.createTicket; api.createTicket = async (...args) => { state.body += '\nEdited'; return create(...args); }; }, /Inbox changed during triage/],
    ['body read-back differs', ({ state, api }) => { api.updateBody = async text => { state.body = text + 'x'; }; }, /Inbox body read-back differs/],
    ['intake edited before deletion', ({ state, api }) => { const update = api.updateBody; api.updateBody = async text => { await update(text); state.comments[0].body += ' edited'; }; }, /Intake 1 changed before deletion/],
    ['deletion that did not persist', ({ api }) => { api.deleteComment = async () => {}; }, /An intake deletion did not persist/],
    ['summary read-back differs', ({ state, api }) => { const post = api.postSummary; api.postSummary = async text => { const comment = await post(text); if (text.includes('Folded')) state.comments.at(-1).body += 'x'; return comment; }; }, /Summary failed read-back/],
    ['reports history changed since planning', (_, plan) => { plan.reportHistory = { 'F-9': problem('F-9', 'open') }; }, /Reports history changed since planning/],
  ];
  for (const [name, arrange, pattern] of cases) {
    const context = fixture();
    const plan = await readPlan(context.api);
    arrange(context, plan);
    await assert.rejects(applyPlan(plan, context.api), pattern, name);
    // The summary is read back after intake deletion, once everything else is persisted.
    if (!name.startsWith('summary')) assert.ok(context.state.comments.some(comment => comment.id === 1), `${name}: intake kept`);
  }
});

await test('existing-target guards: wrong type, duplicate evidence and evidence read-back keep intake', async () => {
  const setup = () => { const text = withLedger(body, [problem('F-5', 'ticketed #737')]); const context = fixture([reported(20, 'codex:beta', 'F-5')], text); context.state.references.set(737, task(737)); return context; };
  let context = setup();
  let plan = await readPlan(context.api);
  context.state.references.get(737).type = { name: 'Bug' };
  await assert.rejects(applyPlan(plan, context.api), /#737 is not a workflow: skills Task/);
  context = setup();
  plan = await readPlan(context.api);
  const marker = preview(plan)[0].body.match(/Feedback group: [a-f0-9]{20}/)[0];
  context.state.discussion.set(737, [{ id: 1, body: marker }, { id: 2, body: marker }]);
  await assert.rejects(applyPlan(plan, context.api), /Multiple existing-ticket evidence comments carry this marker on Task #737: #1, #2/);
  context = setup();
  plan = await readPlan(context.api);
  const post = context.api.postIssueComment;
  context.api.postIssueComment = async (number, text) => { const comment = await post(number, text); context.state.discussion.get(number)[0].body += 'x'; return comment; };
  await assert.rejects(applyPlan(plan, context.api), /Existing-ticket evidence failed read-back for Task #737/);
  assert.equal(context.state.comments.length, 1);
});

await test('a body edited after an interrupted fold cannot authorize deletion on retry', async () => {
  const { state, api } = fixture();
  const plan = await readPlan(api);
  state.fail = 'delete';
  await assert.rejects(applyPlan(plan, api), /interrupted delete/);
  state.body = state.body.replace('Footer stays.', 'Footer edited.');
  await assert.rejects(applyPlan(plan, api), /Persisted inbox changed after folding/);
  assert.equal(state.comments.filter(comment => comment.id === 1).length, 1);
});

await test('CLI rejects inside ..prefix paths and accepts outside siblings', () => {
  const scratch = mkdtempSync(resolve(tmpdir(), 'triage-path-check-'));
  try {
    const checkout = resolve(scratch, 'repo');
    const script = resolve(checkout, '.agents/skills/triage-skill-feedback/triage-skill-feedback.mjs');
    mkdirSync(resolve(script, '..'), { recursive: true });
    copyFileSync(fileURLToPath(new URL('./triage-skill-feedback.mjs', import.meta.url)), script);
    copyFileSync(fileURLToPath(new URL('./feedback-reports.mjs', import.meta.url)), resolve(script, '../feedback-reports.mjs'));
    copyFileSync(fileURLToPath(new URL('./feedback-archive.mjs', import.meta.url)), resolve(script, '../feedback-archive.mjs'));
    const otherRepo = resolve(scratch, 'other-repo');
    mkdirSync(resolve(otherRepo, '.git'), { recursive: true });
    const otherWorktree = resolve(scratch, 'other-worktree');
    mkdirSync(otherWorktree); writeFileSync(resolve(otherWorktree, '.git'), 'gitdir: somewhere');
    for (const [path, accepted] of [
      [resolve(checkout, '..scratch/plan.json'), false],
      [resolve(checkout, '..plan.json'), false],
      [resolve(checkout, 'ordinary/plan.json'), false],
      [resolve(scratch, 'outside/plan.json'), true],
      [resolve(scratch, 'repo-sibling/plan.json'), true],
      [resolve(scratch, '..sibling/plan.json'), true],
      [resolve(otherRepo, 'nested/plan.json'), false],
      [resolve(otherWorktree, 'nested/plan.json'), false],
    ]) {
      mkdirSync(resolve(path, '..'), { recursive: true });
      writeFileSync(path, JSON.stringify({ groups: [], rows: [] }));
      const before = readdirSync(resolve(path, '..'));
      const result = spawnSync(process.execPath, [script, 'preview', path], { encoding: 'utf8', windowsHide: true });
      assert.equal(result.status, accepted ? 0 : 1, path);
      if (accepted) assert.deepEqual(JSON.parse(result.stdout), []);
      else assert.match(result.stderr, /Keep the plan outside (?:the checkout|every Git checkout)/);
      assert.deepEqual(readdirSync(resolve(path, '..')), before, 'preview leaves no artifact directory');
    }
  } finally {
    assert.ok(scratch.startsWith(resolve(tmpdir(), 'triage-path-check-')));
    rmSync(scratch, { recursive: true, force: true });
  }
});

console.log(`All ${passed} triage checks passed.`);
