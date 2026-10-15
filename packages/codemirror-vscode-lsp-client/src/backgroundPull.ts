import { LSPClient, RequestTimeoutError } from "./client";

/**
 * Runs a pull the editor starts on its own (on open, on change, on a
 * publish or a server refresh) rather than one a user action awaits. Nobody
 * awaits it, so a failure must end here instead of as an uncaught rejection.
 *
 * A pull that times out is asked again while the document is still at the
 * version it pulled: on a cold start the server answers a document's first
 * pulls only once its compiler is ready, which can take longer than the
 * request timeout, and the late answer to the timed-out request is dropped.
 * Without asking again the document keeps no result until something else
 * happens to pull it (#1785). Once the document has moved on, the change
 * that moved it pulled again, so a busy server is not sent the stale pull
 * a second time.
 */
export function pullInBackground(
  client: LSPClient,
  uri: string,
  pull: () => Promise<unknown>,
  attempts = 3,
): void {
  const version = client.workspace.getFile(uri)?.version;
  pull().catch((err) => {
    if (err instanceof RequestTimeoutError) {
      if (client.workspace.getFile(uri)?.version !== version) {
        return;
      }
      if (attempts > 1) {
        pullInBackground(client, uri, pull, attempts - 1);
      } else {
        console.warn("LSP pull still unanswered after retrying:", err);
      }
      return;
    }
    console.error("LSP pull failed:", err);
  });
}
