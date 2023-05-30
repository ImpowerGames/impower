import * as vscode from "vscode";
import { PreviewPanel, previewState } from "../state/previewState";

export const getPreviewPanelsToUpdate = (
  type: "screenplay" | "game",
  uri: vscode.Uri
): PreviewPanel[] => {
  const selectedPreviews: PreviewPanel[] = [];
  for (let i = 0; i < previewState[type].length; i++) {
    const s = previewState?.[type]?.[i];
    if (s?.uri === uri.toString() || s?.dynamic) {
      selectedPreviews.push(s);
    }
  }
  return selectedPreviews;
};
