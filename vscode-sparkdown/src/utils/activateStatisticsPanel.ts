import * as vscode from "vscode";
import {
  createStatisticsPanel,
  SparkdownStatsPanelSerializer,
} from "../providers/SparkdownStatsPanelSerializer";
import { getActiveSparkdownDocument } from "./getActiveSparkdownDocument";
import { getVisibleEditor } from "./getVisibleEditor";

export const activateStatisticsPanel = (
  context: vscode.ExtensionContext
): void => {
  // Register Statistics panel
  context.subscriptions.push(
    vscode.commands.registerCommand("sparkdown.statistics", async () => {
      const uri = getActiveSparkdownDocument();
      if (!uri) {
        return;
      }
      const editor = getVisibleEditor(uri);
      if (!editor) {
        return;
      }
      createStatisticsPanel(editor, context);
    })
  );
  vscode.window.registerWebviewPanelSerializer(
    "sparkdown-statistics",
    new SparkdownStatsPanelSerializer(context)
  );
};
