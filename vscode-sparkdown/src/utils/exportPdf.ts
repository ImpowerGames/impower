import { ExportPDFMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/ExportPDFMessage";
import * as vscode from "vscode";
import { SparkdownCommandTreeDataProvider } from "../providers/SparkdownCommandTreeDataProvider";
import { getActiveSparkdownDocument } from "./getActiveSparkdownDocument";
import { getEditor } from "./getEditor";
import { getFonts } from "./getFonts";
import { getSparkdownPreviewConfig } from "./getSparkdownPreviewConfig";
import { getSyncOrExportPath } from "./getSyncOrExportPath";
import { writeFile } from "./writeFile";

export const exportPdf = async (
  context: vscode.ExtensionContext,
  worker: Worker
): Promise<void> => {
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
  SparkdownCommandTreeDataProvider.instance.notifyExportStarted("pdf");
  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Exporting PDF",
      cancellable: true,
    },
    async (progress, token) => {
      // TODO: include all scripts relative to main.sd
      const script = editor.document.getText();
      const config = getSparkdownPreviewConfig(uri);
      let currentPercentage = 0;
      const fonts = await getFonts(context);
      const pdfBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        worker.onmessage = (e) => {
          if (!token.isCancellationRequested) {
            const message = e.data;
            if (message.method?.endsWith("/progress")) {
              const value = message.params.value;
              const increment = value.percentage - currentPercentage;
              progress.report({ increment });
              currentPercentage += increment;
            } else if (message.result) {
              resolve(message.result);
            } else if (message.error) {
              reject();
            }
          }
        };
        const request = ExportPDFMessage.type.request({
          scripts: [script],
          config,
          fonts,
          workDoneToken: crypto.randomUUID(),
        });
        worker.postMessage(request, [
          fonts.normal,
          fonts.bold,
          fonts.italic,
          fonts.bolditalic,
        ]);
      });
      if (token.isCancellationRequested) {
        return;
      }
      await writeFile(fsPath, pdfBuffer);
    }
  );
  SparkdownCommandTreeDataProvider.instance.notifyExportEnded("pdf");
};
