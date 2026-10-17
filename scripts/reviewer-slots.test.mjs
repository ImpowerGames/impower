// The Windows identity probe reads a process caught mid-exit as absent (#2025).
// Get-Process can return such a process with a null StartTime, which used to
// throw InvokeMethodOnNull; the stand-in objects below take the place of that
// lookup rather than racing a real exit.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {windowsProcessIdentity} from './reviewer-slots.mjs';

const windows = {skip: process.platform !== 'win32' && 'PowerShell probe runs only on Windows'};

test('an exited process whose StartTime is null reads as absent', windows, () => {
  assert.equal(windowsProcessIdentity(1234, '[pscustomobject]@{StartTime=$null;HasExited=$true}'), null);
});

test('a null StartTime that never resolves stays unknown, not absent', windows, () => {
  // An access-denied process reads both getters as null; it is not absence.
  assert.throws(() => windowsProcessIdentity(1234, '[pscustomobject]@{StartTime=$null;HasExited=$null}'), /Process start identity unavailable/);
});

test('a process that finishes exiting on a later lookup reads as absent', windows, () => {
  const gone = '$(if($i -lt 2){[pscustomobject]@{StartTime=$null;HasExited=$false}}else{Get-Process -Id 2147483647 -ErrorAction Stop})';
  assert.equal(windowsProcessIdentity(1234, gone), null);
});

test('a live process still reports its start ticks', windows, () => {
  const ticks = '638727840000000000';
  const identity = windowsProcessIdentity(1234, `[pscustomobject]@{StartTime=[datetime]::new(${ticks}, 'Utc');HasExited=$false}`);
  assert.deepEqual(identity, {pid: 1234, start: ticks});
});

test('an unrecognized lookup error is still rethrown', windows, () => {
  assert.throws(() => windowsProcessIdentity(1234, '$(throw "unexpected")'), /unexpected/);
});
