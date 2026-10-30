import { LSPClient, RequestTimeoutError } from "./client";

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
