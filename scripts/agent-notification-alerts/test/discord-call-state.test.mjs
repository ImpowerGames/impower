import test from 'node:test';
import assert from 'node:assert/strict';
import { initialCallState, reduceCallState } from '../src/discord-call-state.mjs';

test('a selected voice channel counts as a call regardless of self-mute or deafen', () => {
  let state = initialCallState();
  assert.equal(state.inCall, false);
  state = reduceCallState(state, { type: 'voice-channel', channelId: '123' });
  assert.equal(state.inCall, true);
  assert.equal(state.channelId, '123');
});

test('leaving the channel clears the call without touching authorization', () => {
  let state = initialCallState();
  state = reduceCallState(state, { type: 'authenticated' });
  state = reduceCallState(state, { type: 'voice-channel', channelId: 'abc' });
  state = reduceCallState(state, { type: 'voice-channel', channelId: null });
  assert.equal(state.inCall, false);
  assert.equal(state.channelId, null);
  assert.equal(state.authorized, true, 'leaving a call must not clear a stored authorization');
});

test('a disconnect mid-call drops the call state without replaying it on reconnect', () => {
  let state = initialCallState();
  state = reduceCallState(state, { type: 'authenticated' });
  state = reduceCallState(state, { type: 'voice-channel', channelId: 'abc' });
  state = reduceCallState(state, { type: 'disconnected' });
  assert.equal(state.inCall, false);
  assert.equal(state.channelId, null);
});

test('an unavailable Discord (not installed, RPC failure) grows backoff and never reports a call', () => {
  let state = initialCallState();
  const first = reduceCallState(state, { type: 'unavailable', reason: 'Discord is not running.' });
  assert.equal(first.inCall, false);
  assert.equal(first.phase, 'unavailable');
  assert.equal(first.error, 'Discord is not running.');
  const second = reduceCallState(first, { type: 'unavailable', reason: 'Discord is not running.' });
  assert.ok(second.backoffMs > first.backoffMs, 'repeated failures back off further');
});

test('backoff growth is bounded', () => {
  let state = initialCallState();
  for (let i = 0; i < 20; i++) state = reduceCallState(state, { type: 'unavailable', reason: 'x' });
  assert.ok(state.backoffMs <= 60000);
});

test('authorization failure clears authorized state and reports the reason', () => {
  let state = initialCallState();
  state = reduceCallState(state, { type: 'authenticated' });
  assert.equal(state.authorized, true);
  state = reduceCallState(state, { type: 'auth-failed', reason: 'Discord authorization expired.' });
  assert.equal(state.authorized, false);
  assert.equal(state.phase, 'unauthorized');
  assert.equal(state.error, 'Discord authorization expired.');
});

test('a successful reconnect resets backoff', () => {
  let state = initialCallState();
  state = reduceCallState(state, { type: 'unavailable', reason: 'x' });
  state = reduceCallState(state, { type: 'unavailable', reason: 'x' });
  assert.ok(state.backoffMs > 1000);
  state = reduceCallState(state, { type: 'reset-backoff' });
  assert.equal(state.backoffMs, 1000);
});
