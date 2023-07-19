import * as vscode from "vscode";
import { SparkdownOutlineFileDecorationProvider } from "../providers/SparkdownOutlineFileDecorationProvider";
import { SparkdownOutlineTreeDataProvider } from "../providers/SparkdownOutlineTreeDataProvider";
import { getActiveSparkdownDocument } from "./getActiveSparkdownDocument";

export const activateOutlineView = (context: vscode.ExtensionContext): void => {
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      "sparkdown-outline",
      SparkdownOutlineTreeDataProvider.instance
    )
  );
  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider(
      SparkdownOutlineFileDecorationProvider.instance
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("sparkdown.outline.reveal", () => {
      const uri = getActiveSparkdownDocument();
      SparkdownOutlineTreeDataProvider.instance.reveal(uri);
    })
  );
};
