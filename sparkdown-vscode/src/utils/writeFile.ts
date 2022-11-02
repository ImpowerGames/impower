import * as path from "path";
import * as vscode from "vscode";
import { openFile } from "./openFile";
import { revealFile } from "./revealFile";

export const writeFile = async (
  fsPath: string,
  output: string | Uint8Array
): Promise<void> => {
  const ext = path.extname(fsPath)?.replace(".", "");
  try {
    await vscode.workspace.fs.writeFile(
      vscode.Uri.file(fsPath),
      typeof output === "string" ? Buffer.from(output) : output
    );
    const open = "Open";
    let reveal = "Reveal in File Explorer";
    if (process.platform === "darwin") {
      reveal = "Reveal in Finder";
    }
    const exec = require("child_process").exec;
    const items = exec ? [open, reveal] : ["OK"];
    const val = await vscode.window.showInformationMessage(
      `Exported ${ext?.toUpperCase()} Successfully!`,
      ...items
    );
    switch (val) {
      case open: {
        openFile(fsPath);
        break;
      }
      case reveal: {
        revealFile(fsPath);
        break;
      }
      default:
        // NoOp
        break;
    }
  } catch (e) {
    const error = e as { message?: string };
    vscode.window.showErrorMessage(
      `Failed to export ${ext?.toUpperCase()}: ` +
        (error?.message || error || "")
    );
  }
};
