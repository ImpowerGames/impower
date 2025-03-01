import { ExportPDFMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/ExportPDFMessage";
import * as vscode from "vscode";
import { SparkdownCommandTreeDataProvider } from "../providers/SparkdownCommandTreeDataProvider";
import { getActiveSparkdownDocument } from "./getActiveSparkdownDocument";
import { getEditor } from "./getEditor";
import { getFonts as getDefaultScreenplayFonts } from "./getDefaultScreenplayFonts";
import { getSparkdownPreviewConfig } from "./getSparkdownPreviewConfig";
import { getSyncOrExportPath } from "./getSyncOrExportPath";
import { writeFile } from "./writeFile";
import { getWorkspaceRelativePath } from "./getWorkspaceRelativePath";
import { updateCommands } from "./updateCommands";

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
      const sparkdownConfig = vscode.workspace.getConfiguration("sparkdown");
      const scriptFilePattern = sparkdownConfig["scriptFiles"];
      const fontFilePattern = sparkdownConfig["fontFiles"];
      const scriptWorkspaceRelativePath = getWorkspaceRelativePath(
        uri,
        scriptFilePattern
      );
      const fontWorkspaceRelativePath = getWorkspaceRelativePath(
        uri,
        fontFilePattern
      );

      let scriptFileUris: vscode.Uri[] = [uri];
      let fontFileUris: vscode.Uri[] = [];
      if (
        scriptWorkspaceRelativePath?.pattern &&
        fontWorkspaceRelativePath?.pattern
      ) {
        const workspaceFilePatterns = [
          scriptWorkspaceRelativePath.pattern,
          fontWorkspaceRelativePath.pattern,
        ];
        let [workspaceScriptFileUris, workspaceFontFileUrls] =
          await Promise.all(
            workspaceFilePatterns.map((pattern) =>
              vscode.workspace.findFiles(pattern)
            )
          );
        if (workspaceScriptFileUris) {
          scriptFileUris = workspaceScriptFileUris;
        }
        if (workspaceFontFileUrls) {
          fontFileUris = workspaceFontFileUrls;
        }
      }
      const [scriptFiles, fontFiles] = await Promise.all([
        Promise.all(
          (scriptFileUris || []).map(async (fileUri) => {
            const buffer = await vscode.workspace.fs.readFile(fileUri);
            const text = Buffer.from(buffer).toString("utf8");
            return text;
          })
        ),
        Promise.all(
          (fontFileUris || []).map(
            async (fileUri): Promise<[string, ArrayBuffer]> => {
              const array = await vscode.workspace.fs.readFile(fileUri);
              const arrayBuffer = array.buffer.slice(
                array.byteOffset,
                array.byteLength + array.byteOffset
              ) as ArrayBuffer;
              const filename =
                fileUri.toString().split("/").at(-1)?.split(".")[0] || "";
              return [filename, arrayBuffer];
            }
          )
        ),
      ]);
      const config = getSparkdownPreviewConfig(uri);
      let currentPercentage = 0;
      const defaultFonts = await getDefaultScreenplayFonts(context);
      const userFonts: {
        [name: string]: ArrayBuffer;
      } = {};
      for (const [fontName, fontBuffer] of fontFiles) {
        userFonts[fontName] = fontBuffer;
      }
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
          scripts: scriptFiles,
          config,
          fonts: { ...defaultFonts, ...userFonts },
          workDoneToken: crypto.randomUUID(),
        });
        worker.postMessage(request, Object.values(defaultFonts));
      });
      if (token.isCancellationRequested) {
        return;
      }
      await writeFile(fsPath, pdfBuffer);
      updateCommands(uri);
    }
  );
  SparkdownCommandTreeDataProvider.instance.notifyExportEnded("pdf");
};
