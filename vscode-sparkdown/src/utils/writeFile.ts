import * as path from "path";
import * as vscode from "vscode";

export const writeFile = async (
  fsPath: string,
  output: string | Uint8Array | ArrayBuffer
): Promise<void> => {
  const ext = path.extname(fsPath)?.replace(".", "");
  try {
    const fileUri = vscode.Uri.file(fsPath);
    await vscode.workspace.fs.writeFile(
      fileUri,
      typeof output === "string"
        ? Buffer.from(output)
        : output instanceof Uint8Array
        ? output
        : new Uint8Array(output)
    );
    const items = ["OK"];
    vscode.window.showInformationMessage(
      `Exported ${ext?.toUpperCase()} Successfully!`,
      ...items
    );
  } catch (e) {
    const error = e as { message?: string };
    vscode.window.showErrorMessage(
      `Failed to export ${ext?.toUpperCase()}: ` +
        (error?.message || error || "")
    );
  }
};
