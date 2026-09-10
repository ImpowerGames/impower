import assert from 'node:assert/strict';
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
  const state = { body, comments: structuredClone(comments), issues: [], references: new Map(), discussion: [], events: [], fail: null };
  const checkpoint = name => { state.events.push(name); if (state.fail === name) { state.fail = null; throw new Error(`interrupted ${name}`); } };
  const api = {
    inbox: async () => ({ body: state.body }), comments: async () => structuredClone(state.comments), issues: async () => structuredClone(state.issues),
    issue: async number => {
      const issue = state.issues.find(i => i.number === number) || state.references.get(number);
      if (!issue) throw new Error(`Fixture has no issue #${number}`);
      return structuredClone(issue);
    },
    pr: async number => ({ number, state: number === 503 ? 'closed' : 'open', merged_at: number === 503 ? '2026-01-01' : null }),
    issueComments: async () => structuredClone(state.discussion),
    postIssueComment: async (number, text) => { const comment = { id: 800 + state.discussion.length, body: text }; state.discussion.push(comment); checkpoint('evidence'); return comment; },
    createTicket: async (title, text) => { const issue = { number: state.issues.length + 600, title, body: text, state: 'open', type: { name: 'Task' }, labels: [{ name: 'workflow: skills' }] }; state.issues.push(issue); checkpoint('created'); return issue; },
    updateBody: async text => { state.body = text; checkpoint('persisted'); },
    deleteComment: async id => { checkpoint('delete'); state.comments = state.comments.filter(c => c.id !== id); },
    postSummary: async text => { const comment = { id: 999 + state.comments.length, body: text, html_url: 'https://example.test/summary' }; state.comments.push(comment); checkpoint('summary'); return comment; },
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
  const expected = state.comments[0].body;
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
  const outsideColon = intake(4);
  outsideColon.body = outsideColon.body.replace(/^(Skill and section|What happened|Proposed edit):/gm, '**$1**:');
  assert.deepEqual(parseIntake(outsideColon), parseIntake(intake(4)));
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
  assert.equal(state.discussion.length, 1);
  assert.equal(state.discussion[0].body, expected);
  assert.ok(state.events.indexOf('evidence') < state.events.indexOf('delete'));
  assert.equal(parseTable(state.body).rows.length, 1);
  assert.match(state.discussion[0].body, /New friction/);
});
await test('existing evidence read-back mismatch keeps intake intact', async () => {
  const { state, api, plan } = fixture();
  state.references.set(701, { number: 701, state: 'open', type: { name: 'Task' }, labels: [{ name: 'workflow: skills' }] });
  plan.groups[0] = { action: 'existing', number: 701, keys: plan.groups[0].keys };
  api.postIssueComment = async () => { const item = { id: 800, body: 'Wrong text' }; state.discussion.push(item); return item; };
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
  assert.match(reopened.groups[0].context, /applied in PR #777/);
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
  assert.equal(state.issues.length, 1); assert.equal(state.discussion.length, 1);
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
  const evidence = state.discussion[0].body;
  assert.match(evidence, /Intake #55:\n\nfriction\n\nProposed change: edit/);
  assert.ok(!evidence.includes('Old friction')); assert.ok(!evidence.includes('A longer edit proposal'));
  assert.match(parseTable(state.body).rows[0].friction, /context only/);
});
await test('already-applied text is context rather than a new Task instruction', () => {
  const plan = makePlan(body.replace('| open |', '| applied in PR #503 |'), [intake(1)]);
  const ticket = preview(plan)[0].body;
  assert.match(ticket, /New friction/); assert.match(ticket, /applied in PR #503/);
  assert.ok(!ticket.includes('Old friction')); assert.ok(!ticket.includes('Keep `C:'));
  assert.match(plan.rows[0].edit, /context only/);
});
await test('table encoding is lossless and prevents code spans from swallowing entities or breaks', () => {
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
  await applyPlan(next, api); assert.equal(state.issues.length, 1); assert.equal(state.discussion.length, 1);
});
await test('created Task read-back rejects wrong type, label, body or title', async () => {
  for (const change of [{ type: { name: 'Bug' } }, { labels: [] }, { body: 'Wrong body' }, { title: 'Wrong title' }]) {
    const { state, api, plan } = fixture();
    const read = api.issue;
    api.issue = async number => ({ ...await read(number), ...change });
    await assert.rejects(applyPlan(plan, api), /differs from this plan/);
    assert.equal(state.comments[0].id, 1); assert.ok(!state.events.includes('body'));
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
    if (field === 'observations') plan.rows[0].observations[0].edit = 'Altered preview proposal';
    else delete plan.rows[0].previousStatus;
    await assert.rejects(applyPlan(plan, api), /Plan rows differ/);
    assert.deepEqual(state.events, []);
  }
});
await test('body edited after initial validation is not overwritten', async () => {
  const { state, api, plan } = fixture(); let reads = 0;
  api.inbox = async () => { if (++reads === 2) state.body += '\nConcurrent update'; return { body: state.body }; };
  await assert.rejects(applyPlan(plan, api), /Inbox changed during triage/);
  assert.ok(state.body.endsWith('Concurrent update')); assert.ok(!state.events.includes('body')); assert.equal(state.comments[0].id, 1);
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
console.log(`All ${passed} triage checks passed.`);
