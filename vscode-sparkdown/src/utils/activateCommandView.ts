import * as vscode from "vscode";
import { SparkdownCommandFileDecorationProvider } from "../providers/SparkdownCommandFileDecorationProvider";
import { SparkdownCommandTreeDataProvider } from "../providers/SparkdownCommandTreeDataProvider";
import { exportCsv } from "./exportCsv";
import { exportHtml } from "./exportHtml";
import { exportPdf } from "./exportPdf";
import { getActiveSparkdownDocument } from "./getActiveSparkdownDocument";
import { getEditor } from "./getEditor";
import { updateCommands } from "./updateCommands";

export const activateCommandView = (context: vscode.ExtensionContext): void => {
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      "sparkdown-commands",
      SparkdownCommandTreeDataProvider.instance
    )
  );
  context.subscriptions.push(
    vscode.window.createTreeView("sparkdown-commands", {
      treeDataProvider: SparkdownCommandTreeDataProvider.instance,
    })
  );
  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider(
      SparkdownCommandFileDecorationProvider.instance
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("sparkdown.jumpto", (args) => {
      const uri = getActiveSparkdownDocument();
      if (!uri) {
        return;
      }
      const editor = getEditor(uri);
      if (!editor) {
        return;
      }
      const range = editor.document.lineAt(Number(args)).range;
      editor.selection = new vscode.Selection(range.start, range.start);
      editor.revealRange(range, vscode.TextEditorRevealType.AtTop);
    })
  );
  const pdfWorker = new Worker(
    vscode.Uri.joinPath(
      context.extensionUri,
      "out",
      "workers",
      "sparkdown-screenplay-pdf.js"
    ).toString(true)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("sparkdown.exportpdf", async () => {
      await exportPdf(context, pdfWorker);
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("sparkdown.exporthtml", async () => {
      await exportHtml(context);
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("sparkdown.exportcsv", async () => {
      await exportCsv();
    })
  );
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc?.languageId === "sparkdown") {
        updateCommands(doc.uri);
      }
    })
  );
  const uri = getActiveSparkdownDocument();
  if (uri) {
    updateCommands(uri);
  }
};
