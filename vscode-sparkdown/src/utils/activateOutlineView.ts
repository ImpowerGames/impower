import * as vscode from "vscode";
import { SparkdownOutlineTreeDataProvider } from "../providers/SparkdownOutlineTreeDataProvider";
import { getActiveSparkdownDocument } from "./getActiveSparkdownDocument";
import { updateOutline } from "./updateOutline";

export const activateOutlineView = (context: vscode.ExtensionContext): void => {
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      "sparkdown-outline",
      SparkdownOutlineTreeDataProvider.instance
    )
  );
  context.subscriptions.push(
    vscode.window.createTreeView("sparkdown-outline", {
      treeDataProvider: SparkdownOutlineTreeDataProvider.instance,
    })
  );

  context.subscriptions.push(
    vscode.languages.onDidChangeDiagnostics((e) => {
      for (const uri of e.uris) {
        updateOutline(uri);
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc?.languageId === "sparkdown") {
        updateOutline(doc.uri);
      }
    })
  );
  const uri = getActiveSparkdownDocument();
  if (uri) {
    updateOutline(uri);
  }
};
