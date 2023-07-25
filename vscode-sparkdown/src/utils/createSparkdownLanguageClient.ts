import * as vscode from "vscode";
import { LanguageClientOptions } from "vscode-languageclient";
import { LanguageClient } from "vscode-languageclient/browser";

export const createSparkdownLanguageClient = async (
  context: vscode.ExtensionContext,
  clientOptions: LanguageClientOptions = {}
) => {
  const serverMain = vscode.Uri.joinPath(
    context.extensionUri,
    "out",
    "workers",
    "sparkdown-language-server.js"
  );
  const serverMainUrl = serverMain.toString(true);
  const worker = new Worker(serverMainUrl);
  return new LanguageClient(
    "sparkdown-language-server",
    "Sparkdown Language Server",
    {
      documentSelector: [{ language: "sparkdown" }],
      ...clientOptions,
    },
    worker
  );
};
