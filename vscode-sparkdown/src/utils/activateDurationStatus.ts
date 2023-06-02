import * as vscode from "vscode";
import { statusState } from "../state/statusState";

export const activateDurationStatus = (
  context: vscode.ExtensionContext
): void => {
  // Register for line duration length
  statusState.durationStatus = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  context.subscriptions.push(statusState.durationStatus);
};
