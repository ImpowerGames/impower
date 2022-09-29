import * as vscode from "vscode";
import { parseSpark } from "../../../sparkdown";
import { createPdf } from "../pdf/pdf";
import { getActiveSparkdownDocument } from "./getActiveSparkdownDocument";
import { getEditor } from "./getEditor";
import { getSparkdownConfig } from "./getSparkdownConfig";
import { openFile } from "./openFile";

export async function exportPdf(showSaveDialog = true, openFileOnSave = false) {
  const canceled = false;
  if (canceled) {
    return;
  }

  const uri = getActiveSparkdownDocument();
  if (!uri) {
    return;
  }

  const editor = getEditor(uri);
  if (!editor) {
    return;
  }

  const config = getSparkdownConfig(uri);

  const parsed = parseSpark(editor.document.getText(), undefined, {
    removeBlockComments: true,
    skipTokens: ["condition"],
  });

  let filename = editor.document.fileName.replace(
    /(\.(sparkdown|sd|md|txt))$/,
    ""
  );
  filename += ".pdf";

  const saveUri = vscode.Uri.file(filename);
  let filepath: vscode.Uri | undefined;
  if (showSaveDialog) {
    filepath = await vscode.window.showSaveDialog({
      filters: { "PDF File": ["pdf"] },
      defaultUri: saveUri,
    });
  } else {
    filepath = saveUri;
  }
  if (filepath === undefined) {
    return;
  }
  vscode.window.withProgress(
    {
      title: "Exporting PDF...",
      location: vscode.ProgressLocation.Notification,
    },
    async (progress) => {
      if (filepath) {
        createPdf(filepath.fsPath, config, parsed, progress);
      }
    }
  );
  if (openFileOnSave) {
    openFile(filepath.fsPath);
  }
}
