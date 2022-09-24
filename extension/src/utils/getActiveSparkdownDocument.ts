import * as vscode from "vscode";
import { previews } from "../providers/Preview";

/**
 * Get the relevant sparkdown document for the currently selected preview or text editor
 */
export const getActiveSparkdownDocument = (): vscode.Uri | undefined => {
  //first check if any previews have focus
  for (let i = 0; i < previews.length; i++) {
    if (previews[i].panel.active) {
      return vscode.Uri.parse(previews[i].uri);
    }
  }
  //no previews were active, is activeTextEditor a sparkdown document?
  if (
    vscode.window.activeTextEditor !== undefined &&
    vscode.window.activeTextEditor.document.languageId === "sparkdown"
  ) {
    return vscode.window.activeTextEditor.document.uri;
  }
  //As a last resort, check if there are any visible sparkdown text editors
  for (let i = 0; i < vscode.window.visibleTextEditors.length; i++) {
    if (
      vscode.window.visibleTextEditors[i].document.languageId === "sparkdown"
    ) {
      return vscode.window.visibleTextEditors[i].document.uri;
    }
  }
  //all hope is lost
  return undefined;
};
