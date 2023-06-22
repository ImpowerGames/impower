import { ExtensionContext, Uri } from "vscode";
import { LanguageClientOptions } from "vscode-languageclient";

import { LanguageClient } from "vscode-languageclient/browser";

export const createWorkerLanguageClient = (
  context: ExtensionContext,
  clientOptions: LanguageClientOptions
) => {
  // Create a worker. The worker main file implements the language server.
  const serverMain = Uri.joinPath(
    context.extensionUri,
    "out",
    "workers",
    "server.js"
  );
  const worker = new Worker(serverMain.toString(true));
  // create the language server client to communicate with the server running in the worker
  return new LanguageClient(
    "sparkdown-language-server",
    "Sparkdown Language Server",
    clientOptions,
    worker
  );
};
