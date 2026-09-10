import assert from 'node:assert/strict';
import { parseTable, renderTable, parseIntake, keyOf, fold, makePlan, applyPlan } from './triage-skill-feedback.mjs';

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
  assert.equal(parseIntake({ body: '<!-- skill-feedback-triage:abc -->\nFolded 2.' }), null);
  assert.throws(() => parseIntake({ id: 9, body: 'Unknown comment' }), /Comment 9/);
});
await test('dedup uses skill and section, retains both proposals and records seen again', () => {
  const result = fold(body, [intake(1), intake(2, 'write-regression-test, section 3', 'Other')]);
  assert.equal(result.rows.length, 2);
  assert.equal(keyOf('review-pr, section 3 (prompt)'), keyOf('review-pr, section 3'));
  assert.match(result.rows[0].friction, /A \| B.*\nNew friction\nSeen again/);
  assert.match(result.rows[0].edit, /Keep.*\nPreserve/);
  assert.equal(fold(renderTable(body, result.rows), [intake(1)]).rows.length, 2);
  assert.equal(result.folded.length, 2);
});
await test('new feedback reopens an applied section instead of disappearing with its merged PR', async () => {
  const appliedBody = body.replace('| open |', '| applied in PR #503 |');
  const result = fold(appliedBody, [intake(4)]);
  assert.equal(result.rows[0].status, 'open');
  assert.match(result.rows[0].edit, /Earlier item: applied in PR #503/);
  assert.match(result.rows[0].friction, /New friction/);
});

function fixture(comments = [intake(1)]) {
  const state = { body, comments: structuredClone(comments), issues: [], events: [], fail: null };
  const checkpoint = name => { state.events.push(name); if (state.fail === name) { state.fail = null; throw new Error(`interrupted ${name}`); } };
  const api = {
    inbox: async () => ({ body: state.body }), comments: async () => structuredClone(state.comments), issues: async () => structuredClone(state.issues),
    issue: async number => structuredClone(state.issues.find(i => i.number === number) || { number, state: 'closed', type: { name: 'Task' }, labels: [{ name: 'workflow: skills' }] }),
    pr: async number => ({ number, merged_at: number === 503 ? '2026-01-01' : null }),
    createTicket: async (title, text) => { const issue = { number: state.issues.length + 600, title, body: text, state: 'open', type: { name: 'Task' }, labels: [{ name: 'workflow: skills' }] }; state.issues.push(issue); checkpoint('created'); return issue; },
    updateBody: async text => { state.body = text; checkpoint('persisted'); },
    deleteComment: async id => { checkpoint('delete'); state.comments = state.comments.filter(c => c.id !== id); },
    postSummary: async text => { const comment = { id: 999, body: text, html_url: 'https://example.test/summary' }; state.comments.push(comment); checkpoint('summary'); return comment; },
  };
  return { state, api, plan: makePlan(body, comments) };
}
await test('successful run persists verified rows before deleting intake and posts one summary', async () => {
  const { state, api, plan } = fixture();
  const result = await applyPlan(plan, api);
  assert.deepEqual(state.events, ['created', 'persisted', 'delete', 'summary']);
  assert.equal(parseTable(state.body).rows[0].status, 'ticketed #600');
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
  assert.equal(parseTable(state.body).rows.length, 0);
  assert.match(state.comments[0].body, /removed review-pr/);
  const other = fixture([]);
  other.plan.groups[0] = { action: 'applied', number: 700, keys: other.plan.groups[0].keys };
  await applyPlan(other.plan, other.api);
  assert.equal(parseTable(other.state.body).rows[0].status, 'applied in PR #700');
  const closed = fixture([]);
  closed.plan.groups[0] = { action: 'existing', number: 701, keys: closed.plan.groups[0].keys };
  await applyPlan(closed.plan, closed.api);
  assert.equal(parseTable(closed.state.body).rows.length, 0);
});
console.log(`All ${passed} triage checks passed.`);
