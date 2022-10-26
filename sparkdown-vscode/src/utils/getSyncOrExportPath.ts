import * as vscode from "vscode";

export const getSyncOrExportPath = async (
  editor: vscode.TextEditor,
  extension: string
): Promise<string> => {
  let filename = editor.document.fileName.replace(/(\.[^.]*)$/, "");
  filename += `.${extension}`;
  const saveUri = vscode.Uri.file(filename);
  let fsPath = "";
  try {
    await vscode.workspace.fs.stat(saveUri);
    fsPath = saveUri?.fsPath;
  } catch {
    fsPath =
      (
        await vscode.window.showSaveDialog({
          filters: { [`${extension.toUpperCase()} File`]: [extension] },
          defaultUri: saveUri,
        })
      )?.fsPath || "";
  }
  return fsPath;
};
