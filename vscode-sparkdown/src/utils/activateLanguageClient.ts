import * as vscode from "vscode";
import { createWorkerLanguageClient } from "./createWorkerLanguageClient";

export const activateLanguageClient = (
  context: vscode.ExtensionContext
): void => {
  const client = createWorkerLanguageClient(context, {
    documentSelector: [{ language: "sparkdown" }],
    synchronize: {},
    initializationOptions: {},
  });
  client.start();
  const dispose = () => client.stop();
  context.subscriptions.push({ dispose });
};
