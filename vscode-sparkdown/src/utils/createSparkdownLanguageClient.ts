import { ExtensionContext, Uri } from "vscode";
import { LanguageClientOptions } from "vscode-languageclient";

import { LanguageClient } from "vscode-languageclient/browser";

export const createSparkdownLanguageClient = (
  context: ExtensionContext,
  clientOptions?: LanguageClientOptions
) => {
  const serverMain = Uri.joinPath(
    context.extensionUri,
    "out",
    "workers",
    "sparkdown-language-server.js"
  );
  const worker = new Worker(serverMain.toString(true));
  return new LanguageClient(
    "sparkdown-language-server",
    "Sparkdown Language Server",
    {
      documentSelector: [{ language: "sparkdown" }],
      ...(clientOptions || {}),
    },
    worker
  );
};
