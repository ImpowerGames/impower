import { RequestTimeoutError } from "./client";

/**
 * Runs a pull the editor starts on its own (on open, on change, on a
 * publish or a server refresh) rather than one a user action awaits. Nobody
 * awaits it, so a failure must end here instead of as an uncaught rejection.
 *
 * A pull that times out is asked again: on a cold start the server answers a
 * document's first pulls only once its compiler is ready, which can take
 * longer than the request timeout, and the late answer to the timed-out
 * request is dropped. Without asking again the document keeps no result
 * until something else happens to pull it (#1785).
 */
export function pullInBackground(
  pull: () => Promise<unknown>,
  attempts = 3,
): void {
  pull().catch((err) => {
    if (err instanceof RequestTimeoutError) {
      if (attempts > 1) {
        pullInBackground(pull, attempts - 1);
      } else {
        console.warn("LSP pull still unanswered after retrying:", err);
      }
      return;
    }
    console.error("LSP pull failed:", err);
  });
}
