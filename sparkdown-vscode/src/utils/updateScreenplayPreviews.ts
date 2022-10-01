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
  const uri = doc.uri;
  const result = parseState.parsedDocuments[uri.toString()];
  const screenplayPreviewsToUpdate = getPreviewPanelsToUpdate(
    "screenplay",
    uri
  );
  if (screenplayPreviewsToUpdate) {
    const config = getSparkdownConfig(uri);
    const titleHtml = generateSparkTitleHtml(result, config);
    const scriptHtml = generateSparkScriptHtml(result, config);
    for (let i = 0; i < screenplayPreviewsToUpdate.length; i++) {
      if (screenplayPreviewsToUpdate[i]) {
        screenplayPreviewsToUpdate[i].panel.webview.postMessage({
          command: "updateTitle",
          content: titleHtml,
        });
        screenplayPreviewsToUpdate[i].panel.webview.postMessage({
          command: "updateScript",
          content: scriptHtml,
        });
        if (screenplayPreviewsToUpdate[i].dynamic) {
          screenplayPreviewsToUpdate[i].uri = uri.toString();
          screenplayPreviewsToUpdate[i].panel.webview.postMessage({
            command: "setstate",
            uri: screenplayPreviewsToUpdate[i].uri,
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
            if (
              titleHiddenTokens?.[tokenLength]?.type === "font" &&
              titleHiddenTokens?.[tokenLength]?.text?.trim() !== ""
            ) {
              const fontLine = titleHiddenTokens[tokenLength].line;
              if (fontLine !== undefined) {
                if (!lastParsedDoc.properties) {
                  lastParsedDoc.properties = {};
                }
                lastParsedDoc.properties.fontLine = fontLine;
              }
              const fontName = titleHiddenTokens[tokenLength].text;
              screenplayPreviewsToUpdate.forEach((p) => {
                if (p) {
                  p.panel.webview.postMessage({
                    command: "updateFont",
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
          p.panel.webview.postMessage({ command: "removeFont" });
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
  }
};
