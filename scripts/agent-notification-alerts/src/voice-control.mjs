import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function stateDirectory() {
  return process.env.AGENT_ALERT_STATE_DIR || join(homedir(), '.agent-notification-alerts');
}
function present(name) {
  return existsSync(join(stateDirectory(), name));
}

// discord-call-muted is written by the broker's Discord watcher, independent
// of the manual voice-muted marker: leaving a call or disabling the feature
// removes only this marker and never clears a manual mute.
export function voiceMuted() {
  return muted('voice-muted') || present('discord-call-muted');
}
export function lightsMuted() { return muted('lights-muted'); }
function muted(marker) {
  return present('all-muted') || present(marker);
}

// Default-on opt-out: absence of the marker means the behavior is enabled,
// so existing installations get it without any migration step.
export function discordAutoMuteEnabled() {
  return !present('discord-mute-disabled');
}
export function discordCallMutePath() {
  return join(stateDirectory(), 'discord-call-muted');
}
export function discordConnectRequestPath() {
  return join(stateDirectory(), 'discord-connect-request');
}
export function discordStatusPath() {
  return join(stateDirectory(), 'discord-status.json');
}
export function discordTokenPath() {
  return join(stateDirectory(), 'discord-token.json');
}
export function discordCredentialsPath() {
  return join(stateDirectory(), 'discord-credentials.json');
}
