import * as vscode from "vscode";
import {
  generateSparkScriptHtml,
  generateSparkTitleHtml,
} from "../../../screenplay";
import { parseSpark } from "../../../sparkdown";
import { getPreviewsToUpdate } from "../providers/Preview";
import { diagnosticState } from "../state/diagnosticState";
import { editorState } from "../state/editorState";
import { outlineViewProvider } from "../state/outlineViewProvider";
import { getEditor } from "./getEditor";
import { getSparkdownConfig } from "./getSparkdownConfig";
import { updateStatus } from "./updateStatus";

let fontTokenExisted = false;
const decorTypesDialogue = vscode.window.createTextEditorDecorationType({});

export const parseDocument = (document: vscode.TextDocument) => {
  const previewsToUpdate = getPreviewsToUpdate(document.uri);
  const output = parseSpark(document.getText(), undefined, {
    removeBlockComments: true,
    skipTokens: ["condition"],
  });

  if (previewsToUpdate) {
    const editor = getEditor(document.uri);
    if (editor) {
      const config = getSparkdownConfig(document.uri);
      const titleHtml = generateSparkTitleHtml(output, config);
      const scriptHtml = generateSparkScriptHtml(output, config);
      for (let i = 0; i < previewsToUpdate.length; i++) {
        previewsToUpdate[i].panel.webview.postMessage({
          command: "updateTitle",
          content: titleHtml,
        });
        previewsToUpdate[i].panel.webview.postMessage({
          command: "updateScript",
          content: scriptHtml,
        });

        if (previewsToUpdate[i].dynamic) {
          previewsToUpdate[i].uri = document.uri.toString();
          previewsToUpdate[i].panel.webview.postMessage({
            command: "setstate",
            uri: previewsToUpdate[i].uri,
          });
        }
      }
    }
  }
  editorState.lastParsedUri = document.uri.toString();
  editorState.parsedDocuments[editorState.lastParsedUri] = output;
  let tokenLength = 0;
  const decorsDialogue: vscode.DecorationOptions[] = [];
  tokenLength = 0;
  let fontTokenExists = false;
  const lastParsedDoc = editorState.parsedDocuments[editorState.lastParsedUri];
  if (lastParsedDoc) {
    lastParsedDoc.titleTokens = {};
    if (output.titleTokens) {
      const titleHiddenTokens = output.titleTokens["hidden"];
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
            previewsToUpdate.forEach((p) => {
              p.panel.webview.postMessage({
                command: "updateFont",
                content: fontName,
              });
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
    previewsToUpdate.forEach((p) => {
      p.panel.webview.postMessage({ command: "removeFont" });
    });
    fontTokenExisted = false;
    diagnosticState.diagnosticCollection.set(document.uri, []);
  }
  const editor = getEditor(document.uri);
  if (editor) {
    editor.setDecorations(decorTypesDialogue, decorsDialogue);
  }

  if (document.languageId === "sparkdown") {
    outlineViewProvider.update();
  }
  updateStatus(
    output.properties?.actionDuration || 0,
    output.properties?.dialogueDuration || 0
  );
};
