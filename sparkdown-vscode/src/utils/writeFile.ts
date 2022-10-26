import * as path from "path";
import * as vscode from "vscode";
import { openFile } from "./openFile";
import { revealFile } from "./revealFile";

export const writeFile = (fsPath: string, output: string) => {
  const ext = path.extname(fsPath)?.replace(".", "");
  vscode.workspace.fs
    .writeFile(vscode.Uri.file(fsPath), Buffer.from(output))
    .then(
      () => {
        const open = "Open";
        let reveal = "Reveal in File Explorer";
        if (process.platform === "darwin") {
          reveal = "Reveal in Finder";
        }
        vscode.window
          .showInformationMessage(
            `Exported ${ext?.toUpperCase()} Successfully!`,
            open,
            reveal
          )
          .then((val) => {
            switch (val) {
              case open: {
                openFile(fsPath);
                break;
              }
              case reveal: {
                revealFile(fsPath);
                break;
              }
            }
          });
      },
      (err) => {
        vscode.window.showErrorMessage(
          `Failed to export ${ext?.toUpperCase()}: ` + err.message
        );
      }
    );
};
