import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PendingAlerts, sessionUrl } from '../src/pending.mjs';

test('acknowledgement is scoped, idempotent, and cannot clear a newer alert', () => {
  const pending = new PendingAlerts();
  const first = pending.add({ message: 'first', category: 'done' }, 'codex');
  const second = pending.add({ message: 'second', category: 'blocked' }, 'codex');
  const claude = pending.add({ message: 'third', category: 'input_needed' }, 'claude');
  assert.equal(pending.acknowledge(first.notificationId, 'claude'), false);
  assert.equal(pending.acknowledge(first.notificationId, 'codex'), true);
  assert.equal(pending.acknowledge(first.notificationId, 'codex'), false);
  assert.equal(pending.latest('codex'), second);
  assert.equal(pending.latest('claude'), claude);
  assert.equal(pending.entries.length, 2);
});
test('session links only accept recognized IDs', () => {
  assert.equal(sessionUrl('claude', 'session_abc'), 'claude://code/session_abc');
  assert.throws(() => sessionUrl('codex', 'file:///anything'));
  assert.throws(() => sessionUrl('claude', 'session_abc?command=bad'));
});
test('background receiver retains alerts across restart and clears exactly one', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'agent-alerts-test-'));
  const config = join(folder, 'config.json');
  await writeFile(config, JSON.stringify({ keyboard: false, speech: false }));
  process.env.AGENT_ALERT_STATE_DIR = folder;
  process.env.AGENT_ALERT_CONFIG = config;
  delete process.env.AGENT_ALERT_PYTHON;
  const { requestBroker } = await import('../src/broker.mjs');
  try {
    const first = await requestBroker({ type: 'notify', app: 'codex', alert: { message: 'One' } });
    const second = await requestBroker({ type: 'notify', app: 'claude', alert: { message: 'Two' } });
    assert.equal(first.persistent, true);
    assert.equal((await requestBroker({ type: 'status' })).pending.length, 2);
    await requestBroker({ type: 'stop' });
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal((await requestBroker({ type: 'status' })).pending.length, 2);
    assert.equal((await requestBroker({ type: 'acknowledge', app: 'claude', notificationId: first.notificationId })).acknowledged, false);
    assert.equal((await requestBroker({ type: 'acknowledge', app: 'codex', notificationId: first.notificationId })).acknowledged, true);
    const remaining = (await requestBroker({ type: 'status' })).pending;
    assert.deepEqual(remaining.map(entry => entry.notificationId), [second.notificationId]);
    await requestBroker({ type: 'acknowledge', app: 'claude', notificationId: second.notificationId });
  } finally { await requestBroker({ type: 'stop' }); }
});
