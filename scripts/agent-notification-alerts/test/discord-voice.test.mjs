import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startDiscordVoiceWatcher } from '../src/discord-voice.mjs';
import { discordCallMutePath, discordConnectRequestPath, discordStatusPath, discordTokenPath } from '../src/voice-control.mjs';

function encode(opcode, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const header = Buffer.alloc(8);
  header.writeInt32LE(opcode, 0);
  header.writeInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}
function decodeFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (offset + 8 <= buffer.length) {
    const opcode = buffer.readInt32LE(offset);
    const length = buffer.readInt32LE(offset + 4);
    const payload = buffer.subarray(offset + 8, offset + 8 + length);
    frames.push({ opcode, payload: payload.length ? JSON.parse(payload.toString('utf8')) : null });
    offset += 8 + length;
  }
  return frames;
}

class FakeSocket extends EventEmitter {
  constructor(connects, onWrite) {
    super();
    this.destroyed = false;
    this.onWrite = onWrite;
    if (connects) setImmediate(() => this.emit('connect'));
    else setImmediate(() => this.emit('error', Object.assign(new Error('refused'), { code: 'ECONNREFUSED' })));
  }
  write(buffer) {
    for (const frame of decodeFrames(buffer)) this.onWrite?.(this, frame.payload);
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.emit('close');
  }
  reply(payload) {
    setImmediate(() => this.emit('data', encode(1, payload)));
  }
}

// Only pipe index 0 is a live Discord; every other index refuses, matching
// how a real machine with one running Discord client behaves.
function singlePipeConnect(onWrite) {
  return (path) => new FakeSocket(path.endsWith('-0'), onWrite);
}

async function withState(fn) {
  const directory = await mkdtemp(join(tmpdir(), 'discord-voice-'));
  const previous = process.env.AGENT_ALERT_STATE_DIR;
  process.env.AGENT_ALERT_STATE_DIR = directory;
  try {
    await fn(directory);
  } finally {
    if (previous === undefined) delete process.env.AGENT_ALERT_STATE_DIR;
    else process.env.AGENT_ALERT_STATE_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
}
async function waitFor(condition, { timeout = 3000, interval = 15 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error('Condition did not become true in time');
}
async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}
async function exists(path) {
  return readFile(path).then(() => true, () => false);
}

test('a reachable Discord that reports READY waits unauthorized without prompting a consent dialog', async () => {
  await withState(async () => {
    const connect = singlePipeConnect((socket, sent) => {
      if (sent.cmd === undefined && sent.v === 1) socket.reply({ cmd: 'DISPATCH', evt: 'READY', data: {} });
    });
    const watcher = startDiscordVoiceWatcher({ clientId: 'client', clientSecret: 'secret', connect, syncIntervalMs: 15 });
    try {
      await waitFor(async () => (await readJson(discordStatusPath(), {})).phase === 'unauthorized');
      assert.equal(await exists(discordCallMutePath()), false);
      assert.equal(await exists(discordConnectRequestPath()), false, 'no AUTHORIZE should be triggered automatically');
    } finally {
      await watcher.stop();
    }
  });
});

test('a Connect Discord request drives authorize, token exchange, authenticate, and the initial channel read', async () => {
  await withState(async () => {
    const connect = singlePipeConnect((socket, sent) => {
      if (sent.v === 1) return socket.reply({ cmd: 'DISPATCH', evt: 'READY', data: {} });
      if (sent.cmd === 'AUTHORIZE') return socket.reply({ cmd: 'AUTHORIZE', nonce: sent.nonce, data: { code: 'the-code' } });
      if (sent.cmd === 'AUTHENTICATE') return socket.reply({ cmd: 'AUTHENTICATE', nonce: sent.nonce, data: {} });
      if (sent.cmd === 'GET_SELECTED_VOICE_CHANNEL') return socket.reply({ cmd: 'GET_SELECTED_VOICE_CHANNEL', nonce: sent.nonce, data: null });
    });
    let tokenRequestBody;
    const fetchImpl = async (url, init) => {
      tokenRequestBody = Object.fromEntries(new URLSearchParams(init.body));
      return { ok: true, json: async () => ({ access_token: 'AT', refresh_token: 'RT', expires_in: 604800 }) };
    };
    const watcher = startDiscordVoiceWatcher({ clientId: 'client', clientSecret: 'secret', connect, fetchImpl, syncIntervalMs: 15 });
    try {
      await waitFor(async () => (await readJson(discordStatusPath(), {})).phase === 'unauthorized');
      await writeFile(discordConnectRequestPath(), '');
      await waitFor(async () => (await readJson(discordStatusPath(), {})).phase === 'ready');
      assert.equal(tokenRequestBody.grant_type, 'authorization_code');
      assert.equal(tokenRequestBody.code, 'the-code');
      assert.deepEqual(await readJson(discordTokenPath()), { access_token: 'AT', refresh_token: 'RT', expires_at: (await readJson(discordTokenPath())).expires_at });
      assert.equal(await exists(discordConnectRequestPath()), false, 'the one-time request marker is consumed');
      assert.equal(await exists(discordCallMutePath()), false);
    } finally {
      await watcher.stop();
    }
  });
});

test('selecting a voice channel mutes and leaving it unmutes, without replaying suppressed speech state', async () => {
  await withState(async () => {
    let socketRef;
    const connect = singlePipeConnect((socket, sent) => {
      socketRef = socket;
      if (sent.v === 1) return socket.reply({ cmd: 'DISPATCH', evt: 'READY', data: {} });
      if (sent.cmd === 'AUTHENTICATE') return socket.reply({ cmd: 'AUTHENTICATE', nonce: sent.nonce, data: {} });
      if (sent.cmd === 'GET_SELECTED_VOICE_CHANNEL') return socket.reply({ cmd: 'GET_SELECTED_VOICE_CHANNEL', nonce: sent.nonce, data: null });
    });
    await writeFile(discordTokenPath(), JSON.stringify({ access_token: 'AT', refresh_token: 'RT', expires_at: Date.now() + 100000 }));
    const watcher = startDiscordVoiceWatcher({ clientId: 'client', clientSecret: 'secret', connect, syncIntervalMs: 15 });
    try {
      await waitFor(async () => (await readJson(discordStatusPath(), {})).phase === 'ready');
      socketRef.reply({ cmd: 'DISPATCH', evt: 'VOICE_CHANNEL_SELECT', data: { channel_id: '999' } });
      await waitFor(() => exists(discordCallMutePath()));
      socketRef.reply({ cmd: 'DISPATCH', evt: 'VOICE_CHANNEL_SELECT', data: { channel_id: null } });
      await waitFor(async () => !(await exists(discordCallMutePath())));
    } finally {
      await watcher.stop();
    }
  });
});

test('a SUBSCRIBE acknowledgement is never mistaken for a channel-select dispatch', async () => {
  await withState(async () => {
    let socketRef;
    const connect = singlePipeConnect((socket, sent) => {
      socketRef = socket;
      if (sent.v === 1) return socket.reply({ cmd: 'DISPATCH', evt: 'READY', data: {} });
      if (sent.cmd === 'AUTHENTICATE') return socket.reply({ cmd: 'AUTHENTICATE', nonce: sent.nonce, data: {} });
      if (sent.cmd === 'GET_SELECTED_VOICE_CHANNEL') return socket.reply({ cmd: 'GET_SELECTED_VOICE_CHANNEL', nonce: sent.nonce, data: null });
    });
    await writeFile(discordTokenPath(), JSON.stringify({ access_token: 'AT', refresh_token: 'RT', expires_at: Date.now() + 100000 }));
    const watcher = startDiscordVoiceWatcher({ clientId: 'client', clientSecret: 'secret', connect, syncIntervalMs: 10 });
    try {
      await waitFor(async () => (await readJson(discordStatusPath(), {})).phase === 'ready');
      // A genuine dispatch establishes the call.
      socketRef.reply({ cmd: 'DISPATCH', evt: 'VOICE_CHANNEL_SELECT', data: { channel_id: '999' } });
      await waitFor(() => exists(discordCallMutePath()));
      // Nothing else replies after this: Discord's own SUBSCRIBE acknowledgement
      // echoes the same evt name with no channel data, so this isolates whether
      // it alone can wrongly clear an already-active call.
      socketRef.reply({ cmd: 'SUBSCRIBE', evt: 'VOICE_CHANNEL_SELECT', nonce: 'late-ack', data: {} });
      await new Promise((resolve) => setTimeout(resolve, 200));
      assert.equal(await exists(discordCallMutePath()), true, 'a SUBSCRIBE acknowledgement must never clear an active call');
    } finally {
      await watcher.stop();
    }
  });
});

test('an expired stored token is refreshed before authenticating, without a new consent prompt', async () => {
  await withState(async () => {
    let authorizeSent = false;
    const connect = singlePipeConnect((socket, sent) => {
      if (sent.v === 1) return socket.reply({ cmd: 'DISPATCH', evt: 'READY', data: {} });
      if (sent.cmd === 'AUTHORIZE') { authorizeSent = true; return; }
      if (sent.cmd === 'AUTHENTICATE') return socket.reply({ cmd: 'AUTHENTICATE', nonce: sent.nonce, data: {} });
      if (sent.cmd === 'GET_SELECTED_VOICE_CHANNEL') return socket.reply({ cmd: 'GET_SELECTED_VOICE_CHANNEL', nonce: sent.nonce, data: null });
    });
    await writeFile(discordTokenPath(), JSON.stringify({ access_token: 'STALE', refresh_token: 'RT', expires_at: Date.now() - 1000 }));
    let refreshRequestBody;
    const fetchImpl = async (url, init) => {
      refreshRequestBody = Object.fromEntries(new URLSearchParams(init.body));
      return { ok: true, json: async () => ({ access_token: 'FRESH', refresh_token: 'RT2', expires_in: 604800 }) };
    };
    const watcher = startDiscordVoiceWatcher({ clientId: 'client', clientSecret: 'secret', connect, fetchImpl, syncIntervalMs: 15 });
    try {
      await waitFor(async () => (await readJson(discordStatusPath(), {})).phase === 'ready');
      assert.equal(refreshRequestBody.grant_type, 'refresh_token');
      assert.equal(refreshRequestBody.refresh_token, 'RT');
      assert.equal((await readJson(discordTokenPath())).access_token, 'FRESH');
      assert.equal(authorizeSent, false, 'a valid refresh must never trigger a new consent prompt');
    } finally {
      await watcher.stop();
    }
  });
});

test('disabling the opt-out preference mid-call clears only the Discord-derived marker', async () => {
  await withState(async () => {
    let socketRef;
    const connect = singlePipeConnect((socket, sent) => {
      socketRef = socket;
      if (sent.v === 1) return socket.reply({ cmd: 'DISPATCH', evt: 'READY', data: {} });
      if (sent.cmd === 'AUTHENTICATE') return socket.reply({ cmd: 'AUTHENTICATE', nonce: sent.nonce, data: {} });
      if (sent.cmd === 'GET_SELECTED_VOICE_CHANNEL') return socket.reply({ cmd: 'GET_SELECTED_VOICE_CHANNEL', nonce: sent.nonce, data: { channel_id: 'already-in-call' } });
    });
    await writeFile(discordTokenPath(), JSON.stringify({ access_token: 'AT', refresh_token: 'RT', expires_at: Date.now() + 100000 }));
    const watcher = startDiscordVoiceWatcher({ clientId: 'client', clientSecret: 'secret', connect, syncIntervalMs: 15 });
    try {
      await waitFor(() => exists(discordCallMutePath()));
      const stateDir = discordCallMutePath().replace(/discord-call-muted$/, '');
      await writeFile(join(stateDir, 'discord-mute-disabled'), '');
      await waitFor(async () => !(await exists(discordCallMutePath())));
      // The underlying call itself must still be tracked as active — only the
      // marker file the opt-out preference gates should have been cleared.
      await waitFor(async () => (await readJson(discordStatusPath(), {})).inCall === true);
    } finally {
      await watcher.stop();
    }
  });
});

test('a Discord that is not running never reports a call and backs off without throwing', async () => {
  await withState(async () => {
    const connect = () => new FakeSocket(false);
    const watcher = startDiscordVoiceWatcher({ clientId: 'client', clientSecret: 'secret', connect, syncIntervalMs: 15 });
    try {
      await waitFor(async () => (await readJson(discordStatusPath(), {})).phase === 'unavailable');
      assert.equal((await readJson(discordStatusPath(), {})).inCall, false);
      assert.equal(await exists(discordCallMutePath()), false);
      assert.equal(watcher.getStatus().backoffMs, 2000, 'one full cycle through all refused pipes must back off by exactly one step, not one per pipe');
    } finally {
      await watcher.stop();
    }
  });
});

test('stop() removes a lingering call-mute marker so a killed watcher cannot leave voice muted forever', async () => {
  await withState(async () => {
    await writeFile(discordCallMutePath(), '');
    const watcher = startDiscordVoiceWatcher({ clientId: 'client', clientSecret: 'secret', connect: () => new FakeSocket(false), syncIntervalMs: 15 });
    await watcher.stop();
    assert.equal(await exists(discordCallMutePath()), false);
  });
});
