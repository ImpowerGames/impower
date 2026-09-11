import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { z } from 'zod';

export const alertShape = {
  session: z.object({ id: z.string().min(1).max(128) }).strict().optional().describe('Optional verified desktop session ID for the shortcut. Omit when unavailable.'),
  message: z.string().trim().min(1).max(280).describe('A short notification accompanying the normal chat handoff: what you finished and, if needed, what the user should do next. Any topic. Use plain text without markdown, code, or secrets; the receiver chooses how to deliver it.'),
  category: z.enum(['done', 'input_needed', 'blocked']).default('done').describe('done: finished with no user action required; input_needed: a normal question, decision or review; blocked: a problem requires user help before work can continue.'),
};
export const alertSchema = z.object(alertShape).strict();
const configSchema = z.object({
  keyboard: z.boolean(), speech: z.boolean(),
  durationMs: z.number().int().min(1000).max(30000),
  zone: z.enum(['function-keys', 'all']),
  volume: z.number().int().min(0).max(100),
  rate: z.number().int().min(-10).max(10),
  colors: z.object({
    done: z.tuple([z.number().int().min(0).max(255), z.number().int().min(0).max(255), z.number().int().min(0).max(255)]),
    input_needed: z.tuple([z.number().int().min(0).max(255), z.number().int().min(0).max(255), z.number().int().min(0).max(255)]),
    blocked: z.tuple([z.number().int().min(0).max(255), z.number().int().min(0).max(255), z.number().int().min(0).max(255)]),
  }),
  keys: z.object({
    codex: z.array(z.number().int().min(4).max(231)).min(1),
    claude: z.array(z.number().int().min(4).max(231)).min(1),
  }),
}).strict();
export async function readConfig() {
  const defaults = JSON.parse(await readFile(new URL('../config.example.json', import.meta.url), 'utf8'));
  let local = {};
  try { local = JSON.parse(await readFile(process.env.AGENT_ALERT_CONFIG || new URL('../config.local.json', import.meta.url), 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  // A previous message-only prototype used one color for every alert.
  const { color: legacyColor, ...overrides } = local;
  const colors = legacyColor ? { done: legacyColor, input_needed: legacyColor, blocked: legacyColor } : defaults.colors;
  return configSchema.parse({ ...defaults, ...overrides, colors: { ...colors, ...local.colors }, keys: { ...defaults.keys, ...local.keys } });
}
const game = 'AGENT_NOTIFICATION_ALERTS';
export function binding(config, category = 'done', app = process.env.AGENT_ALERT_APP) {
  const [red, green, blue] = config.colors[category];
  const keys = app === 'codex' || app === 'claude' ? config.keys[app] : null;
  return { game, event: 'ATTENTION', min_value: 0, max_value: 1, handlers: [{
    'device-type': 'rgb-per-key-zones', ...(keys ? { 'custom-zone-keys': keys } : { zone: config.zone }), mode: 'color',
    color: { red, green, blue }, rate: { frequency: 1 },
  }] };
}
export async function findEngine() {
  for (const dir of ['SteelSeries Engine 3', 'GG']) {
    try {
      const props = JSON.parse(await readFile(`${process.env.ProgramData || 'C:/ProgramData'}/SteelSeries/${dir}/coreProps.json`, 'utf8'));
      if (/^127\.0\.0\.1:\d+$/.test(props.address)) return `http://${props.address}`;
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  throw new Error('SteelSeries Engine address not found. Start SteelSeries GG / Engine.');
}
async function lighting(alert, config) {
  const address = await findEngine();
  const post = async (route, body) => {
    const response = await fetch(`${address}/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw new Error(`SteelSeries ${route}: ${response.status} ${await response.text()}`);
  };
  await post('game_metadata', { game, game_display_name: 'Agent Notification Alerts', developer: 'Local agent tools' });
  try {
    await post('bind_game_event', binding(config, alert.category));
    const end = Date.now() + config.durationMs;
    while (Date.now() < end) {
      await post('game_event', { game, event: 'ATTENTION', data: { value: 1 } });
      await new Promise(resolve => setTimeout(resolve, Math.min(1000, Math.max(0, end - Date.now()))));
    }
  } finally {
    await post('stop_game', { game });
  }
  return 'Lighting events accepted; normal profile released after alert.';
}
export function speak(alert, config) {
  if (process.platform !== 'win32') return Promise.reject(new Error('Speech currently requires Windows.'));
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', fileURLToPath(new URL('./speak.ps1', import.meta.url))], {
      windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'],
    });
    let errors = '';
    child.stderr.on('data', chunk => { errors += chunk; });
    child.stdin.on('error', () => {});
    const timeout = setTimeout(() => child.kill(), 90000);
    child.on('error', error => { clearTimeout(timeout); reject(error); });
    child.on('close', code => {
      clearTimeout(timeout);
      if (code === 0) resolve('Windows speech playback completed on default audio output.');
      else reject(new Error(errors || `Speech exited with code ${code}`));
    });
    child.stdin.end(JSON.stringify({ text: alert.message, volume: config.volume, rate: config.rate }));
  });
}
export async function deliver(input, { dryRun = false, config, light = lighting, speech = speak } = {}) {
  const alert = alertSchema.parse(input);
  config ??= await readConfig();
  if (dryRun) return { dryRun: true, alert, lighting: binding(config, alert.category), speech: config.speech };
  const channels = [['keyboard', config.keyboard, light], ['speech', config.speech, speech]];
  const results = await Promise.all(channels.map(async ([name, enabled, fn]) => {
    if (!enabled) return [name, { status: 'disabled' }];
    try { return [name, { status: 'ok', detail: await fn(alert, config) }]; }
    catch (e) { return [name, { status: 'error', detail: e.message }]; }
  }));
  return { alert, channels: Object.fromEntries(results) };
}

// A loopback lease serializes separate MCP/CLI processes. The OS releases it
// on crashes; no stale lock file can permanently silence future alerts.
export async function withDeviceLease(action, { port = 39761, waitMs = 120000 } = {}) {
  const deadline = Date.now() + waitMs;
  while (true) {
    const lease = createServer(socket => socket.destroy());
    try {
      await new Promise((resolve, reject) => {
        lease.once('error', reject);
        lease.listen(port, '127.0.0.1', resolve);
      });
    } catch (error) {
      if (error.code !== 'EADDRINUSE') throw error;
      if (Date.now() >= deadline) throw new Error('Notification devices busy. Another alert or application holds local port 39761.');
      await new Promise(resolve => setTimeout(resolve, 250));
      continue;
    }
    try { return await action(); }
    finally { await new Promise(resolve => lease.close(resolve)); }
  }
}
