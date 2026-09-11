import assert from 'node:assert/strict';
import { readReports, writeReports } from './feedback-reports.mjs';
const row = { skill: 'review-pr, section 3', friction: 'Literal <!-- marker -->\n`code` | pipe', edit: 'Keep C:\\path', status: 'ticketed #518', problemId: 'F-123', sessions: ['codex:thread-1', 'claude:session-2'], historyIncomplete: false };
const payload = json => '<!-- skill-feedback-reports:v1 ' + Buffer.from(json).toString('base64') + ' -->';
const marker = problems => payload(JSON.stringify({ version: 1, problems }));
let count = 0;
function test(name, check) { check(); count++; console.log('PASS: ' + name); }
test('absent ledger stays empty without converting legacy table text', () => {
  const body = '| Skill, section | Friction | Proposed edit | Status |\r\n| old | grouped legacy | proposals | open |\r\n';
  assert.deepEqual(readReports(body), {});
  assert.equal(writeReports(body), body);
});
test('full archived rows round-trip and replacing ledger preserves surrounding bytes', () => {
  const body = 'Intro\r\n' + marker({ 'F-123': row }) + '\r\nSuffix without newline';
  assert.deepEqual(readReports(body), { 'F-123': row });
  const updated = { 'F-123': { ...row, status: 'applied in PR #700', sessions: [...row.sessions, 'codex:thread-3'] } };
  const result = writeReports(body, updated);
  assert.equal(result, 'Intro\r\n' + marker(updated) + '\r\nSuffix without newline');
  assert.deepEqual(readReports(result), updated);
  assert.ok(!result.includes(row.friction));
});
test('only the live ledger is read or replaced when fenced examples exist', () => {
  const example = '```text\n<!-- skill-feedback-reports:v9 broken -->\n```\n';
  const isFenced = (body, offset) => offset < body.indexOf('```\n') + 3;
  const body = example + marker({ 'F-123': row }) + '\nTail';
  assert.deepEqual(readReports(body, isFenced), { 'F-123': row });
  assert.equal(writeReports(body, { 'F-123': row }, isFenced), body);
  assert.deepEqual(readReports(example, isFenced), {});
});
test('malformed, unsupported and duplicate markers refuse read and write', () => {
  for (const text of ['<!-- skill-feedback-reports:v2 YQ== -->', '<!-- skill-feedback-reports:v1 !!! -->', '<!-- skill-feedback-reports:v1 YQ==', marker({}) + '\n' + marker({}), '<!-- skill-feedback-reports malformed -->']) {
    assert.throws(() => readReports(text), /ledger|marker/);
    assert.throws(() => writeReports(text, {}), /ledger|marker/);
  }
});
test('noncanonical base64, invalid UTF-8, malformed JSON and duplicate JSON keys refuse', () => {
  const valid = marker({ 'F-123': { ...row, edit: 'a' } });
  const noPadding = valid.replace(/=+(?= -->)/, '');
  assert.notEqual(valid, noPadding, 'fixture must exercise base64 padding');
  assert.throws(() => readReports(noPadding), /base64/);
  for (const json of ['{', '{ "version":1,"problems":{}}', '{"version":1,"version":1,"problems":{}}', '{"version":2,"problems":{}}']) assert.throws(() => readReports(payload(json)), /JSON|envelope/);
  assert.throws(() => readReports('<!-- skill-feedback-reports:v1 /w== -->'), /UTF-8/);
});
test('invalid identities, omitted fields, extra fields and invalid scalar values refuse', () => {
  const changes = [{ problemId: 'F-999' }, { skill: '' }, { friction: ' ' }, { edit: 1 }, { status: 'closed' }, { status: 'ticketed #0' }, { historyIncomplete: 'unknown' }, { extra: 1 }];
  for (const change of changes) assert.throws(() => writeReports('', { 'F-123': { ...row, ...change } }));
  for (const key of ['F-0', 'F-01', 'legacy-1', '__proto__']) assert.throws(() => writeReports('', { [key]: { ...row, problemId: key } }));
  const missing = { ...row }; delete missing.sessions;
  assert.throws(() => readReports(marker({ 'F-123': missing })), /fields/);
  assert.throws(() => writeReports('', []), /object/);
  assert.throws(() => writeReports('', Object.create({ inherited: true })), /object/);
});
test('session references have bounded exact identity and reject duplicates', () => {
  for (const sessions of [['same', 'same'], [''], [' padded'], ['x\ny'], ['x\ry'], ['x\u2028y'], ['x'.repeat(201)], [4], 'not-array']) assert.throws(() => writeReports('', { 'F-123': { ...row, sessions } }), /session/i);
  for (const sessions of [[], ['x'.repeat(200)], ['a', 'A']]) assert.deepEqual(readReports(writeReports('', { 'F-123': { ...row, sessions, historyIncomplete: true } }))['F-123'].sessions, sessions);
});
test('writes preserve archived identities and prior session membership', () => {
  const body = marker({ 'F-123': row });
  assert.throws(() => writeReports(body, {}), /cannot remove archived problem F-123/);
  assert.throws(() => writeReports(body, { 'F-123': { ...row, sessions: [row.sessions[0]] } }), /cannot remove recorded sessions/);
  const ledger = { 'F-123': { ...row, sessions: [...row.sessions].reverse() }, 'F-456': { ...row, problemId: 'F-456', sessions: ['new-session'] } };
  assert.deepEqual(readReports(writeReports(body, ledger)), ledger);
  assert.equal(readReports(body)['F-123'].sessions.length, 2);
});
console.log(`All ${count} reports-ledger checks passed.`);
