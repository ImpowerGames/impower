import * as vscode from "vscode";
import { createSparkdownLanguageClient } from "./createSparkdownLanguageClient";

export const activateLanguageClient = (
  context: vscode.ExtensionContext
): void => {
  const client = createSparkdownLanguageClient(context);
  client.start();
  const dispose = () => client.stop();
  context.subscriptions.push({ dispose });
};
