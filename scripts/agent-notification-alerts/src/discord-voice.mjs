// Optional Discord voice-call detection over Discord's local RPC named pipe.
// Every failure here is fail-open: a missing/unreachable/unauthorized Discord
// never throws out of this module and never blocks normal alert delivery.
import { createConnection } from 'node:net';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import {
  discordAutoMuteEnabled,
  discordCallMutePath,
  discordConnectRequestPath,
  discordCredentialsPath,
  discordStatusPath,
  discordTokenPath,
} from './voice-control.mjs';
import { initialCallState, reduceCallState } from './discord-call-state.mjs';

const OP_HANDSHAKE = 0;
const OP_FRAME = 1;
const OP_CLOSE = 2;
const PIPE_COUNT = 10;
// Confirmed against a real Discord client: the local AUTHORIZE step rejects
// a missing redirect_uri key ("Missing redirect_uri in request") and a real
// URL alike ("Redirect URI cannot be used in the RPC OAuth2 Authorization
// flow") -- it wants the key present and explicitly null, since the code is
// delivered locally over IPC. The token exchange against Discord's actual
// HTTPS endpoint is a separate, real OAuth2 authorization_code grant, which
// does need a real redirect_uri matching one registered under the
// application's OAuth2 settings even though it's never actually visited.
const REDIRECT_URI = process.env.AGENT_ALERT_DISCORD_REDIRECT_URI || 'http://localhost';

function encodeFrame(opcode, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const header = Buffer.alloc(8);
  header.writeInt32LE(opcode, 0);
  header.writeInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

// Splits a byte stream into complete Discord IPC frames, tolerating chunks
// that split a frame's header or body across separate 'data' events.
function frameSplitter(onFrame) {
  let buffer = Buffer.alloc(0);
  return (chunk) => {
    buffer = buffer.length ? Buffer.concat([buffer, chunk]) : chunk;
    while (buffer.length >= 8) {
      const length = buffer.readInt32LE(4);
      if (buffer.length < 8 + length) break;
      const opcode = buffer.readInt32LE(0);
      const payload = buffer.subarray(8, 8 + length);
      buffer = buffer.subarray(8 + length);
      onFrame(opcode, payload.length ? JSON.parse(payload.toString('utf8')) : null);
    }
  };
}

async function exchangeToken({ clientId, clientSecret, fetchImpl, ...body }) {
  const response = await fetchImpl('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...body }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Discord token request failed: ${response.status}`);
  return response.json();
}

async function readToken() {
  try {
    return JSON.parse(await readFile(discordTokenPath(), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return null;
  }
}
async function writeToken(granted) {
  const target = discordTokenPath();
  await mkdir(target.replace(/[^/\\]+$/, ''), { recursive: true }).catch(() => {});
  const token = {
    access_token: granted.access_token,
    refresh_token: granted.refresh_token,
    expires_at: Date.now() + granted.expires_in * 1000,
  };
  await writeFile(target + '.tmp', JSON.stringify(token), { mode: 0o600 });
  await rename(target + '.tmp', target);
  return token;
}
async function clearToken() {
  await unlink(discordTokenPath()).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
}
// The saved credentials file (written by the desktop app's Discord card)
// takes priority over the environment variables, matching the existing
// precedent where a saved voice.json overrides the launcher's default voice.
export async function readDiscordCredentials() {
  try {
    const saved = JSON.parse(await readFile(discordCredentialsPath(), 'utf8'));
    if (saved?.clientId) return { clientId: saved.clientId, clientSecret: saved.clientSecret || '' };
  } catch {
    // Missing or corrupt: fall through to the environment-variable default.
  }
  if (process.env.AGENT_ALERT_DISCORD_CLIENT_ID) {
    return {
      clientId: process.env.AGENT_ALERT_DISCORD_CLIENT_ID,
      clientSecret: process.env.AGENT_ALERT_DISCORD_CLIENT_SECRET || '',
    };
  }
  return null;
}

async function ensureMarker(path, present) {
  if (present) {
    if (!existsSync(path)) await writeFile(path, '').catch(() => {});
  } else if (existsSync(path)) {
    await unlink(path).catch(() => {});
  }
}

// Starts a persistent, self-healing watcher. Never throws: connection and
// authorization problems are reported through the status file instead.
export function startDiscordVoiceWatcher({
  clientId,
  clientSecret,
  connect = createConnection,
  fetchImpl = fetch,
  syncIntervalMs = 500,
} = {}) {
  let state = initialCallState();
  let stopped = false;
  let socket;
  let reconnectTimer;
  let syncTimer;

  async function syncMarker() {
    const enabled = discordAutoMuteEnabled();
    await ensureMarker(discordCallMutePath(), state.inCall && enabled);
    const target = discordStatusPath();
    await mkdir(target.replace(/[^/\\]+$/, ''), { recursive: true }).catch(() => {});
    try {
      // Write-then-rename so a concurrent reader (this watcher's own next
      // tick, or the desktop app polling the same file) never sees a
      // truncated or partially written file.
      await writeFile(
        target + '.tmp',
        JSON.stringify({
          configured: true,
          phase: state.phase,
          inCall: state.inCall,
          autoMuteEnabled: enabled,
          error: state.error,
          updatedAt: Date.now(),
        }),
      );
      await rename(target + '.tmp', target);
    } catch {
      // Fail-open: a status-file write failure never affects mute delivery.
    }
  }

  async function applyEvent(event) {
    state = reduceCallState(state, event);
    await syncMarker();
  }

  function send(target, cmd, args, evt) {
    const nonce = randomUUID();
    target.write(encodeFrame(OP_FRAME, evt ? { cmd, evt, nonce } : { cmd, args, nonce }));
    return nonce;
  }

  async function authenticateWith(target, token) {
    await applyEvent({ type: 'authenticate-attempt' });
    send(target, 'AUTHENTICATE', { access_token: token.access_token });
  }

  async function onReady(target) {
    await applyEvent({ type: 'reset-backoff' });
    const token = await readToken().catch(() => null);
    if (!token) return applyEvent({ type: 'handshake' });
    if (token.expires_at > Date.now()) return authenticateWith(target, token);
    try {
      const refreshed = await exchangeToken({
        clientId,
        clientSecret,
        fetchImpl,
        grant_type: 'refresh_token',
        refresh_token: token.refresh_token,
      });
      await authenticateWith(target, await writeToken(refreshed));
    } catch (error) {
      await clearToken();
      await applyEvent({ type: 'auth-failed', reason: error.message });
    }
  }

  async function onConnectRequest(target) {
    if (!existsSync(discordConnectRequestPath())) return;
    await unlink(discordConnectRequestPath()).catch(() => {});
    if (state.authorized || state.phase === 'authorizing') return;
    await applyEvent({ type: 'authorize-requested' });
    send(target, 'AUTHORIZE', { client_id: clientId, scopes: ['rpc', 'rpc.voice.read'], redirect_uri: null });
  }

  async function onFrame(target, payload) {
    if (process.env.AGENT_ALERT_DISCORD_DEBUG) console.error('[discord frame]', JSON.stringify(payload));
    if (!payload) return;
    // Only a genuine DISPATCH frame carries an unsolicited event; a SUBSCRIBE
    // command's own reply also echoes back the same evt name and must not be
    // mistaken for one (it briefly reported an empty channel on every
    // reconnect, which momentarily un-muted a live call).
    if (payload.cmd === 'DISPATCH' && payload.evt === 'READY') return onReady(target);
    if (payload.evt === 'ERROR') {
      // 4009/4006 are Discord's expired/invalid-token codes for this RPC;
      // only those invalidate a stored token. Any other error (a bad
      // AUTHORIZE request, for instance) still must not leave the watcher
      // silently stuck in 'authorizing' or 'authenticating' forever.
      if (payload.data?.code === 4009 || payload.data?.code === 4006) await clearToken();
      await applyEvent({ type: 'auth-failed', reason: payload.data?.message || `Discord reported error ${payload.data?.code}.` });
      return;
    }
    if (payload.cmd === 'AUTHORIZE') {
      const code = payload.data?.code;
      if (!code) return applyEvent({ type: 'auth-failed', reason: 'Discord authorization was not completed.' });
      try {
        const granted = await exchangeToken({ clientId, clientSecret, fetchImpl, grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI });
        await authenticateWith(target, await writeToken(granted));
      } catch (error) {
        await applyEvent({ type: 'auth-failed', reason: error.message });
      }
      return;
    }
    if (payload.cmd === 'AUTHENTICATE') {
      await applyEvent({ type: 'authenticated' });
      send(target, 'SUBSCRIBE', {}, 'VOICE_CHANNEL_SELECT');
      send(target, 'GET_SELECTED_VOICE_CHANNEL', {});
      return;
    }
    if (payload.cmd === 'GET_SELECTED_VOICE_CHANNEL' || (payload.cmd === 'DISPATCH' && payload.evt === 'VOICE_CHANNEL_SELECT')) {
      const channelId = payload.data?.channel_id ?? payload.data?.channel?.id ?? payload.data?.id ?? null;
      await applyEvent({ type: 'voice-channel', channelId });
    }
  }

  function scheduleReconnect(reason) {
    if (stopped) return;
    applyEvent({ type: 'unavailable', reason }).catch(() => {});
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectOnce, state.backoffMs);
  }

  function tryPipes(index) {
    if (stopped) return;
    if (index >= PIPE_COUNT) return scheduleReconnect('Discord is not running.');
    const path = `\\\\.\\pipe\\discord-ipc-${index}`;
    const attempt = connect(path);
    let handshakeSent = false;
    attempt.on('connect', () => {
      handshakeSent = true;
      attempt.write(encodeFrame(OP_HANDSHAKE, { v: 1, client_id: clientId }));
    });
    attempt.on(
      'data',
      frameSplitter((opcode, payload) => {
        if (opcode === OP_CLOSE) return attempt.destroy();
        onFrame(attempt, payload).catch(() => {});
      }),
    );
    attempt.on('error', () => {
      // Already deciding the outcome here: clear the reference first so the
      // 'close' handler below (which can fire synchronously or later, after
      // socket has moved on to a different attempt) never schedules a second,
      // redundant reconnect for the same failure.
      if (socket === attempt) socket = undefined;
      attempt.destroy();
      if (!handshakeSent) tryPipes(index + 1);
      else scheduleReconnect('Discord disconnected.');
    });
    attempt.on('close', () => {
      if (socket === attempt) {
        socket = undefined;
        scheduleReconnect('Discord disconnected.');
      }
    });
    socket = attempt;
  }

  function connectOnce() {
    if (stopped) return;
    applyEvent({ type: 'connecting' }).catch(() => {});
    tryPipes(0);
  }

  function tick() {
    if (stopped) return;
    syncMarker().catch(() => {});
    if (socket && !socket.destroyed) onConnectRequest(socket).catch(() => {});
    syncTimer = setTimeout(tick, syncIntervalMs);
  }

  connectOnce();
  tick();

  return {
    getStatus() {
      return { ...state };
    },
    async stop() {
      stopped = true;
      clearTimeout(reconnectTimer);
      clearTimeout(syncTimer);
      socket?.destroy();
      await ensureMarker(discordCallMutePath(), false);
    },
  };
}
