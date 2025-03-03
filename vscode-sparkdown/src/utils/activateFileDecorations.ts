import * as vscode from "vscode";
import { SparkdownFileDecorationProvider } from "../providers/SparkdownFileDecorationProvider";

export const activateFileDecorations = (
  context: vscode.ExtensionContext
): void => {
  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider(
      SparkdownFileDecorationProvider.instance
    )
  );
};
