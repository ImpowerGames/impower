/**
 * Collapses bursts of identical pull round-trips (didChange +
 * publishDiagnostics + workspace refresh listeners all triggering the same
 * feature request). While a pull for a (scope, key) is in flight, further
 * pulls just mark it dirty; when the in-flight one settles, at most one more
 * runs to pick up the latest server state. Net effect: a burst of N triggers
 * costs at most 2 round-trips instead of N, and the last one always reflects
 * the newest state.
 *
 * Every caller of a burst gets the burst's outcome: a caller that only marked
 * the pull dirty settles when the pull it asked for does, and sees its
 * failure, so a timed-out re-pull can still be asked again (#1785).
 */
const pendingByScope = new WeakMap<
  object,
  Map<string, { rerun: boolean; done: Promise<void> }>
>();

export function coalesceRequest(
  scope: object,
  key: string,
  run: () => Promise<void>,
): Promise<void> {
  let pending = pendingByScope.get(scope);
  if (!pending) {
    pending = new Map();
    pendingByScope.set(scope, pending);
  }
  const inFlight = pending.get(key);
  if (inFlight) {
    inFlight.rerun = true;
    return inFlight.done;
  }
  const state = { rerun: false, done: Promise.resolve() };
  pending.set(key, state);
  state.done = (async () => {
    try {
      do {
        state.rerun = false;
        try {
          await run();
        } catch (err) {
          // A pull asked for while this one was in flight (a refresh once
          // the server is ready, say) still runs when this one fails.
          if (!state.rerun) throw err;
        }
      } while (state.rerun);
    } finally {
      pending.delete(key);
    }
  })();
  return state.done;
}
