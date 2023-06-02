import * as vscode from "vscode";

export const getEditor = (uri?: vscode.Uri): vscode.TextEditor | undefined => {
  if (!uri) {
    return undefined;
  }
  //search visible text editors
  for (let i = 0; i < vscode.window.visibleTextEditors.length; i++) {
    if (
      vscode.window.visibleTextEditors[i]?.document.uri.toString() ===
      uri.toString()
    ) {
      return vscode.window.visibleTextEditors[i];
    }
  }
  //the editor was not visible
  return undefined;
};
