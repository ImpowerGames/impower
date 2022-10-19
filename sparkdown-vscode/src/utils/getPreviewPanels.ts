import * as vscode from "vscode";
import { PreviewPanel, previewState } from "../state/previewState";

export const getPreviewPanels = (
  type: "screenplay" | "game",
  uri: vscode.Uri
): PreviewPanel[] => {
  const selectedPreviews: PreviewPanel[] = [];
  for (let i = 0; i < previewState[type].length; i++) {
    const preview = previewState[type]?.[i];
    if (preview?.uri === uri.toString()) {
      selectedPreviews.push(preview);
    }
  }
  return selectedPreviews;
};
