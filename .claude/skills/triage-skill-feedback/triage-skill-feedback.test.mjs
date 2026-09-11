import { hydrateReports } from './feedback-archive.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseTable, renderTable, parseIntake, keyOf, fold, makePlan, readPlan, preview, applyPlan } from './triage-skill-feedback.mjs';

const body = 'Intro\n\n## Table\n\n| Skill, section | Friction | Proposed edit | Status |\n| --- | --- | --- | --- |\n| review-pr, section 3 | A \\| B | Keep `C:\\path` | open |\n\nFooter stays.\n';
const intake = (id, skill = 'review-pr, section 3 (prompt)', friction = 'New friction') => ({ id, body: `Skill and section: ${skill}\n\nWhat happened: ${friction}\n\nProposed edit: Preserve \\slashes and | pipes.`, html_url: `https://example.test/${id}` });
let passed = 0;
async function test(name, run) { try { await run(); console.log(`PASS: ${name}`); passed++; } catch (error) { console.error(`FAIL: ${name}`); throw error; } }

await test('positive control: an empty canonical table preserves its surrounding prose', () => {
  assert.equal(renderTable(body, []).includes('Footer stays.'), true);
  assert.equal(parseTable(renderTable(body, [])).rows.length, 0);
});

await test('parser preserves escaped pipes and backslashes and rejects malformed rows', () => {
  assert.equal(parseTable(body).rows[0].friction, 'A | B');
  assert.equal(parseTable(body).rows[0].edit, 'Keep `C:\\path`');
  assert.throws(() => parseTable(body.replace('| open |', '| guessed |')), /Invalid inbox row/);
  assert.throws(() => parseTable(body.replace('Skill, section', 'Renamed')), /contract/);
  const rows = [{ skill: 's', friction: 'x|y\nz', edit: '\\path', status: 'open' }];
  const rendered = renderTable(body, rows);
  assert.deepEqual(parseTable(rendered).rows, rows);
  assert.ok(rendered.startsWith('Intro\n'));
  assert.ok(rendered.endsWith('Footer stays.\n'));
});
await test('both intake label styles work; summaries are skipped and malformed intake is retained', () => {
  const plain = intake(1);
  assert.deepEqual(parseIntake(plain), parseIntake({ ...plain, body: plain.body.replace(/^(Skill and section|What happened|Proposed edit):/gm, '**$1:**') }));
  assert.deepEqual(parseIntake(plain), parseIntake({ ...plain, body: plain.body.replace(/^(Skill and section|What happened|Proposed edit):/gm, '**$1**:') }));
  assert.equal(parseIntake({ body: '<!-- skill-feedback-triage:abc -->\nFolded 2.' }), null);
  assert.throws(() => parseIntake({ id: 9, body: 'Unknown comment' }), /Comment 9/);
});
await test('dedup uses skill and section, retains both proposals and records seen again', () => {
  const result = fold(body, [intake(1), intake(2, 'write-regression-test, section 3', 'Other')]);
  assert.equal(result.rows.length, 2);
  assert.equal(keyOf('review-pr, section 3 (prompt)'), keyOf('review-pr, section 3'));
  assert.match(result.rows[0].friction, /A \| B\n\nSeen again \(intake #1\):\nNew friction/);
  assert.match(result.rows[0].edit, /Keep.*\n\nSeen again \(intake #1\):\nPreserve/);
  assert.equal(fold(renderTable(body, result.rows), [intake(1)]).rows.length, 2);
  assert.equal(result.folded.length, 2);
});
await test('new feedback reopens an applied section instead of disappearing with its merged PR', async () => {
  const appliedBody = body.replace('| open |', '| applied in PR #503 |');
  const result = fold(appliedBody, [intake(4)]);
  assert.equal(result.rows[0].status, 'open');
  assert.match(result.rows[0].edit, /Earlier feedback \(applied in PR #503; context only\)/);
  assert.match(result.rows[0].friction, /New friction/);
});

function fixture(comments = [intake(1)]) {
  const state = { body, comments: structuredClone(comments), issues: [], references: new Map(), discussion: new Map(), bodyWrites: [], events: [], fail: null, nextSummaryId: 999 };
  const checkpoint = name => { state.events.push(name); if (state.fail === name) { state.fail = null; throw new Error(`interrupted ${name}`); } };
  const api = {
    inbox: async () => ({ body: state.body }), comments: async () => structuredClone(state.comments), issues: async () => structuredClone(state.issues),
    issue: async number => {
      const issue = state.issues.find(i => i.number === number) || state.references.get(number);
      if (!issue) throw new Error(`Fixture has no issue #${number}`);
      return structuredClone(issue);
    },
    pr: async number => ({ number, state: number === 503 ? 'closed' : 'open', merged_at: number === 503 ? '2026-01-01' : null }),
    issueComments: async number => structuredClone(state.discussion.get(number) || []),
    postIssueComment: async (number, text) => { const discussion = state.discussion.get(number) || []; const comment = { id: 800 + discussion.length, body: text }; discussion.push(comment); state.discussion.set(number, discussion); checkpoint('evidence'); return comment; },
    createTicket: async (title, text) => { const issue = { number: state.issues.length + 600, title, body: text, state: 'open', type: { name: 'Task' }, labels: [{ name: 'workflow: skills' }] }; state.issues.push(issue); checkpoint('created'); return issue; },
    updateBody: async text => { state.bodyWrites.push(text); state.body = text; checkpoint('persisted'); },
    deleteComment: async id => { checkpoint('delete'); state.comments = state.comments.filter(c => c.id !== id); },
    postSummary: async text => { while (state.comments.some(comment => comment.id === state.nextSummaryId)) state.nextSummaryId++; const comment = { id: state.nextSummaryId++, body: text, html_url: 'https://example.test/summary' }; state.comments.push(comment); checkpoint('summary'); return comment; },
  };
  return { state, api, plan: makePlan(body, comments) };
}
await test('successful run persists verified rows before deleting intake and posts one summary', async () => {
  const { state, api, plan } = fixture();
  const result = await applyPlan(plan, api);
  assert.deepEqual(state.events, ['created', 'persisted', 'delete', 'summary']);
  assert.equal(parseTable(state.body, hydrateReports(state.body, state.comments)).rows[0].status, 'ticketed #600');
  assert.match(state.issues[0].body, /## Acceptance criteria/);
  assert.match(state.issues[0].body, /Feedback group: [a-f0-9]{20}/);
  assert.ok(!state.issues[0].body.includes('<!--'));
  assert.equal(result.url, 'https://example.test/summary');
  await applyPlan(plan, api);
  assert.equal(state.issues.length, 1);
  assert.equal(state.comments.length, 1);
});
for (const stage of ['created', 'persisted', 'delete', 'summary']) await test(`retry after ${stage} recovers without duplicate tickets or lost intake`, async () => {
  const { state, api, plan } = fixture(); state.fail = stage;
  await assert.rejects(applyPlan(plan, api), /interrupted/);
  await applyPlan(plan, api);
  assert.equal(state.issues.length, 1);
  assert.equal(state.comments.length, 1);
  assert.match(state.comments[0].body, /Folded 1/);
});
await test('changed body, changed intake and missing plan decisions stop before mutations', async () => {
  for (const change of ['body', 'comment', 'group']) {
    const { state, api, plan } = fixture();
    if (change === 'body') state.body += 'concurrent edit';
    if (change === 'comment') state.comments[0].body += ' changed';
    if (change === 'group') plan.groups = [];
    await assert.rejects(applyPlan(plan, api));
    assert.deepEqual(state.events, []);
  }
});
await test('failed body readback or edited intake before deletion preserves comments', async () => {
  for (const change of ['body', 'comment']) {
    const { state, api, plan } = fixture();
    api.updateBody = async text => { state.body = text + (change === 'body' ? ' altered' : ''); if (change === 'comment') state.comments[0].body += ' changed'; };
    await assert.rejects(applyPlan(plan, api));
    assert.equal(state.comments[0].id, 1);
    assert.ok(!state.events.includes('delete'));
  }
});
await test('a body edited after an interrupted fold cannot authorize deletion on retry', async () => {
  const { state, api, plan } = fixture(); state.fail = 'persisted';
  await assert.rejects(applyPlan(plan, api), /interrupted/);
  state.body = state.body.replace('New friction', 'removed content');
  await assert.rejects(applyPlan(plan, api), /changed after folding/);
  assert.equal(state.comments[0].id, 1);
});
await test('closed tickets and merged edits leave table; an open applied PR remains', async () => {
  const { state, api, plan } = fixture([]);
  plan.groups[0] = { action: 'applied', number: 503, keys: plan.groups[0].keys };
  await applyPlan(plan, api);
  assert.equal(parseTable(state.body, hydrateReports(state.body, state.comments)).rows.length, 0);
  assert.match(state.comments[0].body, /removed review-pr/);
  const other = fixture([]);
  other.plan.groups[0] = { action: 'applied', number: 700, keys: other.plan.groups[0].keys };
  await applyPlan(other.plan, other.api);
  assert.equal(parseTable(other.state.body).rows[0].status, 'applied in PR #700');
  const closed = fixture([]);
  closed.state.body = body.replace('| open |', '| ticketed #701 |');
  closed.api.issue = async number => ({ number, state: 'closed' });
  await applyPlan(makePlan(closed.state.body, []), closed.api);
  assert.equal(parseTable(closed.state.body).rows.length, 0);
});
await test('multiline summary survives retry after a posted response is lost', async () => {
  const { state, api } = fixture([]);
  state.body = body.replace('review-pr, section 3', 'review-pr,<br>section 3');
  const plan = makePlan(state.body, []);
  plan.groups[0] = { action: 'applied', number: 503, keys: plan.groups[0].keys };
  state.fail = 'summary';
  await assert.rejects(applyPlan(plan, api), /interrupted/);
  const generated = state.comments[0].body;
  const expected = generated.replace('removed review-pr,<br>section 3', 'removed review-pr,\nsection 3');
  state.comments[0].body = expected;
  const legacyContent = state.body.slice(0, state.body.lastIndexOf('\n<!-- skill-feedback-state:')).replace(generated, expected);
  state.body = legacyContent + '\n<!-- skill-feedback-state:' + createHash('sha256').update(legacyContent).digest('hex').slice(0, 20) + ' -->\n';
  assert.match(expected, /removed review-pr,\nsection 3/);
  await applyPlan(plan, api);
  assert.equal(state.comments.length, 1);
  assert.equal(state.comments[0].body, expected);
});
await test('next run preserves prose appended below the previous state block', async () => {
  const { state, api, plan } = fixture();
  await applyPlan(plan, api);
  const suffix = '\n## Maintainer notes\n\nKeep the unresolved decision here.\n';
  state.body += suffix;
  await applyPlan(await readPlan(api), api);
  assert.ok(state.body.includes(suffix));
  assert.equal((state.body.match(/<!-- skill-feedback-triage:/g) || []).length, 1);
});
await test('unparsed comments have explicit reasons and remain byte-for-byte while valid intake folds', async () => {
  const ordinary = { id: 2, body: 'A maintainer reply.\n' };
  const malformed = { id: 3, body: 'Skill and section: review-pr\n\nWhat happened: missing edit.\n' };
  const { state, api, plan } = fixture([intake(1), ordinary, malformed]);
  assert.deepEqual(plan.ignored.map(c => c.id), [2, 3]);
  assert.ok(plan.ignored.every(c => c.reason.includes('contract')));
  assert.deepEqual(plan.ignored.map(c => c.body), [ordinary.body, malformed.body]);
  await applyPlan(plan, api);
  assert.deepEqual(state.comments.slice(0, 2), [ordinary, malformed]);
  assert.match(state.comments[2].body, /left unparsed comments 2, 3 intact/);
});
await test('existing ticket evidence is exact, durable, and recovered before intake deletion', async () => {
  const { state, api, plan } = fixture();
  state.references.set(701, { number: 701, state: 'open', type: { name: 'Task' }, labels: [{ name: 'workflow: skills' }] });
  plan.groups[0] = { action: 'existing', number: 701, keys: plan.groups[0].keys };
  const expected = preview(plan)[0].body;
  state.fail = 'evidence';
  await assert.rejects(applyPlan(plan, api), /interrupted evidence/);
  assert.equal(state.comments[0].id, 1);
  await applyPlan(plan, api);
  assert.deepEqual([...state.discussion.keys()], [701]);
  assert.equal(state.discussion.get(701).length, 1);
  assert.equal(state.discussion.get(701)[0].body, expected);
  assert.ok(state.events.indexOf('evidence') < state.events.indexOf('delete'));
  assert.equal(parseTable(state.body, hydrateReports(state.body, state.comments)).rows.length, 1);
  assert.match(state.discussion.get(701)[0].body, /New friction/);
});
await test('existing evidence read-back mismatch keeps intake intact', async () => {
  const { state, api, plan } = fixture();
  state.references.set(701, { number: 701, state: 'open', type: { name: 'Task' }, labels: [{ name: 'workflow: skills' }] });
  plan.groups[0] = { action: 'existing', number: 701, keys: plan.groups[0].keys };
  api.postIssueComment = async number => { const item = { id: 800, body: 'Wrong text' }; state.discussion.set(number, [item]); return item; };
  await assert.rejects(applyPlan(plan, api), /evidence failed read-back/);
  assert.equal(state.comments[0].id, 1);
  assert.ok(!state.events.includes('delete'));
});
await test('closed unmerged applied targets reject, and already parked rows reopen with provenance', async () => {
  const { state, api, plan } = fixture();
  api.pr = async number => ({ number, state: 'closed', merged_at: null });
  plan.groups[0] = { action: 'applied', number: 777, keys: plan.groups[0].keys };
  await assert.rejects(applyPlan(plan, api), /closed and unmerged/);
  assert.equal(state.comments[0].id, 1);
  state.body = body.replace('| open |', '| applied in PR #777 |'); state.comments = [];
  const reopened = await readPlan(api);
  assert.equal(reopened.rows[0].status, 'open');
  assert.equal(reopened.rows[0].previousStatus, 'applied in PR #777');
  assert.match(preview(reopened)[0].body, /applied in PR #777/);
  await applyPlan(reopened, api);
  assert.equal(state.issues.length, 1);
  assert.match(state.issues[0].body, /pull request closed without merging/);
});
await test('new feedback suggests the existing open ticket and reference changes require replanning', async () => {
  const { state, api } = fixture();
  state.body = body.replace('| open |', '| ticketed #601 |');
  const ticket = { number: 601, state: 'open', type: { name: 'Task' }, labels: [{ name: 'workflow: skills' }] }; state.issues.push(ticket);
  const plan = await readPlan(api);
  assert.equal(plan.rows[0].previousStatus, 'ticketed #601');
  assert.equal(plan.groups[0].action, 'existing'); assert.equal(plan.groups[0].number, 601);
  ticket.state = 'closed';
  await assert.rejects(applyPlan(plan, api), /changed since planning/);
  assert.deepEqual(state.events, []);
  ticket.state = 'open'; await applyPlan(plan, api);
  assert.equal(state.issues.length, 1); assert.equal(state.discussion.get(601).length, 1);
});
await test('closed existing targets are refused before any persistence', async () => {
  const { state, api, plan } = fixture();
  plan.groups[0] = { action: 'existing', number: 701, keys: plan.groups[0].keys };
  api.issue = async number => ({ number, state: 'closed', type: { name: 'Task' }, labels: [{ name: 'workflow: skills' }] });
  await assert.rejects(applyPlan(plan, api), /Task #701 is closed/);
  assert.deepEqual(state.events, []); assert.equal(state.comments[0].id, 1);
});
await test('section keys retain decimals and multiple skills without guessing named synonyms', () => {
  for (const value of ['review-pr section 3', 'review-pr, in section 3', 'review-pr, section 3 (prompt)']) assert.equal(keyOf(value), 'review-pr, section 3');
  assert.notEqual(keyOf('a, section 3.2'), keyOf('a, section 3.9'));
  assert.notEqual(keyOf('review-pr, section 3 and file-bug, section 2'), keyOf('review-pr, section 3'));
  assert.notEqual(keyOf('review-pr, adjudication'), keyOf('review-pr, Adjudicate step'));
  assert.equal(fold(body, [intake(7, 'review-pr, section 3 and file-bug, section 2')]).rows.length, 2);
});
await test('acted-on recurrence stays actionable even when both fields are substrings', async () => {
  const comment = { id: 55, body: 'Skill and section: review-pr, section 3\n\nWhat happened: friction\n\nProposed edit: edit' };
  const { state, api } = fixture([comment]);
  state.body = renderTable(body, [{ skill: 'review-pr, section 3', friction: 'Old friction details', edit: 'A longer edit proposal', status: 'ticketed #601' }]);
  state.issues.push({ number: 601, state: 'open', type: { name: 'Task' }, labels: [{ name: 'workflow: skills' }] });
  const plan = await readPlan(api);
  assert.equal(plan.rows[0].status, 'open'); assert.equal(plan.groups[0].action, 'existing');
  await applyPlan(plan, api);
  const evidence = state.discussion.get(601)[0].body;
  assert.match(evidence, /Intake #55:\n\nfriction\n\nProposed change: edit/);
  assert.ok(!evidence.includes('Old friction')); assert.ok(!evidence.includes('A longer edit proposal'));
  assert.match(parseTable(state.body, hydrateReports(state.body, state.comments)).rows[0].friction, /context only/);
});
await test('already-applied text is context rather than a new Task instruction', () => {
  const plan = makePlan(body.replace('| open |', '| applied in PR #503 |'), [intake(1)]);
  const ticket = preview(plan)[0].body;
  assert.match(ticket, /New friction/); assert.match(ticket, /applied in PR #503/);
  assert.ok(!ticket.includes('Old friction')); assert.ok(!ticket.includes('Keep `C:'));
  assert.match(plan.rows[0].edit, /context only/);
});
await test('normalized table values round-trip without code spans swallowing entities or breaks', () => {
  const rows = [{ skill: 's, section 1', friction: 'Run `git ls-files | wc -l` then plain |. C:\\path\\\\pair', edit: '```sh\nnode t.mjs\n```\nLiteral &#124; <br> **stars** \\*', status: 'open' }];
  const encoded = renderTable(body, rows);
  assert.deepEqual(parseTable(encoded).rows, rows);
  const row = encoded.split('\n').find(line => line.startsWith('| <!--'));
  assert.ok(!row.includes('`')); assert.ok(!row.includes('\\'));
  assert.ok(row.includes('&#96;')); assert.ok(row.includes('&#124;')); assert.ok(row.includes('&amp;#124;')); assert.ok(row.includes('&lt;br&gt;'));
  assert.equal(parseTable(body).rows[0].friction, 'A | B', 'legacy decoding remains available');
});
await test('summary cleanup preserves fenced marker examples and following prose', async () => {
  const { state, api } = fixture();
  const example = '\n## Examples\n\n```text\n<!-- skill-feedback-triage:00000000000000000000 -->\n```\nKeep this explanation.\n\n~~~text\n<!-- skill-feedback-triage:11111111111111111111 -->\nFolded 0.\n<!-- skill-feedback-state:22222222222222222222 -->\n~~~\nKeep this too.\n';
  state.body += example;
  await applyPlan(makePlan(state.body, state.comments), api);
  assert.ok(state.body.includes(example));
  await applyPlan(await readPlan(api), api);
  assert.ok(state.body.includes(example));
});
await test('changed recovered ticket refuses with precise recovery advice and preserves intake', async () => {
  const { state, api, plan } = fixture(); state.fail = 'created';
  await assert.rejects(applyPlan(plan, api), /interrupted/);
  plan.groups[0].title = 'A deliberate title change';
  await assert.rejects(applyPlan(plan, api), /Recovered ticket #600.*same unedited plan.*fresh plan with an existing decision/);
  assert.equal(state.issues.length, 1); assert.equal(state.comments[0].id, 1);
  const next = makePlan(state.body, state.comments);
  next.groups[0] = { action: 'existing', number: 600, keys: next.groups[0].keys };
  await applyPlan(next, api); assert.equal(state.issues.length, 1); assert.equal(state.discussion.get(600).length, 1);
});
await test('created Task read-back rejects wrong type, label, body or title', async () => {
  for (const change of [{ type: { name: 'Bug' } }, { labels: [] }, { body: 'Wrong body' }, { title: 'Wrong title' }]) {
    const { state, api, plan } = fixture();
    const read = api.issue;
    api.issue = async number => ({ ...await read(number), ...change });
    await assert.rejects(applyPlan(plan, api), /differs from this plan/);
    assert.equal(state.comments[0].id, 1); assert.deepEqual(state.bodyWrites, []);
  }
});
await test('existing target validation rejects a PR, wrong type, or missing label', async () => {
  for (const change of [{ pull_request: {} }, { type: { name: 'Bug' } }, { labels: [] }]) {
    const { state, api, plan } = fixture();
    plan.groups[0] = { action: 'existing', number: 512, keys: plan.groups[0].keys };
    state.references.set(512, { number: 512, state: 'open', type: { name: 'Task' }, labels: [{ name: 'workflow: skills' }], ...change });
    await assert.rejects(applyPlan(plan, api), /not a workflow: skills Task/);
    assert.deepEqual(state.events, []);
  }
});
await test('duplicate recovery markers stop before choosing an arbitrary Task', async () => {
  const { state, api, plan } = fixture(); state.fail = 'created';
  await assert.rejects(applyPlan(plan, api), /interrupted/);
  state.issues.push({ ...state.issues[0], number: 601 });
  await assert.rejects(applyPlan(plan, api), /Multiple tickets/);
  assert.equal(state.issues.length, 2); assert.equal(state.comments[0].id, 1);
});
await test('captured row tampering stops before writing', async () => {
  const { state, api, plan } = fixture(); plan.rows[0].friction = 'Changed after capture';
  await assert.rejects(applyPlan(plan, api), /Plan rows differ/);
  assert.deepEqual(state.events, []);
});
await test('tampered observation metadata cannot change preview while apply posts different text', async () => {
  for (const field of ['observations', 'previousStatus']) {
    const { state, api } = fixture();
    state.body = body.replace('| open |', '| applied in PR #503 |');
    const plan = makePlan(state.body, state.comments);
    const originalPreview = preview(plan)[0].body;
    if (field === 'observations') plan.rows[0].observations[0].edit = 'Altered preview proposal';
    else delete plan.rows[0].previousStatus;
    assert.notEqual(preview(plan)[0].body, originalPreview);
    await assert.rejects(applyPlan(plan, api), /Plan rows differ/);
    assert.deepEqual(state.events, []);
  }
});
await test('body edited after initial validation is not overwritten', async () => {
  const { state, api, plan } = fixture(); let reads = 0;
  api.inbox = async () => { if (++reads === 2) state.body += '\nConcurrent update'; return { body: state.body }; };
  await assert.rejects(applyPlan(plan, api), /Inbox changed during triage/);
  assert.ok(state.body.endsWith('Concurrent update')); assert.deepEqual(state.bodyWrites, []); assert.equal(state.comments[0].id, 1);
});
await test('an intake deletion that did not persist is reported before summary', async () => {
  const { state, api, plan } = fixture(); api.deleteComment = async () => {};
  await assert.rejects(applyPlan(plan, api), /deletion did not persist/);
  assert.equal(state.comments[0].id, 1); assert.ok(!state.events.includes('summary'));
});
await test('summary read-back rejects changed text', async () => {
  const { state, api, plan } = fixture();
  api.postSummary = async () => { const item = { id: 999, body: 'Changed summary' }; state.comments.push(item); return item; };
  await assert.rejects(applyPlan(plan, api), /Summary failed read-back/);
});
await test('empty intake values are rejected', () => {
  for (const label of ['Skill and section', 'What happened', 'Proposed edit']) {
    const comment = intake(77);
    comment.body = comment.body.replace(new RegExp(`${label}: [^\\n]*`), `${label}:`);
    assert.throws(() => parseIntake(comment), /empty intake field/);
  }
});
await test('CLI rejects inside ..prefix paths and accepts outside siblings', () => {
  const scratch = mkdtempSync(resolve(tmpdir(), 'triage-path-check-'));
  try {
    const checkout = resolve(scratch, 'repo');
    const script = resolve(checkout, '.claude/skills/triage-skill-feedback/triage-skill-feedback.mjs');
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
      const result = spawnSync(process.execPath, [script, 'preview', path], { encoding: 'utf8' });
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
await test('unmerged applied PR recurrence persists both proposals before deleting intake', async () => {
  const { state, api } = fixture();
  state.body = body.replace('| open |', '| applied in PR #503 |');
  api.pr = async number => ({ number, state: 'closed', merged_at: null });
  const plan = JSON.parse(JSON.stringify(await readPlan(api)));
  const proposed = preview(plan)[0].body;
  assert.match(proposed, /Keep `C:/);
  assert.match(proposed, /Preserve.*slashes/);
  assert.match(proposed, /closed without merging/);
  assert.ok(!plan.rows[0].edit.includes('context only'));
  await applyPlan(plan, api);
  assert.equal(state.issues[0].body, proposed);
  assert.equal(state.comments.some(comment => comment.id === 1), false);
});
await test('closed-ticket recurrence names closure without reactivating prior proposals', async () => {
  for (const state_reason of ['completed', 'not_planned']) {
    const { state, api } = fixture();
    state.body = body.replace('| open |', '| ticketed #601 |');
    state.references.set(601, { state: 'closed', state_reason });
    const plan = await readPlan(api);
    const proposed = preview(plan)[0].body;
    assert.match(proposed, /ticketed #601 \(closed; closure does not establish/);
    assert.ok(!proposed.includes('Keep `C:'));
    assert.match(proposed, /Preserve.*slashes/);
    assert.equal(plan.groups[0].action, 'ticket');
  }
});
await test('dotted numbered targets normalize while named parentheses and multi-target keys stay distinct', () => {
  assert.equal(keyOf('CLAUDE.md, section 3 (filing)'), keyOf('CLAUDE.md, section 3'));
  assert.notEqual(keyOf('review-pr, adjudication (out-of-order reviews)'), keyOf('review-pr, adjudication'));
  assert.notEqual(keyOf('CLAUDE.md, section 3.1'), keyOf('CLAUDE.md, section 3'));
  assert.notEqual(keyOf('CLAUDE.md, section 3 and review-pr, section 4'), keyOf('CLAUDE.md, section 3'));
});
await test('ignored diagnostics disclose recognized labels without changing comment bytes', () => {
  const comments = [{ id: 1, body: 'Thank you.\r\n' }, { id: 2, body: 'Skill and section: x\nWhat happened: y' }];
  const result = fold(body, comments);
  assert.deepEqual(result.ignored.map(comment => comment.body), comments.map(comment => comment.body));
  assert.match(result.ignored[0].reason, /0 of 3 distinct required labels across 0 occurrences \(none\)/);
  assert.match(result.ignored[1].reason, /2 of 3 distinct required labels across 2 occurrences \(Skill and section, What happened\)/);
  const wrongOrder = fold(body, [{ id: 3, body: 'Proposed edit: x\nWhat happened: y\nSkill and section: z' }]);
  assert.match(wrongOrder.ignored[0].reason, /Proposed edit, What happened, Skill and section/);
});
await test('same-ticket recurrences avoid new prefixes while preserving pre-existing literal prefixes', () => {
  const prefix = 'Earlier feedback (ticketed #601; context only):\n';
  for (const existingPrefixes of [0, 3]) {
  let current = renderTable(body, [{ skill: 'review-pr, section 3', friction: prefix.repeat(existingPrefixes) + 'Original friction', edit: prefix.repeat(existingPrefixes) + 'Original proposal', status: 'ticketed #601' }]);
  for (let id = 21; id <= 23; id++) {
    const plan = makePlan(current, [intake(id)], { prs: {}, issues: { 601: { state: 'open' } } });
    current = renderTable(body, plan.rows.map(row => ({ ...row, status: 'ticketed #601' })));
  }
  const row = parseTable(current).rows[0];
  for (const field of ['friction', 'edit']) {
    assert.equal(row[field].split(prefix).length - 1, existingPrefixes || 1);
    assert.ok(row[field].includes('Original'));
    for (let id = 21; id <= 23; id++) assert.ok(row[field].includes(`intake #${id}`));
  }
  }
});

await test('unmerged recurrence preserves literal context prefixes already in source feedback', () => {
  const prefix = 'Earlier feedback (applied in PR #503; context only):\n';
  const original = { skill: 'review-pr, section 3', friction: prefix.repeat(2) + 'Original friction', edit: prefix.repeat(2) + 'Original proposal', status: 'applied in PR #503' };
  const plan = makePlan(renderTable(body, [original]), [intake(1)], { prs: { 503: { state: 'closed', merged_at: null } }, issues: {} });
  assert.ok(plan.rows[0].friction.startsWith(original.friction));
  assert.ok(plan.rows[0].edit.startsWith(original.edit));
  assert.equal(plan.rows[0].edit.split(prefix).length - 1, 2);
  assert.match(preview(plan)[0].body, /Original proposal/);
  assert.match(preview(plan)[0].body, /proposal remains actionable/);
});

await test('mixed-status duplicate table rows refuse both orders without writes or deletions', async () => {
  for (const status of ['ticketed #601', 'applied in PR #503']) for (const reverse of [false, true]) {
    const { state, api } = fixture([]);
    const old = { skill: 'review-pr, section 3', friction: 'Earlier', edit: 'Earlier proposal', status };
    const fresh = { ...old, friction: 'New work', edit: 'New proposal', status: 'open' };
    state.body = renderTable(body, reverse ? [fresh, old] : [old, fresh]);
    const before = state.body;
    await assert.rejects(readPlan(api), /Conflicting statuses.*resolve the table first/);
    assert.equal(state.body, before);
    assert.deepEqual(state.events, []);
  }
});
await test('existing evidence mismatch names the artifact and original-plan recovery', async () => {
  const { state, api } = fixture();
  state.body = body.replace('| open |', '| ticketed #601 |');
  state.references.set(601, { number: 601, state: 'open', type: { name: 'Task' }, labels: [{ name: 'workflow: skills' }] });
  const plan = await readPlan(api);
  state.fail = 'evidence';
  await assert.rejects(applyPlan(plan, api), /interrupted evidence/);
  const changed = structuredClone(plan);
  changed.groups[0].context += ' Edited context.';
  await assert.rejects(applyPlan(changed, api), /Task #601, comment #800.*original unedited plan/);
  assert.equal(state.comments[0].id, 1);
  assert.equal(state.discussion.get(601).length, 1);
  await applyPlan(plan, api);
  assert.equal(state.discussion.get(601).length, 1);
  assert.equal(state.comments.some(comment => comment.id === 1), false);
});

await test('existing evidence preview preserves all feedback and context without a new Task template', async () => {
  const { state, api } = fixture([intake(1), intake(2, 'review-pr, section 3', 'Second observation')]);
  state.body = body.replace('| open |', '| ticketed #601 |');
  state.references.set(601, { number: 601, state: 'open', type: { name: 'Task' }, labels: [{ name: 'workflow: skills' }] });
  const plan = await readPlan(api);
  assert.ok(!plan.groups[0].context.includes('verify'));
  plan.groups[0].context += '\nKeep this operator-supplied context.';
  const proposed = preview(plan)[0].body;
  assert.match(proposed, /Feedback from #510/);
  assert.match(proposed, /New friction/);
  assert.match(proposed, /Second observation/);
  assert.match(proposed, /Proposed change: Preserve/);
  assert.match(proposed, /operator-supplied context/);
  assert.match(proposed, /Feedback group: [a-f0-9]{20}/);
  assert.ok(!/## Motivation|## Scope|## Acceptance criteria|Filed by/.test(proposed));
  await applyPlan(plan, api);
  assert.deepEqual([...state.discussion.keys()], [601]);
  assert.equal(state.discussion.get(601)[0].body, proposed);
});

await test('longer outer fences preserve nested examples while replacing real summaries', async () => {
  const { state, api } = fixture();
  const example = '\n## Example\n\n````markdown\n```sh\n<!-- skill-feedback-triage:00000000000000000000 -->\nFolded 0.\n<!-- skill-feedback-state:11111111111111111111 -->\n```\n````\n';
  state.body += example;
  for (let run = 0; run < 3; run++) {
    await applyPlan(await readPlan(api), api);
    assert.ok(state.body.includes(example));
    assert.equal((state.body.match(/<!-- skill-feedback-triage:/g) || []).length, 2);
  }
});
await test('PR reference drift refuses writes and a fresh readPlan retires the merged row', async () => {
  const { state, api } = fixture([]);
  state.body = body.replace('| open |', '| applied in PR #700 |');
  let pr = { number: 700, state: 'open', merged_at: null };
  api.pr = async () => structuredClone(pr);
  const plan = await readPlan(api);
  pr = { number: 700, state: 'closed', merged_at: '2026-09-10' };
  await assert.rejects(applyPlan(plan, api), /Referenced prs #700 changed since planning/);
  assert.deepEqual(state.bodyWrites, []);
  assert.deepEqual(state.events, []);
  const fresh = await readPlan(api);
  await applyPlan(fresh, api);
  assert.equal(parseTable(state.body, hydrateReports(state.body, state.comments)).rows.length, 0);
  assert.equal(state.bodyWrites.length, 1);
});

await test('unclosed fences refuse planning and applying before writes without deleting examples', async () => {
  for (const opener of ['```sh', '~~~text']) {
    const { state, api, plan } = fixture();
    state.body += '\n## Notes\n\n' + opener + '\n<!-- skill-feedback-triage:00000000000000000000 -->\nFolded example.\n';
    const before = state.body;
    await assert.rejects(readPlan(api), /requires closed code fences/);
    plan.body = before;
    await assert.rejects(applyPlan(plan, api), /requires closed code fences/);
    assert.equal(state.body, before);
    assert.equal(state.comments[0].id, 1);
    assert.deepEqual(state.bodyWrites, []);
    assert.deepEqual(state.events, []);
  }
});
await test('backticks in an apparent opener info string remain ordinary prose', async () => {
  const { state, api } = fixture();
  const prose = '\n```text with `inline` backticks is not a fence opener.\n';
  state.body += prose;
  for (let run = 0; run < 2; run++) {
    await applyPlan(await readPlan(api), api);
    assert.ok(state.body.includes(prose));
    assert.equal((state.body.match(/<!-- skill-feedback-triage:/g) || []).length, 1);
  }
});

await test('body drift after existing evidence recovers with a fresh plan preserving original context', async () => {
  const { state, api } = fixture();
  state.body = body.replace('| open |', '| ticketed #601 |');
  state.references.set(601, { number: 601, state: 'open', type: { name: 'Task' }, labels: [{ name: 'workflow: skills' }] });
  const original = await readPlan(api);
  original.groups[0].context += '\nScope: preserve this exact operator context.';
  state.fail = 'evidence';
  await assert.rejects(applyPlan(original, api), /interrupted evidence/);
  state.body += '\nMaintainer note added after interruption.\n';
  await assert.rejects(applyPlan(original, api), /Inbox body changed since planning/);
  const fresh = await readPlan(api);
  await assert.rejects(applyPlan(fresh, api), /Task #601, comment #800.*fresh plan.*original group's context exactly/);
  assert.deepEqual(state.bodyWrites, []);
  assert.equal(state.comments[0].id, 1);
  fresh.groups[0].context = original.groups[0].context;
  await applyPlan(fresh, api);
  assert.equal(state.discussion.get(601).length, 1);
  assert.ok(state.body.includes('Maintainer note added after interruption.'));
  assert.equal(state.comments.some(comment => comment.id === 1), false);
});
await test('fenced canonical-table examples stay untouched and only the real table is triaged', async () => {
  for (const fence of ['```text', '~~~text']) {
    const { state, api } = fixture();
    const example = fence + '\n| Skill, section | Friction | Proposed edit | Status |\n| --- | --- | --- | --- |\n| <skill> | <observation> | <proposal> | open |\n' + fence.slice(0, 3) + '\n\n';
    state.body = example + state.body;
    const plan = await readPlan(api);
    assert.equal(plan.rows.length, 1);
    assert.equal(plan.rows[0].skill, 'review-pr, section 3');
    await applyPlan(plan, api);
    assert.ok(state.body.startsWith(example));
    assert.equal(state.issues.length, 1);
    assert.ok(!state.issues[0].body.includes('<proposal>'));
  }
});
await test('multiple real canonical tables refuse before writes rather than choosing one', async () => {
  const { state, api } = fixture();
  state.body += '\nSecond real table:\n\n' + body;
  const before = state.body;
  await assert.rejects(readPlan(api), /Multiple canonical inbox tables outside code fences/);
  assert.equal(state.body, before);
  assert.deepEqual(state.bodyWrites, []);
  assert.deepEqual(state.events, []);
  assert.equal(state.comments[0].id, 1);
});
await test('marker-prefixed human comments and summaries have explicit skipped-ID dispositions', async () => {
  const human = { id: 51, body: '<!-- skill-feedback-triage:old -->\nPlease explain this summary.\n' };
  const summary = { id: 52, body: '<!-- skill-feedback-triage:00000000000000000000 -->\nFolded 0.' };
  const { state, api } = fixture([intake(1), human, summary]);
  const plan = await readPlan(api);
  assert.deepEqual(plan.skipped.map(comment => comment.id), [51, 52]);
  assert.deepEqual(plan.skipped.map(comment => comment.body), [human.body, summary.body]);
  assert.ok(plan.skipped.every(comment => /inspect whether it is a triage summary or discussion.*Left intact/.test(comment.reason)));
  await applyPlan(plan, api);
  assert.deepEqual(state.comments.slice(0, 2), [human, summary]);
  assert.match(state.comments[2].body, /left marker-prefixed comments 51, 52 intact/);
});

await test('duplicate intake labels disclose distinct counts, occurrence counts and repeated names', () => {
  const cases = [
    ['Skill and section: x\nWhat happened: y\nProposed edit: quoted\nProposed edit: actual', 3, 4, 'Proposed edit'],
    ['Skill and section: x\nWhat happened: y\nProposed edit: z\nSkill and section: a\nWhat happened: b\nProposed edit: c', 3, 6, 'Skill and section, What happened, Proposed edit'],
    ['Skill and section: x\nWhat happened: y\nSkill and section: a\nWhat happened: b', 2, 4, 'Skill and section, What happened'],
  ];
  for (const [text, distinct, occurrences, repeated] of cases) {
    const { ignored } = fold(body, [{ id: 81, body: text }]);
    assert.equal(ignored[0].body, text);
    assert.ok(ignored[0].reason.includes(`${distinct} of 3 distinct required labels across ${occurrences} occurrences`));
    assert.ok(ignored[0].reason.includes(`repeated labels: ${repeated}.`));
  }
});
await test('unfinished fences above the canonical table give the same actionable planning refusal', async () => {
  for (const opener of ['```text', '~~~text']) {
    const { state, api } = fixture();
    state.body = opener + '\nUnfinished example\n' + body;
    const before = state.body;
    await assert.rejects(readPlan(api), /requires closed code fences.*close the unfinished fence/);
    assert.equal(state.body, before);
    assert.equal(state.comments[0].id, 1);
  }
});
await test('changed-group fresh plans preserve new recurrence as separate evidence for operator inspection', async () => {
  const { state, api } = fixture();
  state.body = body.replace('| open |', '| ticketed #601 |');
  state.references.set(601, { number: 601, state: 'open', type: { name: 'Task' }, labels: [{ name: 'workflow: skills' }] });
  const original = await readPlan(api);
  state.fail = 'evidence';
  await assert.rejects(applyPlan(original, api), /interrupted evidence/);
  const first = state.discussion.get(601)[0].body;
  state.body += '\nNew maintainer note.\n';
  state.comments.push(intake(9, 'review-pr, section 3', 'Later recurrence'));
  const fresh = await readPlan(api);
  assert.notDeepEqual(fresh.rows, original.rows);
  assert.notEqual(preview(fresh)[0].body, first);
  await applyPlan(fresh, api);
  const evidence = state.discussion.get(601);
  assert.equal(evidence.length, 2);
  assert.equal(evidence[0].body, first);
  assert.match(evidence[1].body, /Later recurrence/);
  assert.match(evidence[1].body, /Intake #1:/);
  assert.match(evidence[1].body, /Intake #9:/);
});

await test('folded-but-live intake refuses fresh planning after body drift including a first new row', async () => {
  for (const empty of [false, true]) for (const crlf of [false, true]) {
    const { state, api } = fixture();
    if (empty) state.body = renderTable(body, []);
    const original = await readPlan(api);
    state.fail = 'persisted';
    await assert.rejects(applyPlan(original, api), /interrupted persisted/);
    state.body += '\nMaintainer note after the persisted write.\n';
    if (crlf) state.body = state.body.replace(/\r?\n/g, '\r\n');
    const savedBody = state.body;
    const savedEvents = [...state.events];
    await assert.rejects(applyPlan(original, api), /Persisted inbox changed/);
    await assert.rejects(readPlan(api), /Intake 1 is already recorded as folded.*original plan and saved body artifacts/);
    const forgedFresh = structuredClone(original);
    forgedFresh.body = state.body;
    await assert.rejects(applyPlan(forgedFresh, api), /already recorded as folded/);
    assert.equal(state.body, savedBody);
    assert.deepEqual(state.events, savedEvents);
    assert.equal(state.bodyWrites.length, 1);
    assert.equal(state.issues.length, 1);
    assert.equal(state.discussion.size, 0);
    assert.equal(state.comments[0].id, 1);
  }
});
await test('original valid-body retry completes cleanup and completed edited bodies allow fresh plans', async () => {
  const { state, api } = fixture();
  const original = await readPlan(api);
  state.fail = 'persisted';
  await assert.rejects(applyPlan(original, api), /interrupted persisted/);
  await applyPlan(original, api);
  state.body += '\nOrdinary note after cleanup completed.\n';
  await applyPlan(await readPlan(api), api);
  assert.equal(state.issues.length, 1);
  assert.equal(state.comments.some(comment => comment.id === 1), false);
  assert.ok(state.body.includes('Ordinary note after cleanup completed.'));
});
await test('duplicate evidence markers identify both comments and refuse cleanup', async () => {
  const { state, api } = fixture();
  state.body = body.replace('| open |', '| ticketed #601 |');
  state.references.set(601, { number: 601, state: 'open', type: { name: 'Task' }, labels: [{ name: 'workflow: skills' }] });
  const plan = await readPlan(api);
  state.fail = 'evidence';
  await assert.rejects(applyPlan(plan, api), /interrupted evidence/);
  const discussion = state.discussion.get(601);
  discussion.push({ ...discussion[0], id: 801 });
  await assert.rejects(applyPlan(plan, api), /Multiple existing-ticket evidence.*Task #601: #800, #801/);
  assert.deepEqual(state.bodyWrites, []);
  assert.equal(state.comments[0].id, 1);
  assert.equal(discussion.length, 2);
});
await test('two summary cycles with pending intake receive distinct monotonically increasing IDs', async () => {
  const { state, api } = fixture();
  const first = await readPlan(api);
  state.comments.push(intake(9, 'other, section 1', 'Arrived after planning'));
  await applyPlan(first, api);
  const firstSummary = state.comments.find(comment => comment.body.startsWith('<!-- skill-feedback-triage:'));
  await applyPlan(await readPlan(api), api);
  const summaries = state.comments.filter(comment => comment.body.startsWith('<!-- skill-feedback-triage:'));
  assert.equal(summaries.length, 2);
  assert.equal(new Set(summaries.map(comment => comment.id)).size, 2);
  assert.ok(summaries[1].id > firstSummary.id);
});

await test('split groups retain prior references outside contributor proposal text', async () => {
  const { state, api } = fixture([intake(9)]);
  state.body = renderTable(body, [{ skill: 'review-pr, section 3', friction: 'Original observation', edit: 'Original proposal', status: 'applied in PR #503' }]);
  api.pr = async number => ({ number, state: 'closed', merged_at: null });
  const plan = await readPlan(api);
  assert.equal(plan.rows[0].edit, 'Original proposal\n\nSeen again (intake #9):\nPreserve \\slashes and | pipes.');
  plan.groups = [{ action: 'ticket', title: 'Split reviewed work', keys: [keyOf(plan.rows[0].skill)] }];
  const proposed = preview(plan)[0].body;
  const [description, additional] = proposed.split('## Additional context');
  assert.match(description, /Original proposal/);
  assert.match(description, /Seen again \(intake #9\)/);
  assert.ok(!description.includes('Previous reference'));
  assert.match(additional, /Previous reference for review-pr, section 3: applied in PR #503; the pull request closed without merging; its proposal remains actionable/);
  await applyPlan(plan, api);
  assert.equal(state.issues[0].body, proposed);
});
await test('fenced folded-ID examples do not block real pending intake', async () => {
  const { state, api } = fixture();
  const example = '\n```text\n<!-- skill-feedback-triage:00000000000000000000 -->\nFolded 1 intake comments (1); example only\n```\n';
  state.body += example;
  await applyPlan(await readPlan(api), api);
  assert.ok(state.body.includes(example));
  assert.equal(state.comments.some(comment => comment.id === 1), false);
});

await test('removed names render literally without injecting summary fences or state markers', async () => {
  const { state, api } = fixture([]);
  const skill = 'review-pr, section 3\n```sh\nnode check.mjs\n```\n<!-- skill-feedback-state:00000000000000000000 -->';
  state.body = renderTable(body, [{ skill, friction: 'f', edit: 'e', status: 'open' }]);
  const plan = await readPlan(api);
  plan.groups = [{ action: 'applied', number: 503, keys: [keyOf(skill)] }];
  await applyPlan(plan, api);
  const summary = state.comments[0].body;
  assert.ok(!summary.includes('```'));
  assert.ok(!summary.includes('<!-- skill-feedback-state:'));
  assert.match(summary, /removed review-pr, section 3<br>&#96;&#96;&#96;sh<br>node check\.mjs/);
  const removed = summary.split('; removed ')[1].split('; left unparsed comments')[0];
  const decoded = removed.replace(/<br>/g, '\n').replace(/&(?:amp|lt|gt|#\d+);/g, entity => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>' })[entity] ?? String.fromCodePoint(Number(entity.slice(2, -1))));
  assert.equal(decoded, skill);
  await applyPlan(await readPlan(api), api);
  assert.equal((state.body.match(/<!-- skill-feedback-state:/g) || []).length, 1);
});
await test('empty split groups refuse before filing an empty Task', async () => {
  const { state, api, plan } = fixture();
  plan.groups.unshift({ action: 'ticket', title: 'Empty split', keys: [] });
  await assert.rejects(applyPlan(plan, api), /at least one row key.*remove empty split groups/);
  assert.equal(state.issues.length, 0);
  assert.deepEqual(state.bodyWrites, []);
  assert.deepEqual(state.events, []);
});
await test('normalization conflicts name both display names and the shared key', () => {
  const first = { skill: 'CLAUDE.md, section 3', friction: 'f', edit: 'e', status: 'ticketed #601' };
  const second = { ...first, skill: 'CLAUDE.md, section 3 (filing issues)', status: 'open' };
  assert.throws(() => makePlan(renderTable(body, [first, second]), []), error => {
    assert.ok(error.message.includes(JSON.stringify(first.skill)));
    assert.ok(error.message.includes(JSON.stringify(second.skill)));
    assert.ok(error.message.includes('normalized key "claude.md, section 3"'));
    return true;
  });
});
await test('fence closers reject trailing info and four-space indentation', async () => {
  for (const closer of ['``` not a closer', '    ```']) {
    const { state, api } = fixture();
    const example = '\n```text\ncontent\n' + closer + '\nstill code\n```\n';
    state.body += example;
    await applyPlan(await readPlan(api), api);
    assert.ok(state.body.includes(example));
    await readPlan(api);
  }
});

await test('manually split closed-ticket recurrence keeps its durable prior reference', async () => {
  const { state, api } = fixture();
  state.body = body.replace('| open |', '| ticketed #601 |');
  state.references.set(601, { number: 601, state: 'closed', body: 'The earlier proposal remains in this Task.' });
  const plan = await readPlan(api);
  plan.groups = [{ action: 'ticket', title: 'Reviewed follow-up', keys: [keyOf(plan.rows[0].skill)] }];
  const proposed = preview(plan)[0].body;
  assert.match(proposed, /Previous reference for review-pr, section 3: ticketed #601 \(closed; closure does not establish/);
  assert.match(proposed, /New friction/);
  await applyPlan(plan, api);
  assert.equal(state.issues[0].body, proposed);
  assert.equal(state.references.get(601).body, 'The earlier proposal remains in this Task.');
});

await test('reapplied work retains unmerged provenance in durable summary history', async () => {
  const { state, api } = fixture([]);
  state.body = body.replace('| open |', '| applied in PR #503 |');
  let merged = false;
  api.pr = async number => ({ number, state: number === 503 || merged ? 'closed' : 'open', merged_at: number === 700 && merged ? '2026-09-10' : null });
  const plan = await readPlan(api);
  plan.groups = [{ action: 'applied', number: 700, keys: [keyOf(plan.rows[0].skill)] }];
  await applyPlan(plan, api);
  const row = parseTable(state.body, hydrateReports(state.body, state.comments)).rows[0];
  assert.equal(row.status, 'applied in PR #700');
  assert.equal(row.edit, 'Keep `C:\\path`');
  assert.match(state.comments[0].body, /applied #700.*applied in PR #503.*closed without merging/);
  merged = true;
  await applyPlan(await readPlan(api), api);
  assert.equal(parseTable(state.body, hydrateReports(state.body, state.comments)).rows.length, 0);
  assert.ok(state.comments.some(comment => /applied #700.*applied in PR #503/.test(comment.body)));
});
await test('retargeted existing evidence preserves the prior Task automatically', async () => {
  const { state, api } = fixture();
  state.body = body.replace('| open |', '| ticketed #601 |');
  for (const number of [601, 702]) state.references.set(number, { number, state: 'open', type: { name: 'Task' }, labels: [{ name: 'workflow: skills' }] });
  const plan = await readPlan(api);
  plan.groups = [{ action: 'existing', number: 702, keys: [keyOf(plan.rows[0].skill)] }];
  const proposed = preview(plan)[0].body;
  assert.match(proposed, /Previous reference for review-pr, section 3: ticketed #601/);
  await applyPlan(plan, api);
  assert.deepEqual([...state.discussion.keys()], [702]);
  assert.equal(state.discussion.get(702)[0].body, proposed);
});
await test('live folded intake absent from plan comments still blocks a new apply', async () => {
  const { state, api } = fixture();
  const original = await readPlan(api);
  state.fail = 'persisted';
  await assert.rejects(applyPlan(original, api), /interrupted persisted/);
  state.body += '\nNote after interrupted cleanup.\n';
  const emptyIntakePlan = makePlan(state.body, [], { prs: {}, issues: { 600: { state: 'open' } } });
  assert.deepEqual(emptyIntakePlan.comments, []);
  const before = state.body;
  const events = [...state.events];
  await assert.rejects(applyPlan(emptyIntakePlan, api), /Intake 1 is already recorded as folded/);
  assert.equal(state.body, before);
  assert.deepEqual(state.events, events);
  assert.equal(state.bodyWrites.length, 1);
  assert.equal(state.comments[0].id, 1);
});

await test('a fenced old summary cannot resume a stale plan after a later run', async () => {
  const { state, api, plan } = fixture();
  const first = await applyPlan(plan, api);
  const quoted = '```text\n' + first.summary + '\n<!-- skill-feedback-state:00000000000000000000 -->\n```\n';
  state.body = state.body.replace('## Table', quoted + '\n## Table');
  state.comments = state.comments.filter(comment => comment.body !== first.summary);
  state.comments.push(intake(9, 'write-regression-test, section 4'));
  await applyPlan(await readPlan(api), api);
  assert.ok(state.body.includes(quoted));
  const before = structuredClone({ body: state.body, comments: state.comments, events: state.events });
  await assert.rejects(applyPlan(plan, api), /Inbox body changed since planning/);
  assert.deepEqual({ body: state.body, comments: state.comments, events: state.events }, before);
});

await test('resume extracts the current summary when its marker also appears in a fenced example', async () => {
  const { state, api, plan } = fixture();
  state.fail = 'persisted';
  await assert.rejects(applyPlan(plan, api), /interrupted persisted/);
  const summary = state.body.match(/<!-- skill-feedback-triage:[\s\S]*?(?=\n<!-- skill-feedback-state:)/)[0];
  // Construct a valid saved-body fixture with the same marker in an example.
  // The production code never recomputes integrity after an external edit.
  const content = state.body.slice(0, state.body.lastIndexOf('\n<!-- skill-feedback-state:')).replace('## Table', '```text\n' + summary + '\n```\n\n## Table');
  state.body = content + '\n<!-- skill-feedback-state:' + createHash('sha256').update(content).digest('hex').slice(0, 20) + ' -->\n';
  const result = await applyPlan(plan, api);
  assert.equal(result.summary, summary);
  assert.equal(state.comments.length, 1);
  assert.equal(state.comments[0].body, summary);
});

await test('a fresh run replaces a CRLF summary and preserves fenced summary examples', async () => {
  const { state, api, plan } = fixture();
  const first = await applyPlan(plan, api);
  const example = '```text\n' + first.summary + '\n<!-- skill-feedback-state:00000000000000000000 -->\n```';
  state.body = state.body.replace('## Table', example + '\n\n## Table').replace(/\n/g, '\r\n');
  state.comments.push(intake(9, 'write-regression-test, section 4'));
  const result = await applyPlan(await readPlan(api), api);
  assert.ok(state.body.includes(example));
  const outsideExample = state.body.replace(example, '');
  assert.equal((outsideExample.match(/<!-- skill-feedback-triage:/g) || []).length, 1);
  assert.equal((outsideExample.match(/<!-- skill-feedback-state:/g) || []).length, 1);
  assert.ok(outsideExample.includes(result.summary));
  assert.ok(!outsideExample.includes(first.summary));
  await readPlan(api);
});

const reported = (id, session, problem = 'new', friction = 'Completion lost') => ({ id, body: `Problem: ${problem}\n\nSession: ${session}\n\nSkill and section: review-pr, section 3\n\nWhat happened: ${friction}\n\nProposed edit: Preserve the result.`, html_url: `https://example.test/${id}` });
await test('counted problems in one skill section stay separate and default to deferred triage', async () => {
  const { state, api } = fixture([reported(20, 'codex:alpha'), reported(21, 'claude:beta', 'new', 'Scratch collision')]);
  state.body = renderTable(body, []);
  const plan = await readPlan(api);
  assert.deepEqual(plan.rows.map(row => row.problemId), ['F-20', 'F-21']);
  assert.deepEqual(plan.groups.map(group => group.action), ['defer', 'defer']);
  await applyPlan(plan, api);
  assert.equal(state.issues.length, 0);
  assert.equal(state.comments.filter(comment => [20, 21].includes(comment.id)).length, 0);
  assert.deepEqual(parseTable(state.body, hydrateReports(state.body, state.comments)).rows.map(row => row.sessions), [['codex:alpha'], ['claude:beta']]);
  assert.ok(state.body.includes('| Problem | Reports |'));
});
await test('repeat reports count unique sessions across folds and preserve additional observations', async () => {
  const { state, api } = fixture([reported(20, 'codex:alpha')]);
  state.body = renderTable(body, []);
  const original = await readPlan(api);
  await applyPlan(original, api);
  await applyPlan(original, api);
  state.comments.push(reported(21, 'codex:alpha', 'F-20', 'Same session additional detail'), reported(22, 'claude:beta', 'F-20'));
  await applyPlan(await readPlan(api), api);
  const [row] = parseTable(state.body, hydrateReports(state.body, state.comments)).rows;
  assert.deepEqual(row.sessions, ['codex:alpha', 'claude:beta']);
  assert.match(row.friction, /Same session additional detail/);
  assert.match(state.body, /2 recorded/);
  assert.equal(state.comments.some(comment => [20, 21, 22].includes(comment.id)), false);
});
await test('retired problems retain report identities and repeats can reopen with their prior reference', async () => {
  const { state, api } = fixture([reported(20, 'codex:alpha')]);
  state.body = renderTable(body, []);
  const plan = await readPlan(api);
  plan.groups = [{ action: 'applied', number: 503, keys: ['F-20'] }];
  await applyPlan(plan, api);
  assert.equal(parseTable(state.body, hydrateReports(state.body, state.comments)).rows.length, 0);
  state.comments.push(reported(21, 'codex:alpha', 'F-20'));
  await applyPlan(await readPlan(api), api);
  assert.equal(parseTable(state.body, hydrateReports(state.body, state.comments)).rows.length, 0);
  state.comments.push(reported(22, 'claude:beta', 'F-20'));
  const next = await readPlan(api);
  assert.equal(next.rows[0].previousStatus, 'applied in PR #503');
  assert.deepEqual(next.rows[0].sessions, ['codex:alpha', 'claude:beta']);
  await applyPlan(next, api);
  assert.equal(parseTable(state.body, hydrateReports(state.body, state.comments)).rows[0].status, 'open');
});
await test('unknown problem references remain intact and historical rows have no guessed count', async () => {
  const { state, api } = fixture([reported(20, 'codex:alpha', 'F-999'), reported(21, 'claude:beta')]);
  const plan = await readPlan(api);
  assert.equal(plan.ignored[0].id, 20);
  assert.match(plan.ignored[0].reason, /Unknown problem/);
  assert.equal(plan.rows[0].sessions, undefined);
  assert.equal(plan.rows.find(row => row.problemId === 'F-21').historyIncomplete, true);
  plan.groups = plan.groups.map(group => ({ action: 'defer', keys: group.keys }));
  await applyPlan(plan, api);
  assert.ok(state.comments.some(comment => comment.id === 20));
  assert.match(state.body, /unclassified.*unknown/);
  assert.match(state.body, /1 recorded; history incomplete/);
});
await test('a repeat cannot silently change the referenced problem skill', async () => {
  const { state, api } = fixture([reported(20, 'codex:alpha')]);
  state.body = renderTable(body, []);
  await applyPlan(await readPlan(api), api);
  const mismatch = reported(21, 'claude:beta', 'F-20');
  mismatch.body = mismatch.body.replace('review-pr, section 3', 'resolve-issue, section 2');
  state.comments.push(mismatch);
  const plan = await readPlan(api);
  assert.equal(plan.ignored[0].id, 21);
  assert.match(plan.ignored[0].reason, /does not match/);
  assert.deepEqual(plan.rows[0].sessions, ['codex:alpha']);
});

for (const stage of ['persisted', 'delete']) await test(`counted reports recover after ${stage} without inflating sessions`, async () => {
  const { state, api } = fixture([reported(20, 'codex:alpha')]);
  state.body = renderTable(body, []);
  const plan = await readPlan(api);
  state.fail = stage;
  await assert.rejects(applyPlan(plan, api), /interrupted/);
  await applyPlan(plan, api);
  assert.deepEqual(parseTable(state.body, hydrateReports(state.body, state.comments)).rows[0].sessions, ['codex:alpha']);
  assert.equal(state.comments.filter(comment => comment.body.startsWith('<!-- skill-feedback-triage:')).length, 1);
});
await test('priorities expose report frequency and ticket evidence names the counted problem', async () => {
  const { state, api } = fixture([reported(20, 'codex:alpha'), reported(21, 'claude:beta', 'new', 'Different issue'), reported(22, 'codex:gamma', 'F-21')]);
  state.body = renderTable(body, []);
  const plan = await readPlan(api);
  assert.deepEqual(plan.priorities.map(item => [item.key, item.reports]), [['F-21', 2], ['F-20', 1]]);
  plan.groups.find(group => group.keys.includes('F-21')).action = 'ticket';
  plan.groups.find(group => group.keys.includes('F-21')).title = 'Fix the repeatedly reported problem';
  await applyPlan(plan, api);
  assert.equal(state.issues.length, 1);
  assert.match(state.issues[0].body, /F-21; 2 recorded/);
  assert.match(state.comments.find(comment => comment.body.startsWith('<!-- skill-feedback-triage:')).body, /Deferred: F-20 \(1 recorded\)/);
});
await test('tampered visible counts and duplicate problem rows refuse planning', async () => {
  const { state, api } = fixture([reported(20, 'codex:alpha')]);
  state.body = renderTable(body, []);
  await applyPlan(await readPlan(api), api);
  const saved = state.body;
  state.body = saved.replace('1 recorded', '9 recorded');
  await assert.rejects(readPlan(api), /do not match the saved session/);
  const line = saved.split('\n').find(line => line.startsWith('|') && line.includes('F-20'));
  state.body = saved.replace(line, line + '\n' + line);
  await assert.rejects(readPlan(api), /Duplicate problem/);
});
await test('missing problem labels and multiline session identities stay unparsed', async () => {
  for (const invalid of [reported(20, 'codex:alpha').body.replace('Problem: new\n\n', ''), reported(20, 'codex:alpha\u2028other').body]) {
    const { state, api } = fixture([{ id: 20, body: invalid }]);
    state.body = renderTable(body, []);
    const plan = await readPlan(api);
    assert.equal(plan.comments.length, 0);
    assert.equal(plan.ignored[0].id, 20);
    await applyPlan(plan, api);
    assert.equal(state.comments[0].body, invalid);
  }
});

await test('historical uncertainty is independent of intake order and remains after retirement', () => {
  const empty = renderTable(body, []);
  const counted = reported(20, 'codex:alpha');
  const legacy = intake(21);
  for (const comments of [[counted, legacy], [legacy, counted]]) assert.equal(fold(empty, comments).rows.find(row => row.problemId).historyIncomplete, true);
  const first = renderTable(empty, fold(empty, [counted]).rows);
  const second = fold(first, [legacy]);
  assert.equal(second.rows.find(row => row.problemId).historyIncomplete, true);
  const retired = renderTable(first, second.rows.filter(row => row.problemId));
  assert.equal(fold(retired, []).rows[0].historyIncomplete, true);
});
await test('legacy prose labels and fenced template examples remain intact in both intake formats', () => {
  for (const label of ['Problem', 'Session']) {
    const text = `Observation\n${label}: a log line`;
    assert.equal(parseIntake(intake(20, 'review-pr, section 3', text)).friction, text);
    const quote = `Observation\n\n\`\`\`text\n${label}: a quoted label\n\`\`\``;
    assert.equal(parseIntake(reported(20, 'codex:alpha', 'new', quote)).friction, quote);
    assert.equal(parseIntake(intake(20, 'review-pr, section 3', quote)).friction, quote);
  }
});
await test('missing ledgers, inherited problem names and renamed targets refuse before mutation', async () => {
  const { state, api } = fixture([reported(20, 'codex:alpha')]);
  state.body = renderTable(body, []);
  await applyPlan(await readPlan(api), api);
  const saved = state.body;
  for (const changed of [saved.replace(/<!-- skill-feedback-reports:v3 .*? -->/, ''), ...['__proto__', 'constructor', 'toString', 'F-999'].map(id => saved.replace('F-20', id))]) {
    state.body = changed;
    await assert.rejects(readPlan(api), /Unknown problem/);
  }
  state.body = saved.replace('review-pr, section 3', 'resolve-issue, section 2');
  await assert.rejects(readPlan(api), /Skill.*does not match/);
});
await test('table width and invalid status or whitespace cells refuse planning', () => {
  const six = renderTable(body, []);
  const populated = renderTable(body, parseTable(body).rows);
  assert.throws(() => parseTable(populated.replace('| Status | Problem | Reports |', '| Status |').replace('| --- | --- | --- | --- | --- | --- |', '| --- | --- | --- | --- |')), /Invalid inbox row/);
  for (const status of ['ticketed #0', 'ticketed #01', 'applied in PR #0']) assert.throws(() => makePlan(body.replace('| open |', `| ${status} |`), []), /Invalid inbox row/);
  assert.throws(() => parseTable(populated.replace('A &#124; B', '   ')), /Invalid inbox row/);
  assert.equal(parseTable(six).rows.length, 0);
});
await test('production readers ignore fenced ledger examples while retaining live counted rows', () => {
  const empty = renderTable(body, []);
  const fenced = '```text\n<!-- skill-feedback-reports:v9 broken -->\n```\n';
  const initial = renderTable(empty, fold(empty, [reported(20, 'codex:alpha')]).rows);
  const plan = makePlan(fenced + initial, [reported(21, 'claude:beta', 'F-20')]);
  assert.deepEqual(plan.rows[0].sessions, ['codex:alpha', 'claude:beta']);
  const rendered = renderTable(fenced + initial, plan.rows);
  assert.ok(rendered.startsWith(fenced));
  assert.deepEqual(parseTable(rendered).rows[0].sessions, ['codex:alpha', 'claude:beta']);
});
await test('overlong session and unsafe comment identity refuse intake before any write', () => {
  for (const comment of [reported(20, 'x'.repeat(201)), reported(Number.MAX_SAFE_INTEGER + 1, 'codex:a'), reported(0, 'codex:a')]) {
    assert.throws(() => parseIntake(comment), /invalid problem or session/);
    assert.equal(makePlan(renderTable(body, []), [comment]).comments.length, 0);
  }
  assert.equal(parseIntake(reported(20, 'x'.repeat(200))).session.length, 200);
});
await test('old plan versions refuse before even reading live state', async () => {
  const { api, plan } = fixture();
  api.inbox = () => { throw new Error('must not read'); };
  await assert.rejects(applyPlan({ ...plan, version: 1 }, api), /Wrong plan version/);
});
await test('deferring reopened work preserves its prior reference through the next plan', async () => {
  const { state, api } = fixture([reported(20, 'codex:alpha')]);
  state.body = renderTable(body, []);
  const rows = fold(state.body, state.comments).rows;
  rows[0].status = 'applied in PR #777';
  state.body = renderTable(state.body, rows);
  state.comments = [];
  api.pr = async () => ({ state: 'closed', merged_at: null });
  const plan = await readPlan(api);
  assert.equal(plan.groups[0].action, 'defer');
  await applyPlan(plan, api);
  const next = await readPlan(api);
  assert.match(next.rows[0].friction, /applied in PR #777.*closed without merging/);
});
await test('retirement identifies the problem and a retired repeat does not claim a second removal', async () => {
  const { state, api } = fixture([reported(20, 'codex:alpha')]);
  state.body = renderTable(body, []);
  const plan = await readPlan(api);
  plan.groups = [{ action: 'applied', number: 503, keys: ['F-20'] }];
  assert.match((await applyPlan(plan, api)).summary, /removed F-20 \(review-pr, section 3\)/);
  state.comments.push(reported(21, 'codex:alpha', 'F-20', 'Additional detail'));
  assert.match((await applyPlan(await readPlan(api), api)).summary, /removed none;/);
});
await test('unknown counts stay outside frequency ranking and possible duplicates are disclosed', () => {
  const plan = makePlan(body, [reported(20, 'codex:alpha'), reported(21, 'claude:beta')]);
  assert.deepEqual(plan.priorities.map(row => row.reports), [1, 1]);
  assert.equal(plan.unknownPriorities[0].reports, null);
  assert.ok(plan.possibleDuplicates.some(pair => pair.keys.includes('F-20') && pair.keys.includes('F-21')));
  assert.ok(plan.possibleDuplicates.some(pair => pair.keys.includes('review-pr, section 3')));
});

await test('archives keep large active and retired observations readable with a bounded inbox body', async () => {
  const detail = 'Observation with a long reproduction. '.repeat(2200);
  const { state, api } = fixture([reported(20, 'codex:alpha', 'new', detail)]);
  state.body = renderTable(body, []);
  await applyPlan(await readPlan(api), api);
  assert.ok(state.body.length < 5000);
  assert.match(state.body, /Full history in Reports archive/);
  assert.equal(hydrateReports(state.body, state.comments)['F-20'].friction, detail.trim());
  assert.ok(state.comments.some(comment => comment.body.includes('Observation with a long reproduction.')));
  const next = await readPlan(api);
  assert.equal(next.ignored.length, 0);
  next.groups = [{ action: 'applied', number: 503, keys: ['F-20'] }];
  await applyPlan(next, api);
  assert.equal(parseTable(state.body, hydrateReports(state.body, state.comments)).rows.length, 0);
  assert.equal((await readPlan(api)).reportHistory['F-20'].friction, detail.trim());
});
await test('a changed archive refuses before Task creation and interrupted archive writes reuse comments', async () => {
  const { state, api } = fixture([reported(20, 'codex:alpha')]);
  state.body = renderTable(body, []);
  const plan = await readPlan(api);
  state.fail = 'summary';
  await assert.rejects(applyPlan(plan, api), /interrupted summary/);
  const firstArchive = state.comments.find(comment => comment.body.startsWith('<!-- skill-feedback-archive:'));
  await applyPlan(plan, api);
  assert.equal(state.comments.filter(comment => comment.body === firstArchive.body).length, 1);
  state.comments.push(reported(21, 'claude:beta', 'F-20'));
  const next = await readPlan(api);
  next.groups = [{ action: 'ticket', title: 'Fix it', keys: ['F-20'] }];
  firstArchive.body += ' modified';
  await assert.rejects(applyPlan(next, api), /hash or exact body/);
  assert.equal(state.issues.length, 0);
  assert.ok(state.comments.some(comment => comment.id === 21));
});
await test('oversized inbox refuses before filing and old count-plan versions remain unsupported', async () => {
  const { state, api } = fixture();
  state.body = 'Large surrounding prose. '.repeat(2200) + body;
  await assert.rejects(applyPlan(await readPlan(api), api), /projected body exceeds/);
  assert.deepEqual(state.events, []);
  const plan = makePlan(body, []);
  await assert.rejects(applyPlan({ ...plan, version: 2 }, api), /Wrong plan version/);
});

console.log(`All ${passed} triage checks passed.`);
