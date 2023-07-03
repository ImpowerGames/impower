import {
  generateSparkScriptHtml,
  generateSparkTitleHtml,
} from "@impower/spark-screenplay/src/index";
import * as vscode from "vscode";
import { parseState } from "../state/parseState";
import { getEditor } from "./getEditor";
import { getPreviewPanelsToUpdate } from "./getPreviewPanelsToUpdate";
import { getSparkdownConfig } from "./getSparkdownConfig";

export const updateScreenplayPreviews = (doc: vscode.TextDocument) => {
  performance.mark("updateScreenplayPreviews-start");
  const uri = doc.uri;
  const program = parseState.parsedPrograms[uri.toString()];
  const screenplayPreviewsToUpdate = getPreviewPanelsToUpdate(
    "screenplay",
    uri
  );
  if (
    program &&
    screenplayPreviewsToUpdate &&
    screenplayPreviewsToUpdate?.length > 0
  ) {
    const config = getSparkdownConfig(uri);
    const titleHtml = generateSparkTitleHtml(program, config);
    const scriptHtml = generateSparkScriptHtml(program, config).join("");
    for (let i = 0; i < screenplayPreviewsToUpdate.length; i++) {
      const preview = screenplayPreviewsToUpdate[i];
      if (preview) {
        preview.panel.webview.postMessage({
          command: "sparkdown.updateTitle",
          content: titleHtml,
        });
        preview.panel.webview.postMessage({
          command: "sparkdown.updateScript",
          content: scriptHtml,
        });
        if (preview.dynamic) {
          preview.uri = uri.toString();
          preview.panel.webview.postMessage({
            command: "sparkdown.setstate",
            uri: preview.uri,
          });
        }
      }
    }
    const editor = getEditor(uri);
    if (!editor) {
      return;
    }

    performance.mark("updateScreenplayPreviews-end");
    performance.measure(
      "updateScreenplayPreviews",
      "updateScreenplayPreviews-start",
      "updateScreenplayPreviews-end"
    );
  }
};
