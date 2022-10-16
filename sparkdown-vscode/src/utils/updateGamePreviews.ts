import * as vscode from "vscode";
import { isAssetType, parseSpark } from "../../../sparkdown";
import { parseState } from "../state/parseState";
import { getPreviewPanelsToUpdate } from "./getPreviewPanelsToUpdate";

export const updateGamePreviews = (doc: vscode.TextDocument) => {
  const uri = doc.uri;
  const result = parseState.parsedDocuments[uri.toString()];
  const gamePreviewsToUpdate = getPreviewPanelsToUpdate("game", uri);
  if (gamePreviewsToUpdate) {
    for (let i = 0; i < gamePreviewsToUpdate.length; i++) {
      const preview = gamePreviewsToUpdate[i];
      if (preview) {
        const variables = { ...(result?.variables || {}) };
        Object.entries(variables).forEach(([k, v]) => {
          if (isAssetType(v.type)) {
            variables[k] = {
              ...v,
              value: preview.panel.webview
                .asWebviewUri(vscode.Uri.file(v.value as string))
                ?.toString(),
            };
          }
        });
        preview.panel.webview.postMessage({
          command: "updateParsedJson",
          content: JSON.stringify(parseSpark(doc.getText(), { variables })),
        });
        if (preview.dynamic) {
          preview.uri = uri.toString();
          preview.panel.webview.postMessage({
            command: "setstate",
            uri: preview.uri,
          });
        }
      }
    }
  }
};