import * as vscode from "vscode";
import { ScreenplaySparkParser } from "../classes/ScreenplaySparkParser";
import { createPdf } from "../pdf/pdf";
import { getActiveSparkdownDocument } from "./getActiveSparkdownDocument";
import { getEditor } from "./getEditor";
import { getSparkdownConfig } from "./getSparkdownConfig";
import { getSyncOrExportPath } from "./getSyncOrExportPath";

export const exportPdf = async (
  context: vscode.ExtensionContext
): Promise<void> => {
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

  const fsPath = await getSyncOrExportPath(editor, "pdf");
  if (!fsPath) {
    return;
  }
  const sparkdown = editor.document.getText();
  const result = ScreenplaySparkParser.instance.parse(sparkdown);

  const config = getSparkdownConfig(uri);

  vscode.window.withProgress(
    {
      title: "Exporting PDF...",
      location: vscode.ProgressLocation.Notification,
    },
    async (progress) => {
      if (fsPath) {
        createPdf(context, fsPath, config, result, progress);
      }
    }
  );
};
