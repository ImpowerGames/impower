import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function stateDirectory() {
  return process.env.AGENT_ALERT_STATE_DIR || join(homedir(), '.agent-notification-alerts');
}
function present(name) {
  return existsSync(join(stateDirectory(), name));
}

export function voiceMuted() {
  return muted('voice-muted') || present('discord-call-muted');
}
export function lightsMuted() { return muted('lights-muted'); }
function muted(marker) {
  return present('all-muted') || present(marker);
}

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
