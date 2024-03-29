import * as vscode from "vscode";
import { SparkdownCheatSheetWebviewViewProvider } from "../providers/SparkdownCheatSheetViewProvider";

export const activateCheatSheetView = (
  context: vscode.ExtensionContext
): void => {
  // Register Cheat Sheet view
  vscode.window.registerWebviewViewProvider(
    "sparkdown-cheatsheet",
    new SparkdownCheatSheetWebviewViewProvider(context.extensionUri)
  );
};
