import * as vscode from "vscode";
import { PreviewPanel, previewState } from "../state/previewState";

export const getPreviewPanelsToUpdate = (
  type: "screenplay" | "game",
  uri: vscode.Uri
): PreviewPanel[] => {
  const selectedPreviews: PreviewPanel[] = [];
  for (let i = 0; i < previewState[type].length; i++) {
    if (
      previewState[type][i].uri === uri.toString() ||
      previewState[type][i].dynamic
    ) {
      selectedPreviews.push(previewState[type][i]);
    }
  }
  return selectedPreviews;
};
