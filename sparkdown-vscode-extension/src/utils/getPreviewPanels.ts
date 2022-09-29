import * as vscode from "vscode";
import { PreviewPanel, previewState } from "../state/previewState";

export const getPreviewPanels = (
  type: "screenplay" | "game",
  docuri: vscode.Uri
): PreviewPanel[] => {
  const selectedPreviews: PreviewPanel[] = [];
  for (let i = 0; i < previewState[type].length; i++) {
    if (previewState[type][i].uri === docuri.toString()) {
      selectedPreviews.push(previewState[type][i]);
    }
  }
  return selectedPreviews;
};
