import * as vscode from "vscode";

export async function getOpenTextDocument(uri: vscode.Uri | string) {
  for (const textDocument of vscode.workspace.textDocuments) {
    if (textDocument.uri.toString() === uri.toString()) {
      return textDocument;
    }
  }
  try {
    return await vscode.workspace.openTextDocument(
      typeof uri === "string" ? vscode.Uri.parse(uri) : uri,
    );
  } catch {
    return null;
  }
}
