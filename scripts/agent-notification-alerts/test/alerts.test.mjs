import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { deliver, readConfig, withDeviceLease } from '../src/alerts.mjs';

test('invalid input never reaches devices', async () => {
  let touched = false;
  await assert.rejects(deliver({ message: ' ' }, { light: () => { touched = true; } }));
  assert.equal(touched, false);
});
test('speech still runs when keyboard fails; partial failure is visible', async () => {
  let spoken;
  const result = await deliver({ message: 'Hey, I finished the itinerary. Can you check the dates?' }, {
    config: await readConfig(), light: async () => { throw new Error('offline'); },
    speech: async alert => { spoken = alert.message; return 'spoken'; },
  });
  assert.equal(spoken, 'Hey, I finished the itinerary. Can you check the dates?');
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
    assert.deepEqual(Object.keys(tools[0].inputSchema.properties), ['message']);
    const message = 'Hey, I finished organizing the photos. Can you pick a cover?';
    const result = await client.callTool({ name: 'notify_user', arguments: { message } });
    assert.equal(result.isError, false);
    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.dryRun, true);
    assert.deepEqual(payload.alert, { message });
    assert.deepEqual(payload.lighting.handlers[0].color, { red: 255, green: 170, blue: 0 });
    const invalid = await client.callTool({ name: 'notify_user', arguments: { message: 'a'.repeat(281) } });
    assert.equal(invalid.isError, true);
  } finally { await client.close(); }
});
