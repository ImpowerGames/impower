import * as vscode from "vscode";
import { SparkdownPreviewScreenplayPanelManager } from "../managers/SparkdownPreviewScreenplayPanelManager";

export const getActiveSparkdownDocument = (): vscode.Uri | undefined => {
  if (
    SparkdownPreviewScreenplayPanelManager.instance.panel?.active &&
    SparkdownPreviewScreenplayPanelManager.instance.document
  ) {
    return SparkdownPreviewScreenplayPanelManager.instance.document?.uri;
  }
  if (vscode.window.activeTextEditor?.document?.languageId === "sparkdown") {
    return vscode.window.activeTextEditor.document.uri;
  }
  for (let i = 0; i < vscode.window.visibleTextEditors.length; i++) {
    if (
      vscode.window.visibleTextEditors[i]?.document.languageId === "sparkdown"
    ) {
      return vscode.window.visibleTextEditors[i]?.document.uri;
    }
  }
  return undefined;
};
