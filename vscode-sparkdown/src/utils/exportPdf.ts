import { ExportPDFMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/ExportPDFMessage";
import * as vscode from "vscode";
import { ScreenplaySparkParser } from "../classes/ScreenplaySparkParser";
import { SparkdownCommandTreeDataProvider } from "../providers/SparkdownCommandTreeDataProvider";
import { getActiveSparkdownDocument } from "./getActiveSparkdownDocument";
import { getEditor } from "./getEditor";
import { getSparkdownPreviewConfig } from "./getSparkdownPreviewConfig";
import { getSyncOrExportPath } from "./getSyncOrExportPath";
import { writeFile } from "./writeFile";

export const exportPdf = async (worker: Worker): Promise<void> => {
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
      const sparkdown = editor.document.getText();
      const program = ScreenplaySparkParser.instance.parse(sparkdown);
      const config = getSparkdownPreviewConfig(uri);
      let currentPercentage = 0;
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
          programs: [program],
          config,
          workDoneToken: crypto.randomUUID(),
        });
        worker.postMessage(request);
      });
      if (token.isCancellationRequested) {
        return;
      }
      await writeFile(fsPath, pdfBuffer);
    }
  );
  SparkdownCommandTreeDataProvider.instance.notifyExportEnded("pdf");
};
