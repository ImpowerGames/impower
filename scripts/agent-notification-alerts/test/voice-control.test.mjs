import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { speak } from '../src/alerts.mjs';
import { voiceMuted, lightsMuted } from '../src/voice-control.mjs';

test('saved mute suppresses speech before any speech engine starts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'alert-mute-'));
  const previous = process.env.AGENT_ALERT_STATE_DIR;
  process.env.AGENT_ALERT_STATE_DIR = directory;
  try {
    assert.equal(voiceMuted(), false);
    await writeFile(join(directory, 'voice-muted'), '');
    assert.equal(await speak({ message: 'Must not be spoken' }, {}), 'Voice muted.');
    await unlink(join(directory, 'voice-muted'));
    assert.equal(voiceMuted(), false);
    await writeFile(join(directory, 'lights-muted'), '');
    assert.equal(lightsMuted(), true);
    assert.equal(voiceMuted(), false);
    await writeFile(join(directory, 'all-muted'), '');
    assert.equal(voiceMuted(), true);
    assert.equal(lightsMuted(), true);
    await unlink(join(directory, 'all-muted'));
    assert.equal(voiceMuted(), false);
    assert.equal(lightsMuted(), true, 'resuming all preserves the individual lights setting');
    await unlink(join(directory, 'lights-muted'));
  } finally {
    if (previous === undefined) delete process.env.AGENT_ALERT_STATE_DIR;
    else process.env.AGENT_ALERT_STATE_DIR = previous;
    await rmdir(directory);
  }
});
