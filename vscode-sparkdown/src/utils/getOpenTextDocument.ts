import * as vscode from "vscode";

export async function getOpenTextDocument(uri: vscode.Uri) {
  for (const textDocument of vscode.workspace.textDocuments) {
    if (textDocument.uri.toString() === uri.toString()) {
      return textDocument;
    }
  }
  return await vscode.workspace.openTextDocument(uri);
}
