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
