import * as vscode from "vscode";
import {
  createStatisticsPanel,
  SparkdownStatisticsPanelSerializer,
} from "../providers/SparkdownStatisticsPanelSerializer";
import { getActiveSparkdownDocument } from "./getActiveSparkdownDocument";
import { getEditor } from "./getEditor";

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
      const editor = getEditor(uri);
      if (!editor) {
        return;
      }
      createStatisticsPanel(editor, context);
    })
  );
  vscode.window.registerWebviewPanelSerializer(
    "sparkdown-statistics",
    new SparkdownStatisticsPanelSerializer(context)
  );
};
