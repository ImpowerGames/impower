import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { deliver, readConfig, withDeviceLease } from '../src/alerts.mjs';

test('invalid input never reaches devices', async () => {
  let touched = false;
  await assert.rejects(deliver({ message: ' ', reason: 'merge_ready' }, { light: () => { touched = true; } }));
  assert.equal(touched, false);
});
test('speech still runs when keyboard fails; partial failure is visible', async () => {
  let spoken;
  const result = await deliver({ message: 'Please review PR 12', reason: 'review_ready' }, {
    config: await readConfig(), light: async () => { throw new Error('offline'); },
    speech: async alert => { spoken = alert.message; return 'spoken'; },
  });
  assert.equal(spoken, 'Please review PR 12');
  assert.equal(result.channels.keyboard.status, 'error');
  assert.equal(result.channels.speech.status, 'ok');
});
test('device lease prevents overlap and releases on error', async () => {
  const options = { port: 39762, waitMs: 3000 };
  const events = [];
  await Promise.all([
    withDeviceLease(async () => { events.push('a'); await new Promise(resolve => setTimeout(resolve, 100)); events.push('b'); }, options),
    withDeviceLease(async () => { events.push('c'); }, options),
  ]);
  assert.ok(events.join('') === 'abc' || events.join('') === 'cab');
  await assert.rejects(withDeviceLease(async () => { throw new Error('failed'); }, options));
  assert.equal(await withDeviceLease(async () => 'released', options), 'released');
});
test('real MCP client discovers and invokes tool without hardware effects', async () => {
  const client = new Client({ name: 'alert-test', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('../src/main.mjs', import.meta.url)), 'mcp', '--dry-run'] });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.equal(tools[0].name, 'notify_user');
    const result = await client.callTool({ name: 'notify_user', arguments: { source: 'Claude', reason: 'merge_ready', message: 'PR 12 is ready for your merge.' } });
    assert.equal(result.isError, false);
    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.dryRun, true);
    assert.deepEqual(payload.lighting.handlers[0].color, { red: 0, green: 255, blue: 80 });
    const invalid = await client.callTool({ name: 'notify_user', arguments: { message: 'Hello', reason: 'invented' } });
    assert.equal(invalid.isError, true);
  } finally { await client.close(); }
});
