import * as vscode from "vscode";

export const getActiveOrVisibleEditor = (language = "sparkdown") => {
  if (vscode.window.activeTextEditor) {
    const editor = vscode.window.activeTextEditor;
    if (!language || editor.document.languageId === language) {
      return editor;
    }
  }
  for (let i = 0; i < vscode.window.visibleTextEditors.length; i++) {
    const editor = vscode.window.visibleTextEditors[i];
    if (!language || editor?.document.languageId === language) {
      return editor;
    }
  }
  return undefined;
};
