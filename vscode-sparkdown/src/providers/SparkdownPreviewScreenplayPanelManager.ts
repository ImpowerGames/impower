import { ScrolledEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ScrolledEditorMessage.js";
import { SelectedEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/SelectedEditorMessage.js";
import { ConnectedPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/ConnectedPreviewMessage.js";
import { HoveredOffPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/HoveredOffPreviewMessage.js";
import { HoveredOnPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/HoveredOnPreviewMessage.js";
import { LoadPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/LoadPreviewMessage.js";
import { ScrolledPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/ScrolledPreviewMessage.js";
import { SelectedPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/SelectedPreviewMessage.js";
import { DidChangeTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidChangeTextDocumentMessage.js";
import { DidChangeConfigurationMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeConfigurationMessage.js";
import * as vscode from "vscode";
import { Uri, ViewColumn, WebviewPanel, window } from "vscode";
import { getClientRange } from "../utils/getClientRange";
import { getEditor } from "../utils/getEditor";
import { getNonce } from "../utils/getNonce";
import { getServerRange } from "../utils/getServerRange";
import { getSparkdownPreviewConfig } from "../utils/getSparkdownPreviewConfig";
import { getUri } from "../utils/getUri";
import { getWebviewUri } from "../utils/getWebviewUri";

export class SparkdownPreviewScreenplayPanelManager {
  private static _instance: SparkdownPreviewScreenplayPanelManager;
  static get instance(): SparkdownPreviewScreenplayPanelManager {
    if (!this._instance) {
      this._instance = new SparkdownPreviewScreenplayPanelManager();
    }
    return this._instance;
  }

  protected _panel?: WebviewPanel;
  get panel() {
    return this._panel;
  }

  protected _document?: vscode.TextDocument;
  get document() {
    return this._document;
  }

  _hovering = false;
  get hovering() {
    return this._hovering;
  }

  _connected = false;
  get connected() {
    return this._connected;
  }

  protected _viewType = "sparkdown-preview-screenplay";

  protected _panelTitle = "Screenplay Preview";

  protected _viewColumn = ViewColumn.Two;

  showPanel(extensionUri: Uri, document: vscode.TextDocument) {
    if (document.languageId !== "sparkdown") {
      vscode.window.showErrorMessage(
        `You can only preview Sparkdown documents as a Screenplay!`
      );
      return undefined;
    }
    if (this._panel) {
      const viewColumn = this._viewColumn;
      this._panel.reveal(viewColumn);
    } else {
      this.createPanel(extensionUri, document);
    }
  }

  protected createPanel(extensionUri: Uri, document: vscode.TextDocument) {
    const viewType = this._viewType;
    const panelTitle = this._panelTitle;
    const viewColumn = this._viewColumn;
    const panel = window.createWebviewPanel(viewType, panelTitle, viewColumn, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [Uri.joinPath(extensionUri, "out")],
    });
    this.initializePanel(extensionUri, document, panel);
  }

  async initializePanel(
    extensionUri: Uri,
    document: vscode.TextDocument,
    panel: WebviewPanel
  ) {
    this._document = document;
    this._panel = panel;
    panel.iconPath = {
      light: vscode.Uri.joinPath(extensionUri, "icon-lang.png"),
      dark: vscode.Uri.joinPath(extensionUri, "icon-lang.png"),
    };
    panel.webview.html = this.getWebviewContent(panel.webview, extensionUri);

    panel.webview.onDidReceiveMessage(async (message) => {
      if (ConnectedPreviewMessage.type.isNotification(message)) {
        if (message.params.type === "screenplay") {
          this._connected = true;
          if (this._document) {
            this.loadDocument(panel, this._document);
          }
        }
      }
      if (HoveredOnPreviewMessage.type.isNotification(message)) {
        if (message.params.type === "screenplay") {
          this._hovering = true;
        }
      }
      if (HoveredOffPreviewMessage.type.isNotification(message)) {
        if (message.params.type === "screenplay") {
          this._hovering = false;
        }
      }
      if (ScrolledPreviewMessage.type.isNotification(message)) {
        if (message.params.type === "screenplay") {
          const documentUri = getUri(message.params.textDocument.uri);
          const range = getClientRange(message.params.range);
          const cfg = getSparkdownPreviewConfig(documentUri);
          const syncedWithCursor =
            cfg.screenplay_preview_synchronized_with_cursor;
          if (syncedWithCursor) {
            const editor = getEditor(documentUri);
            if (editor) {
              editor.revealRange(range, vscode.TextEditorRevealType.AtTop);
            }
          }
        }
      }
      if (SelectedPreviewMessage.type.isNotification(message)) {
        if (message.params.type === "screenplay") {
          const documentUri = getUri(message.params.textDocument.uri);
          const range = getClientRange(message.params.range);
          let editor = getEditor(documentUri);
          if (editor === undefined) {
            const doc = await vscode.workspace.openTextDocument(documentUri);
            editor = await vscode.window.showTextDocument(doc);
          } else {
            await vscode.window.showTextDocument(
              editor.document,
              editor.viewColumn,
              false
            );
          }
          editor.selection = new vscode.Selection(range.start, range.end);
          editor.revealRange(
            range,
            vscode.TextEditorRevealType.InCenterIfOutsideViewport
          );
        }
      }
    });
    panel.onDidDispose(() => {
      this._panel = undefined;
    });
  }

  loadDocument(panel: WebviewPanel, document: vscode.TextDocument) {
    this._document = document;
    this._panel = panel;
    const editor = getEditor(document.uri);
    const visibleRange = editor?.visibleRanges[0];
    const selectedRange = editor?.selection;
    panel.webview.postMessage(
      LoadPreviewMessage.type.request({
        type: "screenplay",
        textDocument: {
          uri: document.uri.toString(),
          languageId: document.languageId,
          version: document.version,
          text: document.getText(),
        },
        visibleRange: visibleRange ? getServerRange(visibleRange) : undefined,
        selectedRange: selectedRange
          ? getServerRange(selectedRange)
          : undefined,
      })
    );
  }

  notifyFocusedTextDocument(document: vscode.TextDocument) {
    if (this._panel) {
      if (this._connected) {
        this.loadDocument(this._panel, document);
      }
    }
  }

  notifyChangedTextDocument(
    document: vscode.TextDocument,
    contentChanges: readonly vscode.TextDocumentContentChangeEvent[]
  ) {
    if (document.uri.toString() === this._document?.uri.toString()) {
      if (this._panel) {
        this._panel.webview.postMessage(
          DidChangeTextDocumentMessage.type.notification({
            textDocument: {
              uri: document.uri.toString(),
              version: document.version,
            },
            contentChanges: contentChanges.map((c) => ({
              range: getServerRange(c.range),
              text: c.text,
            })),
          })
        );
      }
    }
  }

  notifyConfiguredWorkspace() {
    if (this._document) {
      if (this._panel) {
        const configuration = getSparkdownPreviewConfig(
          getUri(this._document.uri.toString())
        );
        this._panel.webview.postMessage(
          DidChangeConfigurationMessage.type.notification({
            settings: { ...configuration },
          })
        );
      }
    }
  }

  notifySelectedEditor(document: vscode.TextDocument, range: vscode.Range) {
    if (document.uri.toString() === this._document?.uri.toString()) {
      if (this._panel) {
        this._panel.webview.postMessage(
          SelectedEditorMessage.type.notification({
            textDocument: { uri: document.uri.toString() },
            range: getServerRange(range),
          })
        );
      }
    }
  }

  notifyScrolledEditor(document: vscode.TextDocument, range: vscode.Range) {
    if (document.uri.toString() === this._document?.uri.toString()) {
      if (this._panel) {
        this._panel.webview.postMessage(
          ScrolledEditorMessage.type.notification({
            textDocument: { uri: document.uri.toString() },
            range: getServerRange(range),
          })
        );
      }
    }
  }

  protected getWebviewContent(webview: vscode.Webview, extensionUri: Uri) {
    const jsMainUri = getWebviewUri(webview, extensionUri, [
      "out",
      "webviews",
      "screenplay-preview.js",
    ]);
    const fontFamilyMono = "Courier Prime";
    const fontFormatMono = "truetype";
    const fontPathMono = getWebviewUri(webview, extensionUri, [
      "out",
      "data",
      "courier-prime.ttf",
    ]);
    const fontPathMonoBold = getWebviewUri(webview, extensionUri, [
      "out",
      "data",
      "courier-prime-bold.ttf",
    ]);
    const fontPathMonoItalic = getWebviewUri(webview, extensionUri, [
      "out",
      "data",
      "courier-prime-italic.ttf",
    ]);
    const fontPathMonoBoldItalic = getWebviewUri(webview, extensionUri, [
      "out",
      "data",
      "courier-prime-bold-italic.ttf",
    ]);
    const styleNonce = getNonce();
    const scriptNonce = getNonce();
    return /*html*/ `
      <!DOCTYPE html>
      <html class="s-theme-dark se-theme" lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; media-src ${webview.cspSource}; img-src ${webview.cspSource} https: data: ; script-src 'nonce-${scriptNonce}';">
          <title>Spark Editor</title>
          <style nonce="${styleNonce}">
            @font-face {
              font-family: "${fontFamilyMono}";
              font-weight: 400;
              font-display: block;
              src: url("${fontPathMono}") format("${fontFormatMono}");
            }
            @font-face {
              font-family: "${fontFamilyMono}";
              font-weight: 700;
              font-display: block;
              src: url("${fontPathMonoBold}") format("${fontFormatMono}");
            }
            @font-face {
              font-family: "${fontFamilyMono}";
              font-style: italic;
              font-weight: 400;
              font-display: block;
              src: url("${fontPathMonoItalic}") format("${fontFormatMono}");
            }
            @font-face {
              font-family: "${fontFamilyMono}";
              font-style: italic;
              font-weight: 700;
              font-display: block;
              src: url("${fontPathMonoBoldItalic}") format("${fontFormatMono}");
            }

            html {
              height: 100%;
              padding: 0;
              margin: 0;
              overflow: hidden;
            }

            body {
              height: 100%;
              padding: 0;
              margin: 0;
              opacity: 0;
              display: flex;
              flex-direction: column;
              font-size: 0.875rem;
              font-family: "Courier Prime";
            }

            body.ready {
              opacity: 1;
              transition: 0.25s opacity;
            }
          </style>
        </head>
        <body>
          <sparkdown-screenplay-preview></sparkdown-screenplay-preview>
          <script type="module" nonce="${scriptNonce}" src="${jsMainUri}"></script>
        </body>
      </html>
    `;
  }
}
