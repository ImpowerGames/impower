import path from "path";
import * as vscode from "vscode";
import { capitalize } from "./capitalize";
import { getPreviewPanels } from "./getPreviewPanels";
import { loadWebView } from "./loadWebview";

export const createPreviewPanel = (
  type: "screenplay" | "game",
  extension: vscode.Extension<unknown>,
  editor: vscode.TextEditor,
  dynamic: boolean
): vscode.WebviewPanel | undefined => {
  if (editor.document.languageId !== "sparkdown") {
    vscode.window.showErrorMessage(
      `You can only preview Sparkdown documents as a ${type}!`
    );
    return undefined;
  }
  let preview: vscode.WebviewPanel | undefined = undefined;
  const presentPreviews = getPreviewPanels(type, editor.document.uri);
  presentPreviews.forEach((p) => {
    if (p.uri === editor.document.uri.toString() && p.dynamic === dynamic) {
      //The preview already exists
      p.panel.reveal();
      preview = p.panel;
      dynamic = p.dynamic;
    }
  });

  if (!preview) {
    //The preview didn't already exist
    let panelTitle = path
      .basename(editor.document.fileName)
      .replace(".sparkdown", "")
      .replace(".sd", "");
    if (dynamic) {
      panelTitle = `Sparkdown ${capitalize(type)}`;
    }
    preview = vscode.window.createWebviewPanel(
      `sparkdown-preview-${type}`, // Identifies the type of the webview. Used internally
      panelTitle, // Title of the panel displayed to the user
      vscode.ViewColumn.Two, // Editor column to show the new webview panel in.
      { enableScripts: true, retainContextWhenHidden: true }
    );
  }
  loadWebView(type, extension, editor.document.uri, preview, dynamic);
  return preview;
};
