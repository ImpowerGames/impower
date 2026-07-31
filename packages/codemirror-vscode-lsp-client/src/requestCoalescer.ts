/**
 * Collapses bursts of identical pull round-trips (didChange +
 * publishDiagnostics + workspace refresh listeners all triggering the same
 * feature request). While a pull for a (scope, key) is in flight, further
 * pulls just mark it dirty; when the in-flight one settles, at most one more
 * runs to pick up the latest server state. Net effect: a burst of N triggers
 * costs at most 2 round-trips instead of N, and the last one always reflects
 * the newest state.
 */
const pendingByScope = new WeakMap<object, Map<string, { rerun: boolean }>>();

export async function coalesceRequest(
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
    return;
  }
  const state = { rerun: false };
  pending.set(key, state);
  try {
    do {
      state.rerun = false;
      await run();
    } while (state.rerun);
  } finally {
    pending.delete(key);
  }
}
