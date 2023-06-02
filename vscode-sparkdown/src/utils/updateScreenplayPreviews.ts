import * as vscode from "vscode";
import {
  generateSparkScriptHtml,
  generateSparkTitleHtml,
} from "../../../spark-screenplay";
import { diagnosticState } from "../state/diagnosticState";
import { parseState } from "../state/parseState";
import { getEditor } from "./getEditor";
import { getPreviewPanelsToUpdate } from "./getPreviewPanelsToUpdate";
import { getSparkdownConfig } from "./getSparkdownConfig";

let fontTokenExisted = false;
const decorTypesDialogue = vscode.window.createTextEditorDecorationType({});

export const updateScreenplayPreviews = (doc: vscode.TextDocument) => {
  performance.mark("updateScreenplayPreviews-start");
  const uri = doc.uri;
  const result = parseState.parsedDocuments[uri.toString()];
  const screenplayPreviewsToUpdate = getPreviewPanelsToUpdate(
    "screenplay",
    uri
  );
  if (
    result &&
    screenplayPreviewsToUpdate &&
    screenplayPreviewsToUpdate?.length > 0
  ) {
    const config = getSparkdownConfig(uri);
    const titleHtml = generateSparkTitleHtml(result, config);
    const scriptHtml = generateSparkScriptHtml(result, config);
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
    let tokenLength = 0;
    const decorsDialogue: vscode.DecorationOptions[] = [];
    tokenLength = 0;
    let fontTokenExists = false;
    const lastParsedDoc = parseState.parsedDocuments[parseState.lastParsedUri];
    if (lastParsedDoc) {
      lastParsedDoc.titleTokens = {};
      if (result.titleTokens) {
        const titleHiddenTokens = result.titleTokens["hidden"];
        if (titleHiddenTokens) {
          while (tokenLength < titleHiddenTokens.length) {
            const hiddenToken = titleHiddenTokens[tokenLength];
            if (
              hiddenToken?.type === "font" &&
              hiddenToken?.text?.trim() !== ""
            ) {
              const fontLine = hiddenToken.line;
              if (fontLine !== undefined) {
                if (!lastParsedDoc.properties) {
                  lastParsedDoc.properties = {};
                }
                lastParsedDoc.properties.fontLine = fontLine;
              }
              const fontName = hiddenToken.text;
              screenplayPreviewsToUpdate.forEach((p) => {
                if (p) {
                  p.panel.webview.postMessage({
                    command: "sparkdown.updateFont",
                    content: fontName,
                  });
                }
              });
              fontTokenExists = true;
              fontTokenExisted = true;
            }
            tokenLength++;
          }
        }
      }
    }
    if (!fontTokenExists && fontTokenExisted) {
      screenplayPreviewsToUpdate.forEach((p) => {
        if (p) {
          p.panel.webview.postMessage({ command: "sparkdown.removeFont" });
        }
      });
      fontTokenExisted = false;
      diagnosticState.diagnosticCollection.set(uri, []);
    }

    const editor = getEditor(uri);
    if (!editor) {
      return;
    }

    editor.setDecorations(decorTypesDialogue, decorsDialogue);
    performance.mark("updateScreenplayPreviews-end");
    performance.measure(
      "updateScreenplayPreviews",
      "updateScreenplayPreviews-start",
      "updateScreenplayPreviews-end"
    );
  }
};
