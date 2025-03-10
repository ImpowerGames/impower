import * as vscode from "vscode";
import { SparkdownStatusBarManager } from "../managers/SparkdownStatusBarManager";

export const activateDurationStatus = (
  context: vscode.ExtensionContext
): void => {
  context.subscriptions.push(
    SparkdownStatusBarManager.instance.showStatusBarItem()
  );
};
