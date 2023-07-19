import * as vscode from "vscode";
import { SparkdownStatusBarManager } from "../providers/SparkdownStatusBarManager";

export const activateDurationStatus = (
  context: vscode.ExtensionContext
): void => {
  context.subscriptions.push(
    SparkdownStatusBarManager.instance.showStatusBarItem()
  );
};
