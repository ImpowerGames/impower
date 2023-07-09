import {
  CachedPreview,
  ConfigureScreenplay,
  DidChangeTextDocument,
  DidOpenTextDocument,
  HoveredOffPreview,
  HoveredOnPreview,
  ScrolledEditor,
  ScrolledPreview,
  SelectedEditor,
  SelectedPreview,
} from "@impower/spark-editor-protocol/src";
import * as vscode from "vscode";
import { Uri, ViewColumn, WebviewPanel, window } from "vscode";
import { getConfigureScreenplayParams } from "../messages/getConfigureScreenplayParams";
import { getNonce } from "../utils/getNonce";
import { getRange } from "../utils/getRange";
import { getSparkdownPreviewConfig } from "../utils/getSparkdownPreviewConfig";
import { getUri } from "../utils/getUri";
import { getVisibleEditor } from "../utils/getVisibleEditor";
import { getWebviewUri } from "../utils/getWebviewUri";

export class SparkdownPreviewScreenplayPanelManager {
  private static _instance: SparkdownPreviewScreenplayPanelManager;
  static get instance(): SparkdownPreviewScreenplayPanelManager {
    if (!this._instance) {
      this._instance = new SparkdownPreviewScreenplayPanelManager();
    }
    return this._instance;
  }

  hovering = false;

  protected readonly _panels: Map<string, WebviewPanel> = new Map();

  getPanel(documentUri: vscode.Uri) {
    return this._panels.get(documentUri.toString());
  }

  getAllPanels() {
    return Array.from(this._panels);
  }

  showPanel(extensionUri: Uri, document: vscode.TextDocument) {
    if (document.languageId !== "sparkdown") {
      vscode.window.showErrorMessage(
        `You can only preview Sparkdown documents as a Screenplay!`
      );
      return undefined;
    }
    const panel = this.getPanel(document.uri);
    if (panel) {
      panel.reveal(ViewColumn.One);
    } else {
      this.createPanel(extensionUri, document);
    }
  }

  loadPanel(extensionUri: Uri, documentUri: Uri, panel: WebviewPanel) {
    const editor = getVisibleEditor(documentUri);
    panel.iconPath = {
      light: vscode.Uri.joinPath(extensionUri, "icon-lang.png"),
      dark: vscode.Uri.joinPath(extensionUri, "icon-lang.png"),
    };
    panel.webview.html = this.getWebviewContent(panel.webview, extensionUri);

    panel.webview.postMessage(
      CachedPreview.create({
        textDocument: { uri: documentUri.toString() },
      })
    );
    const configuration = getSparkdownPreviewConfig(documentUri);
    if (editor) {
      panel.webview.postMessage(
        DidOpenTextDocument.create({
          textDocument: {
            uri: editor.document.uri.toString(),
            languageId: editor.document.languageId,
            version: editor.document.version,
            text: editor.document.getText(),
          },
        })
      );
      const syncedWithCursor =
        configuration.screenplay_preview_synchronized_with_cursor;
      if (syncedWithCursor) {
        const range = editor.visibleRanges[0];
        if (range) {
          panel.webview.postMessage(
            ScrolledEditor.create({
              textDocument: { uri: documentUri.toString() },
              range: {
                start: {
                  line: range.start.line,
                  character: range.start.character,
                },
                end: {
                  line: range.end.line,
                  character: range.end.character,
                },
              },
            })
          );
        }
      }
    }
    panel.webview.postMessage(
      ConfigureScreenplay.create(
        getConfigureScreenplayParams(documentUri.toString())
      )
    );
    panel.webview.onDidReceiveMessage(async (message) => {
      if (HoveredOnPreview.is(message)) {
        this.hovering = true;
      }
      if (HoveredOffPreview.is(message)) {
        this.hovering = false;
      }
      if (ScrolledPreview.is(message)) {
        const documentUri = getUri(message.params.textDocument.uri);
        const range = getRange(message.params.range);
        const cfg = getSparkdownPreviewConfig(documentUri);
        const syncedWithCursor =
          cfg.screenplay_preview_synchronized_with_cursor;
        if (syncedWithCursor) {
          const editor = getVisibleEditor(documentUri);
          if (editor) {
            editor.revealRange(range, vscode.TextEditorRevealType.AtTop);
          }
        }
      }
      if (SelectedPreview.is(message)) {
        const documentUri = getUri(message.params.textDocument.uri);
        const range = getRange(message.params.range);
        let editor = getVisibleEditor(documentUri);
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
    });
    panel.onDidDispose(() => {
      this.deletePanel(documentUri);
    });
    this.setPanel(documentUri, panel);
  }

  notifyConfiguredScreenplay() {
    this._panels.forEach((panel, documentUri) => {
      panel.webview.postMessage(
        ConfigureScreenplay.create(
          getConfigureScreenplayParams(documentUri.toString())
        )
      );
    });
  }

  notifyOpenedTextDocument(document: vscode.TextDocument) {
    const panel = this.getPanel(document.uri);
    if (panel) {
      panel.webview.postMessage(
        DidOpenTextDocument.create({
          textDocument: {
            uri: document.uri.toString(),
            languageId: document.languageId,
            version: document.version,
            text: document.getText(),
          },
        })
      );
    }
  }

  notifyChangedTextDocument(
    document: vscode.TextDocument,
    contentChanges: readonly vscode.TextDocumentContentChangeEvent[]
  ) {
    const panel = this.getPanel(document.uri);
    if (panel) {
      panel.webview.postMessage(
        DidChangeTextDocument.create({
          textDocument: {
            uri: document.uri.toString(),
          },
          contentChanges: contentChanges.map((c) => ({
            range: {
              start: {
                line: c.range.start.line,
                character: c.range.start.character,
              },
              end: {
                line: c.range.end.line,
                character: c.range.end.character,
              },
            },
            text: c.text,
          })),
        })
      );
    }
  }

  notifySelectedEditor(document: vscode.TextDocument, range: vscode.Range) {
    const panel = this.getPanel(document.uri);
    if (panel) {
      panel.webview.postMessage(
        SelectedEditor.create({
          textDocument: { uri: document.uri.toString() },
          range: {
            start: {
              line: range.start.line,
              character: range.start.character,
            },
            end: {
              line: range.end.line,
              character: range.end.character,
            },
          },
        })
      );
    }
  }

  notifyScrolledEditor(document: vscode.TextDocument, range: vscode.Range) {
    const panel = this.getPanel(document.uri);
    if (panel) {
      panel.webview.postMessage(
        ScrolledEditor.create({
          textDocument: { uri: document.uri.toString() },
          range: {
            start: {
              line: range.start.line,
              character: range.start.character,
            },
            end: {
              line: range.end.line,
              character: range.end.character,
            },
          },
        })
      );
    }
  }

  protected createPanel(extensionUri: Uri, document: vscode.TextDocument) {
    const viewType = "sparkdown-preview-screenplay";
    let panelTitle = `Screenplay Preview`;
    const viewColumn = ViewColumn.Two;
    const panel = window.createWebviewPanel(viewType, panelTitle, viewColumn, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [Uri.joinPath(extensionUri, "out")],
    });
    this.loadPanel(extensionUri, document.uri, panel);
  }

  protected deletePanel(documentUri: vscode.Uri) {
    return this._panels.delete(documentUri.toString());
  }

  protected setPanel(documentUri: vscode.Uri, panel: WebviewPanel) {
    return this._panels.set(documentUri.toString(), panel);
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

            body {
              --s-color-tab-active: var(--s-color-neutral-100);
              --s-color-tab-inactive: hsl(0 0% 45%);
              --s-color-fab-fg: white;
              --s-color-fab-bg: var(--vscode-custom-button-background);
              --s-color-primary-bg: var(--vscode-custom-editor-navigation-background);
              --s-color-panel: var(--vscode-custom-editor-background);
            }
          </style>
        </head>
        <body>
          <sparkdown-script-preview></sparkdown-script-preview>
          <script type="module" nonce="${scriptNonce}" src="${jsMainUri}"></script>
        </body>
      </html>
    `;
  }
}
