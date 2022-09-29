import * as vscode from "vscode";
import {
  generateSparkScriptHtml,
  generateSparkTitleHtml,
} from "../../../spark-screenplay";
import { parseSpark } from "../../../sparkdown";
import { diagnosticState } from "../state/diagnosticState";
import { outlineViewProvider } from "../state/outlineViewProvider";
import { parseState } from "../state/parseState";
import { getEditor } from "./getEditor";
import { getPreviewPanelsToUpdate } from "./getPreviewPanelsToUpdate";
import { getSparkdownConfig } from "./getSparkdownConfig";
import { updateStatus } from "./updateStatus";

let fontTokenExisted = false;
const decorTypesDialogue = vscode.window.createTextEditorDecorationType({});

export const parseDocument = (document: vscode.TextDocument) => {
  const editor = getEditor(document.uri);
  if (!editor) {
    return;
  }

  const output = parseSpark(document.getText(), undefined, {
    removeBlockComments: true,
    skipTokens: ["condition"],
  });

  const screenplayPreviewsToUpdate = getPreviewPanelsToUpdate(
    "screenplay",
    document.uri
  );
  if (screenplayPreviewsToUpdate) {
    const config = getSparkdownConfig(document.uri);
    const titleHtml = generateSparkTitleHtml(output, config);
    const scriptHtml = generateSparkScriptHtml(output, config);
    for (let i = 0; i < screenplayPreviewsToUpdate.length; i++) {
      screenplayPreviewsToUpdate[i].panel.webview.postMessage({
        command: "updateTitle",
        content: titleHtml,
      });
      screenplayPreviewsToUpdate[i].panel.webview.postMessage({
        command: "updateScript",
        content: scriptHtml,
      });
      if (screenplayPreviewsToUpdate[i].dynamic) {
        screenplayPreviewsToUpdate[i].uri = document.uri.toString();
        screenplayPreviewsToUpdate[i].panel.webview.postMessage({
          command: "setstate",
          uri: screenplayPreviewsToUpdate[i].uri,
        });
      }
    }
  }
  const gamePreviewsToUpdate = getPreviewPanelsToUpdate("game", document.uri);
  if (gamePreviewsToUpdate) {
    const config = getSparkdownConfig(document.uri);
    const scriptHtml = generateSparkScriptHtml(output, config);
    for (let i = 0; i < gamePreviewsToUpdate.length; i++) {
      gamePreviewsToUpdate[i].panel.webview.postMessage({
        command: "updateScript",
        content: scriptHtml,
      });
      if (gamePreviewsToUpdate[i].dynamic) {
        gamePreviewsToUpdate[i].uri = document.uri.toString();
        gamePreviewsToUpdate[i].panel.webview.postMessage({
          command: "setstate",
          uri: gamePreviewsToUpdate[i].uri,
        });
      }
    }
  }
  parseState.lastParsedUri = document.uri.toString();
  parseState.parsedDocuments[parseState.lastParsedUri] = output;
  let tokenLength = 0;
  const decorsDialogue: vscode.DecorationOptions[] = [];
  tokenLength = 0;
  let fontTokenExists = false;
  const lastParsedDoc = parseState.parsedDocuments[parseState.lastParsedUri];
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
            screenplayPreviewsToUpdate.forEach((p) => {
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
    screenplayPreviewsToUpdate.forEach((p) => {
      p.panel.webview.postMessage({ command: "removeFont" });
    });
    fontTokenExisted = false;
    diagnosticState.diagnosticCollection.set(document.uri, []);
  }
  editor.setDecorations(decorTypesDialogue, decorsDialogue);

  if (document.languageId === "sparkdown") {
    outlineViewProvider.update();
  }
  updateStatus(
    output.properties?.actionDuration || 0,
    output.properties?.dialogueDuration || 0
  );
};
