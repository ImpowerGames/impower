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
          if (!state.rerun) throw err;
        }
      } while (state.rerun);
    } finally {
      pending.delete(key);
    }
  })();
  return state.done;
}
