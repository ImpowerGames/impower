import * as vscode from "vscode";

export async function getOpenTextDocument(uri?: vscode.Uri | string) {
  if (!uri) {
    return undefined;
  }
  const uriString = typeof uri === "string" ? uri : uri.toString();
  for (const textDocument of vscode.workspace.textDocuments) {
    if (textDocument.uri.toString() === uriString) {
      return textDocument;
    }
  }
  const tabs = vscode.window.tabGroups.all.flatMap((group) => group.tabs);
  const textDocumentUris = tabs
    .map((tab) => tab.input)
    .filter(
      (input): input is vscode.TabInputText =>
        input instanceof vscode.TabInputText
    )
    .map((input) => input.uri);
  for (const textDocumentUri of textDocumentUris) {
    if (textDocumentUri.toString() === uriString) {
      return await vscode.workspace.openTextDocument(textDocumentUri);
    }
  }
  return undefined;
}
