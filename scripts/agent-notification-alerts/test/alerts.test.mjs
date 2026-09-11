import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { deliver, readConfig, binding, withDeviceLease } from '../src/alerts.mjs';

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
    const notifyTool = tools.find(tool => tool.name === 'notify_user');
    assert.deepEqual(Object.keys(notifyTool.inputSchema.properties), ['session', 'message', 'category']);
    assert.ok(tools.some(tool => tool.name === 'acknowledge_notification'));
    const ack = await client.callTool({ name: 'acknowledge_notification', arguments: { notificationId: '11111111-1111-4111-8111-111111111111' } });
    assert.equal(JSON.parse(ack.content[0].text).dryRun, true);
    const badAck = await client.callTool({ name: 'acknowledge_notification', arguments: { notificationId: 'guessed' } });
    assert.equal(badAck.isError, true);
    const message = 'Hey, I finished organizing the photos. Can you pick a cover?';
    const result = await client.callTool({ name: 'notify_user', arguments: { message } });
    assert.equal(result.isError, false);
    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.dryRun, true);
    assert.deepEqual(payload.alert, { message, category: 'done' });
    assert.deepEqual(payload.lighting.handlers[0].color, { red: 0, green: 255, blue: 80 });
    const needsInput = await client.callTool({ name: 'notify_user', arguments: { message, category: 'input_needed' } });
    assert.deepEqual(JSON.parse(needsInput.content[0].text).lighting.handlers[0].color, { red: 255, green: 140, blue: 0 });
    const badCategory = await client.callTool({ name: 'notify_user', arguments: { message, category: 'merge_ready' } });
    assert.equal(badCategory.isError, true);
    const invalid = await client.callTool({ name: 'notify_user', arguments: { message: 'a'.repeat(281) } });
    assert.equal(invalid.isError, true);
  } finally { await client.close(); }
});

test('generic categories route Codex to F1 and Claude to F2', async () => {
  const config = await readConfig();
  for (const [app, key] of [['codex', 58], ['claude', 59]]) {
    for (const [category, color] of Object.entries(config.colors)) {
      const handler = binding(config, category, app).handlers[0];
      assert.deepEqual(handler['custom-zone-keys'], [key]);
      assert.equal(handler.zone, undefined);
      assert.deepEqual(handler.color, { red: color[0], green: color[1], blue: color[2] });
    }
  }
  assert.equal(binding(config, 'done', 'other').handlers[0].zone, 'function-keys');
});

test('CLI category option preserves the spoken sentence and rejects missing values', async () => {
  const run = promisify(execFile);
  const main = fileURLToPath(new URL('../src/main.mjs', import.meta.url));
  const message = 'Hey, I finished the notes. Can you check them?';
  const { stdout } = await run(process.execPath, [main, 'notify', message, '--category', 'input_needed', '--dry-run'], { env: { ...process.env, AGENT_ALERT_APP: 'claude' } });
  const result = JSON.parse(stdout);
  assert.deepEqual(result.alert, { message, category: 'input_needed' });
  assert.deepEqual(result.lighting.handlers[0]['custom-zone-keys'], [59]);
  await assert.rejects(run(process.execPath, [main, 'notify', message, '--category', '--dry-run']));
});
