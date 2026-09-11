import assert from 'node:assert/strict';
import { hydrateReports, persistReports, prepareReports } from './feedback-archive.mjs';
import { writeReports } from './feedback-reports.mjs';

const row = { skill: 'resolve-issue / Feedback', friction: 'Observed trap', edit: 'Add a mechanism.', status: 'open', problemId: 'F-123', sessions: ['session-one'], historyIncomplete: false };
const ledger = () => ({ 'F-123': structuredClone(row) });
function fixture(initial = []) {
  const state = { comments: structuredClone(initial), posted: 0, fail: false };
  const api = {
    comments: async () => structuredClone(state.comments),
    postComment: async body => {
      const comment = { id: 100 + state.posted++, body };
      state.comments.push(comment);
      if (state.fail) { state.fail = false; throw new Error('interrupted after posting'); }
      return structuredClone(comment);
    },
  };
  return { state, api };
}
const cases = [];
const test = (name, fn) => cases.push([name, fn]);

test('inline migration preserves full ledger and outside text', async () => {
  const f = fixture();
  const before = writeReports('before\n', ledger()) + '\nafter';
  const body = await persistReports(before, ledger(), f.api);
  assert.match(body, /^before\n/); assert.match(body, /\nafter$/);
  assert.match(body, /reports:v3 /); assert.deepEqual(hydrateReports(body, f.state.comments), ledger());
  assert.match(f.state.comments[0].body, /Observed trap/);
});
test('empty legacy ledger stays untouched', async () => {
  const f = fixture(); assert.equal(await persistReports('legacy', {}, f.api), 'legacy'); assert.equal(f.state.posted, 0);
});
test('large Unicode ledger chunks stay bounded and lossless', async () => {
  const f = fixture(); const data = ledger(); data['F-123'].friction = '😀```\n'.repeat(8000);
  const body = await persistReports('inbox', data, f.api);
  assert.ok(f.state.comments.length > 3); assert.ok(body.length < 4000);
  assert.ok(f.state.comments.every(comment => Buffer.byteLength(comment.body) < 50000));
  assert.deepEqual(hydrateReports(body, f.state.comments), data);
});
test('interruption reuses verified immutable chunks', async () => {
  const f = fixture(); f.state.fail = true;
  await assert.rejects(persistReports('inbox', ledger(), f.api), /interrupted/);
  const body = await persistReports('inbox', ledger(), f.api);
  assert.equal(f.state.posted, 2); assert.deepEqual(hydrateReports(body, f.state.comments), ledger());
  assert.equal(await persistReports(body, ledger(), f.api), body); assert.equal(f.state.posted, 2);
});
test('missing tampered duplicate and foreign references refuse', async () => {
  const f = fixture(); const body = await persistReports('inbox', ledger(), f.api);
  assert.throws(() => hydrateReports(body, []), /missing/);
  assert.throws(() => hydrateReports(body, [{ ...f.state.comments[0], body: f.state.comments[0].body + 'changed' }, f.state.comments[1]]), /hash or exact/);
  assert.throws(() => hydrateReports(body, [...f.state.comments, f.state.comments[0]]), /ambiguous/);
  assert.throws(() => hydrateReports(body, [{ ...f.state.comments[0], id: 999 }]), /missing/);
  f.state.comments[0].body += 'tampered';
  await assert.rejects(persistReports(body, ledger(), f.api), /hash or exact/); assert.equal(f.state.posted, 2);
});
test('marker collision and ambiguous retry refuse before body result', async () => {
  const f = fixture(); await persistReports('inbox', ledger(), f.api);
  f.state.comments.push({ ...f.state.comments[0], id: 999 });
  await assert.rejects(persistReports('inbox', ledger(), f.api), /Multiple reports archive/);
  f.state.comments.pop(); f.state.comments[0].body += 'changed';
  await assert.rejects(persistReports('inbox', ledger(), f.api), /marker collision/);
  assert.equal(f.state.posted, 2);
});
test('readback mismatch refuses without returning a body', async () => {
  const f = fixture(); const post = f.api.postComment;
  f.api.postComment = async body => { const result = await post(body); f.state.comments[0].body += 'changed'; return result; };
  await assert.rejects(persistReports('inbox', ledger(), f.api), /did not read back/);
});
test('archive IDs and sessions remain append-only', async () => {
  const f = fixture(); const body = await persistReports('inbox', ledger(), f.api);
  await assert.rejects(persistReports(body, {}, f.api), /cannot remove archived/);
  const changed = ledger(); changed['F-123'].sessions = [];
  await assert.rejects(persistReports(body, changed, f.api), /cannot remove recorded/); assert.equal(f.state.posted, 2);
});
test('fenced examples preserved while actual manifest updates', async () => {
  const f = fixture(); const example = '```\n<!-- skill-feedback-reports:bad -->\n```\n';
  const isFenced = (body, offset) => offset < example.length;
  const body = await persistReports(example + 'inbox', ledger(), f.api, isFenced);
  assert.ok(body.startsWith(example)); assert.deepEqual(hydrateReports(body, f.state.comments, isFenced), ledger());
});
test('manifest malformed and multiple live blocks refuse', async () => {
  const f = fixture(); const body = await persistReports('inbox', ledger(), f.api);
  assert.throws(() => hydrateReports(body + body, f.state.comments), /Multiple/);
  assert.throws(() => hydrateReports('<!-- skill-feedback-reports:v2 bm8= -->', []), /Invalid/);
});
test('worst delimiter runs and preflight budget remain bounded', () => {
  const data = ledger(); data['F-123'].edit = '`'.repeat(40000);
  assert.ok(prepareReports(data).chunks.every(chunk => Buffer.byteLength(chunk.body) < 50000));
  data['F-123'].edit = 'a'.repeat(5000000);
  assert.throws(() => prepareReports(data), /supported comment budget/);
});
test('tampered index and index-post interruption refuse or recover', async () => {
  const f = fixture(); const post = f.api.postComment;
  f.api.postComment = async body => { const result = await post(body); if (body.startsWith('<!-- skill-feedback-archive-index')) throw new Error('index interrupted'); return result; };
  await assert.rejects(persistReports('inbox', ledger(), f.api), /index interrupted/);
  f.api.postComment = post;
  const body = await persistReports('inbox', ledger(), f.api); assert.equal(f.state.posted, 2);
  f.state.comments[1].body += 'changed';
  assert.throws(() => hydrateReports(body, f.state.comments), /index.*hash or exact/);
  await assert.rejects(persistReports('inbox', ledger(), f.api), /index collision/);
});
for (const position of [0, 1]) test(`quoted ${position === 0 ? 'chunk' : 'index'} marker remains intact and does not collide with recovery`, async () => {
  const f = fixture(); const body = await persistReports('inbox', ledger(), f.api);
  const quotes = [{ id: 800, body: `Please inspect this quoted marker:\n\n${f.state.comments[position].body.split('\n')[0]}` }];
  f.state.comments.push(...quotes);
  assert.equal(await persistReports(body, ledger(), f.api), body);
  assert.deepEqual(f.state.comments.slice(-1), quotes);
  assert.equal(f.state.posted, 2);
});
test('actual duplicate chunk and index starts still refuse', async () => {
  for (const position of [0, 1]) {
    const f = fixture(); const body = await persistReports('inbox', ledger(), f.api);
    f.state.comments.push({ ...f.state.comments[position], id: 900 });
    await assert.rejects(persistReports(body, ledger(), f.api), /Multiple reports archive|index collision/);
    assert.equal(f.state.posted, 2);
  }
});
test('index header hash tampering with unchanged valid JSON fails exact-body verification', async () => {
  const f = fixture(); const body = await persistReports('inbox', ledger(), f.api);
  const original = f.state.comments[1].body;
  f.state.comments[1].body = original.replace(/(?<=archive-index:v1 )[a-f0-9]{64}/, '0'.repeat(64));
  assert.notEqual(f.state.comments[1].body, original);
  assert.equal(f.state.comments[1].body.slice(f.state.comments[1].body.indexOf('\n')), original.slice(original.indexOf('\n')));
  assert.throws(() => hydrateReports(body, f.state.comments), /index.*hash or exact/);
});
test('archive inspection distinguishes current references and retained superseded versions', async () => {
  const { inspectReportsArchive } = await import('./feedback-archive.mjs');
  assert.equal(typeof inspectReportsArchive, 'function', 'new archive metadata interface');
  const f = fixture(); const original = await persistReports('inbox', ledger(), f.api);
  const changed = ledger(); changed['F-123'].sessions.push('new-session');
  const updated = await persistReports(original, changed, f.api);
  f.state.comments.push({ id: 800, body: 'Quoted marker:\n' + f.state.comments[0].body });
  assert.deepEqual(inspectReportsArchive(updated, f.state.comments), { index: 103, chunks: [102], superseded: [100, 101], problems: changed });
  assert.deepEqual(hydrateReports(original, f.state.comments), ledger());
  assert.deepEqual(inspectReportsArchive('legacy body', []), { index: null, chunks: [], superseded: [], problems: {} });
  const inline = writeReports('legacy body', ledger());
  assert.deepEqual(inspectReportsArchive(inline, []), { index: null, chunks: [], superseded: [], problems: ledger() });
  const json = f.state.comments[3].body.match(/```json\n([\s\S]*)\n```$/)[1];
  const v2 = `<!-- skill-feedback-reports:v2 ${Buffer.from(json).toString('base64')} -->`;
  assert.deepEqual(inspectReportsArchive(v2, f.state.comments), { index: null, chunks: [102], superseded: [100, 101, 103], problems: changed });
});
test('chunk and index CRLF API readback verifies and retries reuse both comments', async () => {
  const f = fixture(); const post = f.api.postComment;
  f.api.postComment = text => post(text.replace(/\n/g, '\r\n'));
  const data = ledger(); data['F-123'].friction = 'Literal first\r\nsecond\nthird';
  const body = await persistReports('inbox', data, f.api);
  assert.ok(f.state.comments.every(comment => comment.body.includes('\r\n')));
  assert.deepEqual(hydrateReports(body, f.state.comments), data);
  assert.equal(await persistReports(body, data, f.api), body);
  assert.equal(f.state.posted, 2);
});
test('human CRLF formatting preserves hydration while changed payload still refuses', async () => {
  const f = fixture(); const body = await persistReports('inbox', ledger(), f.api);
  for (const comment of f.state.comments) comment.body = comment.body.replace(/\n/g, '\r\n');
  assert.deepEqual(hydrateReports(body, f.state.comments), ledger());
  assert.equal(await persistReports(body, ledger(), f.api), body);
  f.state.comments[0].body = f.state.comments[0].body.replace('Observed trap', 'Changed trap');
  assert.throws(() => hydrateReports(body, f.state.comments), /hash or exact/);
  await assert.rejects(persistReports(body, ledger(), f.api), /hash or exact/);
  assert.equal(f.state.posted, 2);
});
for (const [name, fn] of cases) { await fn(); console.log(`PASS ${name}`); }
console.log(`${cases.length} archive checks passed.`);
