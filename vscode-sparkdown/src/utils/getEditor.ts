import * as vscode from "vscode";

export const getEditor = (
  uri?: vscode.Uri | string
): vscode.TextEditor | undefined => {
  if (!uri) {
    return undefined;
  }
  const uriString = typeof uri === "string" ? uri : uri.toString();
  if (vscode.window.activeTextEditor?.document.uri.toString() === uriString) {
    return vscode.window.activeTextEditor;
  }
  for (let i = 0; i < vscode.window.visibleTextEditors.length; i++) {
    if (
      vscode.window.visibleTextEditors[i]?.document.uri.toString() === uriString
    ) {
      return vscode.window.visibleTextEditors[i];
    }
  }
  return undefined;
};
