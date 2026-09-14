// Pure reducer for Discord voice-call detection: no sockets, no filesystem.
// The IO shell in discord-voice.mjs feeds it events and reacts to the result,
// which keeps the actual call-detection rules unit-testable on their own.
export function initialCallState() {
  return {
    phase: 'disconnected',
    channelId: null,
    inCall: false,
    authorized: false,
    backoffMs: 1000,
    error: null,
  };
}

const MAX_BACKOFF_MS = 60000;

export function reduceCallState(state, event) {
  switch (event.type) {
    case 'connecting':
      return { ...state, phase: 'connecting', error: null };
    // Any selected voice channel counts as a call: self-muted, deafened,
    // alone, or listening-only connections are all still a channel selection.
    case 'voice-channel':
      return { ...state, channelId: event.channelId, inCall: event.channelId != null };
    case 'handshake':
      return { ...state, phase: 'unauthorized', error: null };
    case 'authorize-requested':
      return { ...state, phase: 'authorizing', error: null };
    case 'authenticate-attempt':
      return { ...state, phase: 'authenticating', error: null };
    case 'authenticated':
      return { ...state, phase: 'ready', authorized: true, error: null };
    case 'auth-failed':
      return {
        ...state,
        phase: 'unauthorized',
        authorized: false,
        inCall: false,
        channelId: null,
        error: event.reason ?? 'Discord authorization expired.',
      };
    case 'disconnected':
      return { ...state, phase: 'disconnected', inCall: false, channelId: null };
    // Fail-open: an unavailable Discord (not installed, not running, RPC
    // failure) never reports a call and backs off before retrying.
    case 'unavailable':
      return {
        ...initialCallState(),
        authorized: state.authorized,
        phase: 'unavailable',
        error: event.reason ?? null,
        backoffMs: Math.min((state.backoffMs || 1000) * 2, MAX_BACKOFF_MS),
      };
    case 'reset-backoff':
      return { ...state, backoffMs: 1000 };
    default:
      return state;
  }
}
