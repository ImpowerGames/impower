import { profile } from "./profile";

/**
 * Run `fn` bracketed by a profiler phase, ending the phase on every exit path.
 *
 * Hand-written `profile("start", …)` / `profile("end", …)` pairs only close the
 * phase on the happy path: a throw between them leaves the phase open and it
 * never produces a measurement — losing exactly the requests worth looking at.
 * None of the LSP handlers had a `try/finally`.
 *
 * Most of the wrapped bodies are synchronous; `onCompletionResolve` is the one
 * that awaits inside its phase. A returned promise is handled explicitly rather
 * than by a bare `finally`, so the phase covers the whole settle rather than
 * just the synchronous call that produced it.
 */
export const profiled = <T>(
  method: string,
  uri: string | undefined,
  fn: () => T,
): T => {
  profile("start", method, uri);
  let deferred = false;
  try {
    const result = fn();
    // Gate on `then` alone and adopt with `Promise.resolve`. A bare
    // `PromiseLike` — which is how vscode-jsonrpc types handler returns —
    // declares only `then`, and requiring `finally` too would silently route it
    // down the synchronous path and measure ~0ms.
    if (result && typeof (result as { then?: unknown }).then === "function") {
      const settled = Promise.resolve(result).finally(() => {
        profile("end", method, uri);
      });
      // Only hand the phase over once `finally` has actually been attached —
      // a non-native thenable whose `finally` throws would otherwise leave the
      // phase open, which is the failure this helper exists to prevent.
      deferred = true;
      return settled as T;
    }
    return result;
  } finally {
    if (!deferred) {
      profile("end", method, uri);
    }
  }
};
