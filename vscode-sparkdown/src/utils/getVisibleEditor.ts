import * as vscode from "vscode";

export const getVisibleEditor = (
  uri?: vscode.Uri
): vscode.TextEditor | undefined => {
  if (!uri) {
    return undefined;
  }
  if (
    vscode.window.activeTextEditor?.document.uri.toString() === uri.toString()
  ) {
    return vscode.window.activeTextEditor;
  }
  for (let i = 0; i < vscode.window.visibleTextEditors.length; i++) {
    if (
      vscode.window.visibleTextEditors[i]?.document.uri.toString() ===
      uri.toString()
    ) {
      return vscode.window.visibleTextEditors[i];
    }
  }
  return undefined;
};
