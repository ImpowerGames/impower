import {
  ExportPDFMessage,
  type ExportPDFResult,
} from "@impower/spark-editor-protocol/src/protocols/workspace/ExportPDFMessage";
import { loadFallbackFonts } from "@impower/sparkdown-screenplay-pdf/src/utils/loadFallbackFonts";
import { unprintableNotice } from "@impower/sparkdown-screenplay-pdf/src/utils/unprintableNotice";
import * as vscode from "vscode";
import { SparkdownCommandTreeDataProvider } from "../providers/SparkdownCommandTreeDataProvider";
import { getActiveSparkdownDocument } from "./getActiveSparkdownDocument";
import { fetchFallbackFont } from "./fetchFallbackFont";
import { getEditor } from "./getEditor";
import { getFonts as getDefaultScreenplayFonts } from "./getDefaultScreenplayFonts";
import { getSparkdownPreviewConfig } from "./getSparkdownPreviewConfig";
import { getSyncOrExportPath } from "./getSyncOrExportPath";
import { writeFile } from "./writeFile";
import { getWorkspaceRelativePath } from "./getWorkspaceRelativePath";
import { updateCommands } from "./updateCommands";

export const exportPdf = async (
  context: vscode.ExtensionContext,
  worker: Worker,
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
        scriptFilePattern,
      );
      const fontWorkspaceRelativePath = getWorkspaceRelativePath(
        uri,
        fontFilePattern,
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
              vscode.workspace.findFiles(pattern),
            ),
          );
        if (workspaceScriptFileUris) {
          scriptFileUris = workspaceScriptFileUris.filter(
            (fileUri) => !fileUri.path.endsWith(".luau"),
          );
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
          }),
        ),
        Promise.all(
          (fontFileUris || []).map(
            async (fileUri): Promise<[string, ArrayBuffer]> => {
              const array = await vscode.workspace.fs.readFile(fileUri);
              const arrayBuffer = array.buffer.slice(
                array.byteOffset,
                array.byteLength + array.byteOffset,
              ) as ArrayBuffer;
              const filename =
                fileUri.toString().split("/").at(-1)?.split(".")[0] || "";
              return [filename, arrayBuffer];
            },
          ),
        ),
      ]);
      const config = getSparkdownPreviewConfig(uri);
      let currentPercentage = 0;
      const [defaultFonts, fallbackFonts] = await Promise.all([
        getDefaultScreenplayFonts(context),
        loadFallbackFonts(scriptFiles, (url) => fetchFallbackFont(context, url)),
      ]);
      const userFonts: {
        [name: string]: ArrayBuffer;
      } = {};
      for (const [fontName, fontBuffer] of fontFiles) {
        userFonts[fontName] = fontBuffer;
      }
      const exported = await new Promise<ExportPDFResult>((resolve, reject) => {
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
          fallbackFonts,
          workDoneToken: crypto.randomUUID(),
        });
        worker.postMessage(request, [
          ...Object.values(defaultFonts),
          ...fallbackFonts.flatMap((family) =>
            family.bold ? [family.normal, family.bold] : [family.normal],
          ),
        ]);
      });
      if (token.isCancellationRequested) {
        return;
      }
      await writeFile(fsPath, exported.pdf);
      updateCommands(uri);
      if (exported.unprintable.length > 0) {
        void vscode.window.showWarningMessage(
          unprintableNotice(exported.unprintable),
        );
      }
    },
  );
  SparkdownCommandTreeDataProvider.instance.notifyExportEnded("pdf");
};
