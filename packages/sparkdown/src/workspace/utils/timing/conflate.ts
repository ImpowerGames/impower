export function conflate<R, F extends (...args: any[]) => R>(fn: F) {
  let running = false;
  let inFlight: Promise<R> | null = null;
  let pendingArgs: Parameters<F>;
  let hasPending = false;

  let nextWaiters: {
    resolve: (result: R) => void;
    reject: (error?: unknown) => void;
  }[] = [];

  const startRun = (
    resolveGroup:
      | {
          resolve: (result: R) => void;
          reject: (error?: unknown) => void;
        }[]
      | undefined,
    ...args: Parameters<F>
  ) => {
    running = true;
    const p = (async () => fn(...args))()
      .then((res) => {
        resolveGroup?.forEach((w: { resolve: (result: R) => void }) =>
          w.resolve(res)
        );
        return res;
      })
      .catch((err) => {
        resolveGroup?.forEach((w: { reject: (error: unknown) => unknown }) =>
          w.reject(err)
        );
        throw err;
      });

    inFlight = p.finally(() => {
      if (hasPending) {
        const nextArgs = pendingArgs;
        hasPending = false;
        const wg = nextWaiters;
        nextWaiters = [];
        return startRun(wg, ...nextArgs);
      } else {
        running = false;
        inFlight = null;
        return;
      }
    });

    return p;
  };

  return (...args: Parameters<F>) => {
    if (!running) {
      return startRun(undefined, ...args);
    }
    pendingArgs = args;
    hasPending = true;
    return new Promise((resolve, reject) =>
      nextWaiters.push({ resolve, reject })
    );
  };
}
