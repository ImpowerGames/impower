import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { directoryPath } from "../directoryPath";
import { diagnosticState } from "../state/diagnosticState";
import { editorState } from "../state/editorState";
import { getEditor } from "../utils/getEditor";
import { getSparkdownConfig } from "../utils/getSparkdownConfig";
import { parseDocument } from "../utils/parseDocument";
import {
  getVisibleLine,
  TopmostLineMonitor,
} from "../utils/topMostLineMonitor";

interface Preview {
  uri: string;
  dynamic: boolean;
  panel: vscode.WebviewPanel;
  id: number;
}

let isScrolling = false;

export const previews: Preview[] = [];

export const getPreviewPanels = (docuri: vscode.Uri): Preview[] => {
  const selectedPreviews: Preview[] = [];
  for (let i = 0; i < previews.length; i++) {
    if (previews[i].uri === docuri.toString()) {
      selectedPreviews.push(previews[i]);
    }
  }
  return selectedPreviews;
};
export const removePreviewPanel = (id: number) => {
  for (let i = previews.length - 1; i >= 0; i--) {
    if (previews[i].id === id) {
      previews.splice(i, 1);
    }
  }
};

export const getPreviewsToUpdate = (docuri: vscode.Uri): Preview[] => {
  const selectedPreviews: Preview[] = [];
  for (let i = 0; i < previews.length; i++) {
    if (previews[i].uri === docuri.toString() || previews[i].dynamic) {
      selectedPreviews.push(previews[i]);
    }
  }
  return selectedPreviews;
};

export const createPreviewPanel = (
  editor: vscode.TextEditor,
  dynamic: boolean
): vscode.WebviewPanel | undefined => {
  if (editor.document.languageId !== "sparkdown") {
    vscode.window.showErrorMessage(
      "You can only preview Sparkdown documents as a screenplay!"
    );
    return undefined;
  }
  let preview: vscode.WebviewPanel | undefined = undefined;
  const presentPreviews = getPreviewPanels(editor.document.uri);
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
    let previewname = path
      .basename(editor.document.fileName)
      .replace(".sparkdown", "");
    if (dynamic) {
      previewname = "Sparkdown Preview";
    }
    preview = vscode.window.createWebviewPanel(
      "sparkdown-preview", // Identifies the type of the webview. Used internally
      previewname, // Title of the panel displayed to the user
      vscode.ViewColumn.Three, // Editor column to show the new webview panel in.
      { enableScripts: true, retainContextWhenHidden: true }
    );
  }
  loadWebView(editor.document.uri, preview, dynamic);
  return preview;
};

const webviewHtml = fs.readFileSync(
  directoryPath() + path.sep + "webviews" + path.sep + "preview.html",
  "utf8"
);

function loadWebView(
  docuri: vscode.Uri,
  preview: vscode.WebviewPanel,
  dynamic: boolean
) {
  const id = Date.now() + Math.floor(Math.random() * 1000);
  previews.push({
    uri: docuri.toString(),
    dynamic: dynamic,
    panel: preview,
    id: id,
  });

  preview.webview.onDidReceiveMessage(async (message) => {
    if (message.command === "updateFontResult") {
      const parsedDoc =
        editorState.parsedDocuments[vscode.Uri.parse(message.uri).toString()];
      if (message.content === false && parsedDoc.properties?.fontLine !== -1) {
        //The font could not be rendered
        diagnosticState.diagnostics.length = 0;
        diagnosticState.diagnostics.push(
          new vscode.Diagnostic(
            new vscode.Range(
              new vscode.Position(parsedDoc.properties?.fontLine || 0, 0),
              new vscode.Position(
                editorState.parsedDocuments[docuri.toString()]?.properties
                  ?.fontLine || 0,
                5
              )
            ),
            "This font could not be rendered in the live preview. Is it installed?",
            vscode.DiagnosticSeverity.Error
          )
        );
        diagnosticState.diagnosticCollection.set(
          vscode.Uri.parse(message.uri),
          diagnosticState.diagnostics
        );
      } else {
        //Yay, the font has been rendered
        diagnosticState.diagnosticCollection.set(
          vscode.Uri.parse(message.uri),
          []
        );
      }
    } else if (message.command === "revealLine") {
      if (
        !getSparkdownConfig(vscode.Uri.parse(message.uri))
          .synchronized_markup_and_preview
      ) {
        return;
      }
      isScrolling = true;
      const sourceLine = Math.floor(message.content);
      const fraction = message.content - sourceLine;
      const editor = getEditor(vscode.Uri.parse(message.uri));
      if (editor && !Number.isNaN(sourceLine)) {
        const text = editor.document.lineAt(sourceLine).text;
        const start = Math.floor(fraction * text.length);
        editor.revealRange(
          new vscode.Range(sourceLine, start, sourceLine, 1),
          vscode.TextEditorRevealType.AtTop
        );
      }
    }
    if (message.command === "changeselection") {
      const linePos = Number(message.line);
      let charPos = Number(message.character);
      if (Number.isNaN(linePos)) {
        return;
      }
      if (Number.isNaN(charPos)) {
        charPos = 0;
      }

      const selectionposition = new vscode.Position(
        message.line,
        message.character
      );

      let editor = getEditor(vscode.Uri.parse(message.uri));
      if (editor === undefined) {
        const doc = await vscode.workspace.openTextDocument(
          vscode.Uri.parse(message.uri)
        );
        editor = await vscode.window.showTextDocument(doc);
      } else {
        await vscode.window.showTextDocument(
          editor.document,
          editor.viewColumn,
          false
        );
      }

      editor.selection = new vscode.Selection(
        selectionposition,
        selectionposition
      );
      editor.revealRange(
        new vscode.Range(linePos, 0, linePos + 1, 0),
        vscode.TextEditorRevealType.InCenterIfOutsideViewport
      );
    }
  });
  preview.onDidDispose(() => {
    removePreviewPanel(id);
  });

  preview.webview.html = webviewHtml.replace(
    /\$ROOTDIR\$/g,
    preview.webview.asWebviewUri(vscode.Uri.file(directoryPath())).toString()
  );
  preview.webview.postMessage({
    command: "setstate",
    uri: docuri.toString(),
    dynamic: dynamic,
  });
  const config = getSparkdownConfig(docuri);
  preview.webview.postMessage({ command: "updateconfig", content: config });

  const editor = getEditor(docuri);
  if (editor) {
    parseDocument(editor.document);
    if (config.synchronized_markup_and_preview) {
      preview.webview.postMessage({
        command: "highlightline",
        content: editor.selection.start.line,
      });
      preview.webview.postMessage({
        command: "showsourceline",
        content: getVisibleLine(editor),
        linescount: editor.document.lineCount,
        source: "scroll",
      });
    }
  }
}

const _topmostLineMonitor = new TopmostLineMonitor();
_topmostLineMonitor.onDidChanged((event) => {
  scrollTo(event.line, event.resource);
});

function scrollTo(topLine: number, resource: vscode.Uri) {
  if (isScrolling) {
    isScrolling = false;
    return;
  }

  const editor = getEditor(resource);
  if (!editor) {
    return;
  }

  if (getSparkdownConfig(editor.document.uri).synchronized_markup_and_preview) {
    previews.forEach((p) => {
      if (p.uri === resource.toString()) {
        p.panel.webview.postMessage({
          command: "showsourceline",
          content: topLine,
          linescount: editor.document.lineCount,
          source: "scroll",
        });
      }
    });
  }
}

vscode.workspace.onDidChangeConfiguration((change) => {
  previews.forEach((p) => {
    const config = getSparkdownConfig(vscode.Uri.parse(p.uri));
    if (change.affectsConfiguration("sparkdown")) {
      p.panel.webview.postMessage({ command: "updateconfig", content: config });
    }
  });
});

vscode.window.onDidChangeTextEditorSelection((change) => {
  if (change.textEditor.document.languageId === "sparkdown") {
    const config = getSparkdownConfig(change.textEditor.document.uri);
    if (config.synchronized_markup_and_preview) {
      const selection = change.selections[0];
      previews.forEach((p) => {
        if (p.uri === change.textEditor.document.uri.toString()) {
          p.panel.webview.postMessage({
            command: "showsourceline",
            content: selection.active.line,
            linescount: change.textEditor.document.lineCount,
            source: "click",
          });
        }
      });
    }
  }
});

export class SparkdownPreviewSerializer
  implements vscode.WebviewPanelSerializer
{
  async deserializeWebviewPanel(
    webviewPanel: vscode.WebviewPanel,
    state: { docuri: string; dynamic: boolean }
  ) {
    // `state` is the state persisted using `setState` inside the webview

    // Restore the content of our webview.
    //
    // Make sure we hold on to the `webviewPanel` passed in here and
    // also restore any event listeners we need on it.

    const docuri = vscode.Uri.parse(state.docuri);
    loadWebView(docuri, webviewPanel, state.dynamic);
    //webviewPanel.webview.postMessage({ command: 'updateTitle', content: state.title_html });
    //webviewPanel.webview.postMessage({ command: 'updateScript', content: state.screenplay_html });
  }
}
