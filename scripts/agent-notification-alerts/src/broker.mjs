import { createServer, createConnection } from 'node:net';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { z } from 'zod';
import { alertSchema, readConfig, binding, findEngine, speak } from './alerts.mjs';
import { PendingAlerts } from './pending.mjs';
import { voiceMuted, lightsMuted } from './voice-control.mjs';

const stateDir = process.env.AGENT_ALERT_STATE_DIR || join(homedir(), '.agent-notification-alerts');
const hash = createHash('sha256').update(stateDir).digest('hex').slice(0, 20);
// Linux abstract sockets disappear even after a crash; no stale path to unlink.
const endpoint = process.platform === 'win32' ? '\\\\.\\pipe\\agent-alerts-' + hash
  : process.platform === 'linux' ? '\0agent-alerts-' + hash
  : join(tmpdir(), 'agent-alerts-' + hash + '.sock');
const stateFile = join(stateDir, 'pending.json');
const appSchema = z.enum(['codex', 'claude', 'other']);
const entrySchema = z.object({ notificationId: z.string().uuid(), app: appSchema, alert: alertSchema }).strict();
const requestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('notify'), app: appSchema, alert: alertSchema }).strict(),
  z.object({ type: z.literal('acknowledge'), app: appSchema, notificationId: z.string().uuid() }).strict(),
  z.object({ type: z.literal('status') }).strict(),
  z.object({ type: z.literal('stop') }).strict(),
]);

function exchange(request) {
  return new Promise((resolve, reject) => {
    const socket = createConnection(endpoint);
    let buffer = '';
    socket.setTimeout(10000, () => socket.destroy(new Error('Notifier response timed out')));
    socket.on('error', reject);
    socket.on('connect', () => socket.write(JSON.stringify(request) + '\n'));
    socket.on('data', chunk => {
      buffer += chunk;
      if (buffer.length > 65536) return socket.destroy(new Error('Notifier response too large'));
      if (!buffer.includes('\n')) return;
      socket.end();
      try {
        const result = JSON.parse(buffer.split('\n')[0]);
        if (result.error) reject(new Error(result.error)); else resolve(result);
      } catch (error) { reject(error); }
    });
    socket.on('end', () => { if (!buffer.includes('\n')) reject(new Error('Notifier disconnected')); });
  });
}
export async function requestBroker(input) {
  const request = requestSchema.parse(input);
  try { return await exchange(request); }
  catch (error) {
    if (!['ENOENT', 'ECONNREFUSED'].includes(error.code)) throw error;
    if (request.type === 'stop') return { stopped: true };
  }
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url)], {
    detached: true, windowsHide: true, stdio: 'ignore', env: process.env,
  });
  let startError;
  child.on('error', error => { startError = error; });
  child.unref();
  for (let attempt = 0; attempt < 40; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 100));
    if (startError) throw startError;
    try { return await exchange(request); }
    catch (error) { if (!['ENOENT', 'ECONNREFUSED'].includes(error.code)) throw error; }
  }
  throw new Error('Could not start the notification background process.');
}

export async function runBroker() {
  const config = await readConfig();
  await mkdir(stateDir, { recursive: true });
  let pending = new PendingAlerts();
  const status = { keyboard: config.keyboard ? 'starting' : 'disabled', speech: config.speech ? 'idle' : 'disabled', shortcuts: 'disabled' };
  let bridge, timer, address, signature = '', queue = Promise.resolve(), speechQueue = Promise.resolve();
  const persist = async () => {
    await writeFile(stateFile + '.tmp', JSON.stringify(pending.entries), { mode: 0o600 });
    await rename(stateFile + '.tmp', stateFile);
  };
  const post = async (route, body) => {
    address ||= await findEngine();
    const response = await fetch(address + '/' + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw new Error('SteelSeries ' + route + ': ' + response.status);
  };
  const refresh = async () => {
    try {
      const selected = z.object({ codex: z.number().int().min(1).max(12), claude: z.number().int().min(1).max(12) }).strict().refine(value => value.codex !== value.claude).parse(JSON.parse(await readFile(join(stateDir, 'key-bindings.json'), 'utf8')));
      if (JSON.stringify(selected) !== JSON.stringify(config.shortcuts)) {
        config.shortcuts = selected;
        config.keys = { codex: [57 + selected.codex], claude: [57 + selected.claude] };
        signature = '';
        bridge?.stdin.write(JSON.stringify({ type: 'rebind', shortcuts: selected }) + '\n');
      }
    } catch (error) {
      if (error.code !== 'ENOENT') status.shortcuts = 'Invalid saved key bindings: ' + error.message;
    }
    if (!config.keyboard) return;
    if (lightsMuted()) {
      if (status.keyboard !== 'muted') {
        try {
          await post('stop_game', { game: 'AGENT_NOTIFICATION_ALERTS' });
          signature = '';
          status.keyboard = 'muted';
        } catch (error) { address = undefined; status.keyboard = error.message; }
      }
      return;
    }
    const entries = ['codex', 'claude', 'other'].map(app => pending.latest(app)).filter(Boolean);
    const next = JSON.stringify(entries.map(entry => [entry.app, entry.alert.category]));
    try {
      if (next !== signature) {
        await post('stop_game', { game: 'AGENT_NOTIFICATION_ALERTS' });
        if (entries.length) {
          const payload = binding(config);
          payload.handlers = entries.flatMap(entry => binding(config, entry.alert.category, entry.app).handlers);
          await post('game_metadata', { game: payload.game, game_display_name: 'Agent Notification Alerts', developer: 'Local agent tools' });
          await post('bind_game_event', payload);
        }
        signature = next;
      }
      if (entries.length) await post('game_event', { game: 'AGENT_NOTIFICATION_ALERTS', event: 'ATTENTION', data: { value: 1 } });
      status.keyboard = entries.length ? 'flashing' : 'idle';
    } catch (error) { address = undefined; signature = ''; status.keyboard = error.message; }
  };
  const enqueue = fn => { const job = queue.then(fn); queue = job.catch(() => {}); return job; };
  const handle = async request => {
    if (request.type === 'status') return { pending: pending.entries, channels: { ...status, ...(voiceMuted() ? { speech: 'muted' } : {}) } };
    if (request.type === 'stop') {
      clearInterval(timer);
      bridge?.stdin.end();
      if (config.keyboard) await post('stop_game', { game: 'AGENT_NOTIFICATION_ALERTS' }).catch(() => {});
      // Closing unlinks filesystem sockets on platforms that use them. Respond
      // before waiting for connected clients to disconnect.
      server.close(() => process.exit(0));
      return { stopped: true, pendingRetained: true };
    }
    const previous = [...pending.entries];
    let entry, acknowledged;
    if (request.type === 'notify') entry = pending.add(request.alert, request.app);
    else acknowledged = pending.acknowledge(request.notificationId, request.app);
    try { await persist(); } catch (error) { pending.entries = previous; throw error; }
    // Delivery is asynchronous: acknowledging must never wait for speech to finish.
    if (entry && config.speech && !voiceMuted()) {
      speechQueue = speechQueue.then(async () => {
        status.speech = 'speaking';
        try { await speak(entry.alert, config); status.speech = 'idle'; }
        catch (error) { status.speech = error.message; }
      });
    }
    return entry ? { notificationId: entry.notificationId, status: 'queued', persistent: true } : { notificationId: request.notificationId, acknowledged, status: acknowledged ? 'acknowledged' : 'already_cleared_or_unknown' };
  };
  let markReady;
  const initialized = new Promise(resolve => { markReady = resolve; });
  const server = createServer(socket => {
    let buffer = '';
    socket.setTimeout(10000, () => socket.destroy());
    socket.on('error', () => {});
    socket.on('data', chunk => {
      buffer += chunk;
      if (buffer.length > 8192) return socket.destroy();
      if (!buffer.includes('\n')) return;
      socket.removeAllListeners('data');
      enqueue(async () => {
        await initialized;
        return handle(requestSchema.parse(JSON.parse(buffer.split('\n')[0])));
      }).then(result => socket.end(JSON.stringify(result) + '\n'), error => socket.end(JSON.stringify({ error: error.message }) + '\n'));
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(endpoint, resolve); });
  // Only the process that owns the endpoint reads or mutates persistent state.
  try { pending = new PendingAlerts(z.array(entrySchema).parse(JSON.parse(await readFile(stateFile, 'utf8')))); }
  catch (error) { if (error.code !== 'ENOENT') { server.close(); throw error; } }
  if (process.platform === 'win32' && process.env.AGENT_ALERT_PYTHON) {
    status.shortcuts = 'starting';
    bridge = spawn(process.env.AGENT_ALERT_PYTHON, [fileURLToPath(new URL('./windows-session.py', import.meta.url)), JSON.stringify(config.shortcuts), config.shortcutModifiers], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    bridge.stdin.on('error', () => {});
    bridge.on('error', error => { status.shortcuts = error.message; });
    bridge.on('exit', () => { status.shortcuts = 'stopped'; });
    createInterface({ input: bridge.stdout }).on('line', line => {
      try {
        const event = JSON.parse(line);
        if (event.type === 'ready') status.shortcuts = event.hotkeys;
        if (event.type === 'error') status.shortcuts = event.message;
        if (event.type === 'hotkey') {
          const entry = pending.latest(event.app);
          if (entry?.alert.session) bridge.stdin.write(JSON.stringify({ type: 'open', app: event.app, id: entry.alert.session.id }) + '\n');
        }
      } catch {}
    });
  }
  markReady();
  process.send?.({ type: 'ready' });
  // Do not accumulate heartbeat jobs while a device is offline.
  const tick = () => { timer = setTimeout(() => enqueue(refresh).finally(tick), 1000); };
  tick();
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runBroker().catch(error => { console.error(error.message); process.exitCode = 1; });
}
