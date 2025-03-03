import * as vscode from "vscode";
import { SparkdownCommandTreeDataProvider } from "../providers/SparkdownCommandTreeDataProvider";
import { exportCsv } from "./exportCsv";
import { exportHtml } from "./exportHtml";
import { exportPdf } from "./exportPdf";
import { getActiveSparkdownDocument } from "./getActiveSparkdownDocument";
import { updateCommands } from "./updateCommands";
import { exportJson } from "./exportJson";

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
  const pdfWorker = new Worker(
    vscode.Uri.joinPath(
      context.extensionUri,
      "out",
      "workers",
      "sparkdown-screenplay-pdf.js"
    ).toString(true)
  );
  pdfWorker.onerror = (e) => {
    console.error(e);
  };
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
    vscode.commands.registerCommand("sparkdown.exportjson", async () => {
      await exportJson();
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
