import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function voiceMuted() {
  return muted('voice-muted');
}
export function lightsMuted() { return muted('lights-muted'); }
function muted(marker) {
  const directory = process.env.AGENT_ALERT_STATE_DIR || join(homedir(), '.agent-notification-alerts');
  return existsSync(join(directory, 'all-muted')) || existsSync(join(directory, marker));
}
