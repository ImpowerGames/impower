import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/classes/MessageProtocolNotificationType";
import { MessageProtocolRequestType } from "@impower/jsonrpc/src/classes/MessageProtocolRequestType";
import { FileChangeType } from "@impower/spark-editor-protocol/src/enums/FileChangeType";
import { InitializeMessage } from "@impower/spark-editor-protocol/src/protocols/InitializeMessage";
import { ScrolledEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ScrolledEditorMessage";
import { SelectedEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/SelectedEditorMessage";
import { ConnectedPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/ConnectedPreviewMessage";
import { HoveredOffPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/HoveredOffPreviewMessage";
import { HoveredOnPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/HoveredOnPreviewMessage";
import { ScrolledPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/ScrolledPreviewMessage";
import { SelectedPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/SelectedPreviewMessage";
import { DidChangeTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidChangeTextDocumentMessage";
import { DidSelectTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidSelectTextDocumentMessage";
import { DidChangeConfigurationMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeConfigurationMessage";
import { DidChangeWatchedFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeWatchedFilesMessage";
import { ExecuteCommandMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/ExecuteCommandMessage";
import { Connection } from "@impower/spark-engine/src/game/core/classes/Connection";
import { GameExitedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameExitedMessage";
import { GameReloadedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameReloadedMessage";
import { GameStartedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameStartedMessage";
import { ResizeGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/ResizeGameMessage";
import { DEFAULT_BUILTIN_DEFINITIONS } from "@impower/spark-engine/src/game/modules/DEFAULT_BUILTIN_DEFINITIONS";
import { DEFAULT_DESCRIPTION_DEFINITIONS } from "@impower/spark-engine/src/game/modules/DEFAULT_DESCRIPTION_DEFINITIONS";
import { DEFAULT_OPTIONAL_DEFINITIONS } from "@impower/spark-engine/src/game/modules/DEFAULT_OPTIONAL_DEFINITIONS";
import { DEFAULT_SCHEMA_DEFINITIONS } from "@impower/spark-engine/src/game/modules/DEFAULT_SCHEMA_DEFINITIONS";
import * as vscode from "vscode";
import { ViewColumn, WebviewPanel, window } from "vscode";
import { getClientRange } from "../utils/getClientRange";
import { getEditor } from "../utils/getEditor";
import { getNonce } from "../utils/getNonce";
import { getServerRange } from "../utils/getServerRange";
import { getSparkdownPreviewConfig } from "../utils/getSparkdownPreviewConfig";
import { getUri } from "../utils/getUri";
import { getWebviewUri } from "../utils/getWebviewUri";
import { getWorkspaceFileWatchers } from "../utils/getWorkspaceFileWatchers";
import { getWorkspaceFiles } from "../utils/getWorkspaceFiles";

export class SparkdownPreviewGamePanelManager {
  private static _instance: SparkdownPreviewGamePanelManager;
  static get instance(): SparkdownPreviewGamePanelManager {
    if (!this._instance) {
      this._instance = new SparkdownPreviewGamePanelManager();
    }
    return this._instance;
  }

  protected _panel?: WebviewPanel;
  get panel() {
    return this._panel;
  }

  _hovering = false;
  get hovering() {
    return this._hovering;
  }

  _connected = false;
  get connected() {
    return this._connected;
  }

  _connection = new Connection({
    onSend: (msg) => {
      this._panel?.webview.postMessage(msg);
    },
    onReceive: async () => undefined,
  });
  get connection() {
    return this._connection;
  }

  protected _viewType = "sparkdown-preview-game";

  protected _panelTitle = "Game Preview";

  protected _viewColumn = ViewColumn.Two;

  protected _selected?: {
    uri: string;
    version: number;
  };

  protected _listeners = new Set<(message: any) => void>();

  protected _gameRunning = false;

  protected _startFrom?: {
    file: string;
    line: number;
  };

  async showPanel(
    context: vscode.ExtensionContext,
    document: vscode.TextDocument | undefined
  ) {
    if (this._panel) {
      const viewColumn = this._viewColumn;
      this._panel.reveal(viewColumn);
    } else {
      if (
        vscode.window.tabGroups.activeTabGroup.activeTab?.label ===
        this._panelTitle
      ) {
        vscode.window.tabGroups.close(
          vscode.window.tabGroups.activeTabGroup.activeTab
        );
      }
      return this.createPanel(context, document);
    }
  }

  protected async createPanel(
    context: vscode.ExtensionContext,
    document: vscode.TextDocument | undefined
  ) {
    const viewType = this._viewType;
    const panelTitle = this._panelTitle;
    const viewColumn = this._viewColumn;
    const panel = window.createWebviewPanel(viewType, panelTitle, viewColumn, {
      enableScripts: true,
      retainContextWhenHidden: true,
      enableCommandUris: true,
    });
    return this.initializePanel(panel, context, document);
  }

  async initializePanel(
    panel: WebviewPanel,
    context: vscode.ExtensionContext,
    document: vscode.TextDocument | undefined,
    canvasHeight?: number
  ) {
    const fileWatchers = getWorkspaceFileWatchers();
    const files = await getWorkspaceFiles();
    for (const fileWatcher of fileWatchers) {
      fileWatcher.onDidCreate(async (fileUri) => {
        this.sendNotification(DidChangeWatchedFilesMessage.type, {
          changes: [{ type: FileChangeType.Created, uri: fileUri.toString() }],
        });
      });
      fileWatcher.onDidChange(async (fileUri) => {
        this.sendNotification(DidChangeWatchedFilesMessage.type, {
          changes: [{ type: FileChangeType.Changed, uri: fileUri.toString() }],
        });
      });
      fileWatcher.onDidDelete(async (fileUri) => {
        this.sendNotification(DidChangeWatchedFilesMessage.type, {
          changes: [{ type: FileChangeType.Deleted, uri: fileUri.toString() }],
        });
      });
    }
    // Setup document and panel
    this._panel = panel;
    panel.iconPath = {
      light: vscode.Uri.joinPath(context.extensionUri, "icon-lang.png"),
      dark: vscode.Uri.joinPath(context.extensionUri, "icon-lang.png"),
    };
    panel.onDidDispose(() => {
      this._connection.receive(
        GameExitedMessage.type.notification({ reason: "quit" })
      );
      for (const fileWatcher of fileWatchers) {
        fileWatcher.dispose();
      }
      this._panel = undefined;
    });
    panel.webview.html = this.getWebviewContent(panel.webview, context);
    panel.webview.onDidReceiveMessage(async (message) => {
      if (ExecuteCommandMessage.type.isRequest(message)) {
        const params = message.params;
        if (params.command === "sparkdown.getFileText") {
          const [uri] = params.arguments || [];
          if (uri && typeof uri === "string") {
            const buffer = await vscode.workspace.fs.readFile(
              vscode.Uri.parse(uri)
            );
            const text = new TextDecoder("utf-8").decode(buffer);
            this.sendResponse(ExecuteCommandMessage.type, message.id, text);
          }
        }
        if (params.command === "sparkdown.getFileSrc") {
          const [uri] = params.arguments || [];
          if (uri && typeof uri === "string") {
            const src = this._panel?.webview
              .asWebviewUri(vscode.Uri.parse(uri))
              .toString();
            this.sendResponse(ExecuteCommandMessage.type, message.id, src);
          }
        }
      }
      if (ConnectedPreviewMessage.type.isNotification(message)) {
        if (message.params.type === "game") {
          this._connected = true;
          const editor = document ? getEditor(document.uri) : undefined;
          const sparkdownConfig =
            vscode.workspace.getConfiguration("sparkdown");
          const settings = JSON.parse(JSON.stringify(sparkdownConfig));
          await this.sendRequest(InitializeMessage.type, {
            initializationOptions: {
              settings,
              files: Object.values(files),
              definitions: {
                builtins: DEFAULT_BUILTIN_DEFINITIONS,
                optionals: DEFAULT_OPTIONAL_DEFINITIONS,
                schemas: DEFAULT_SCHEMA_DEFINITIONS,
                descriptions: DEFAULT_DESCRIPTION_DEFINITIONS,
              },
              skipValidation: true,
              uri: document?.uri.toString(),
              ...(editor ? this.getGameConfiguration(editor) : {}),
            },
            capabilities: {},
            rootUri: null,
            processId: 0,
          });
          if (canvasHeight != null) {
            await this.sendRequest(ResizeGameMessage.type, {
              height: canvasHeight,
            });
          }
        }
      }
      if (HoveredOnPreviewMessage.type.isNotification(message)) {
        if (message.params.type === "game") {
          this._hovering = true;
        }
      }
      if (HoveredOffPreviewMessage.type.isNotification(message)) {
        if (message.params.type === "game") {
          this._hovering = false;
        }
      }
      if (ScrolledPreviewMessage.type.isNotification(message)) {
        if (message.params.type === "game") {
          const documentUri = getUri(message.params.textDocument.uri);
          const range = getClientRange(message.params.visibleRange);
          const cfg = getSparkdownPreviewConfig(documentUri);
          const syncedWithCursor = cfg.game_preview_synchronized_with_cursor;
          if (syncedWithCursor) {
            const editor = getEditor(documentUri);
            if (editor) {
              editor.revealRange(range, vscode.TextEditorRevealType.AtTop);
            }
          }
        }
      }
      if (SelectedPreviewMessage.type.isNotification(message)) {
        if (message.params.type === "game") {
          if (message.params.userEvent && !message.params.docChanged) {
            const documentUri = getUri(message.params.textDocument.uri);
            const range = getClientRange(message.params.selectedRange);
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
      }
      if (GameStartedMessage.type.isNotification(message)) {
        this._gameRunning = true;
        if (!vscode.debug.activeDebugSession) {
          vscode.commands.executeCommand("sparkdown.debugGame");
        }
      }
      if (GameReloadedMessage.type.isNotification(message)) {
        vscode.commands.executeCommand("sparkdown.debug.unpin");
      }
      if (GameExitedMessage.type.isNotification(message)) {
        this._gameRunning = false;
      }
      if (message) {
        for (const listener of this._listeners) {
          listener(message);
        }
        this._connection.receive(message);
      }
      // Post an empty message so panel activates after deserialization
      panel.webview.postMessage({});
    });
  }

  getGameConfiguration(editor: vscode.TextEditor) {
    const startFrom = {
      file: editor.document.uri.toString(),
      line: editor.selection.active.line ?? 0,
    };
    return {
      workspace: this.getWorkspace(editor.document.uri),
      startFrom,
    };
  }

  async notifyChangedActiveEditor(editor: vscode.TextEditor) {
    if (this._connected) {
      const document = editor.document;
      if (document.languageId === "sparkdown") {
        if (!vscode.debug.activeDebugSession && !this._gameRunning) {
          // TODO: Preview new file?
        }
      }
    }
  }

  notifyChangedTextDocument(
    document: vscode.TextDocument,
    changes: readonly vscode.TextDocumentContentChangeEvent[]
  ) {
    const textDocument = {
      uri: document.uri.toString(),
      version: document.version,
    };
    const contentChanges = changes.map((c) => ({
      range: getServerRange(c.range),
      text: c.text,
    }));
    this.sendNotification(DidChangeTextDocumentMessage.type, {
      textDocument,
      contentChanges,
    });
  }

  notifyConfiguredWorkspace() {
    const sparkdownConfig = vscode.workspace.getConfiguration("sparkdown");
    const settings = JSON.parse(JSON.stringify(sparkdownConfig));
    this.sendNotification(DidChangeConfigurationMessage.type, {
      settings,
    });
  }

  async notifySelectedEditor(
    document: vscode.TextDocument,
    selectedRange: vscode.Range,
    userEvent: boolean
  ) {
    this.sendNotification(DidSelectTextDocumentMessage.type, {
      textDocument: { uri: document.uri.toString() },
      selectedRange: getServerRange(selectedRange),
      userEvent,
      docChanged:
        this._selected?.uri === document.uri.toString() &&
        this._selected.version != document.version,
    });
    this.sendNotification(SelectedEditorMessage.type, {
      textDocument: { uri: document.uri.toString() },
      selectedRange: getServerRange(selectedRange),
      userEvent,
      docChanged:
        this._selected?.uri === document.uri.toString() &&
        this._selected.version != document.version,
    });
    this._selected = {
      uri: document.uri.toString(),
      version: document.version,
    };
  }

  notifyScrolledEditor(document: vscode.TextDocument, range: vscode.Range) {
    this.sendNotification(ScrolledEditorMessage.type, {
      textDocument: { uri: document.uri.toString() },
      visibleRange: getServerRange(range),
      target: "element",
    });
  }

  getWorkspace(uri: vscode.Uri | undefined) {
    if (!uri) {
      return undefined;
    }
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (!workspaceFolder) {
      return undefined;
    }
    return workspaceFolder.uri.path;
  }

  protected sendNotification<M extends string, P>(
    type: MessageProtocolNotificationType<M, P>,
    params: P
  ): void {
    const notification = type.notification(params);
    this._panel?.webview.postMessage(notification);
  }

  protected async sendRequest<M extends string, P, R>(
    type: MessageProtocolRequestType<M, P, R>,
    params: P
  ): Promise<R> {
    const request = type.request(params);
    return new Promise<R>((resolve, reject) => {
      const onResponse = (message: any) => {
        if (message) {
          if (message.method === request.method && message.id === request.id) {
            if (message.error !== undefined) {
              reject({ data: message.method, ...message.error });
              this._listeners.delete(onResponse);
            } else if (message.result !== undefined) {
              resolve(message.result);
              this._listeners.delete(onResponse);
            }
          }
        }
      };
      this._listeners.add(onResponse);
      this._panel?.webview.postMessage(request);
    });
  }

  protected sendResponse<M extends string, P, R>(
    type: MessageProtocolRequestType<M, P, R>,
    id: string | number,
    result: R
  ): void {
    const response = type.response(id, result);
    this._panel?.webview.postMessage(response);
  }

  protected getWebviewContent(
    webview: vscode.Webview,
    context: vscode.ExtensionContext
  ) {
    const jsMainUri = getWebviewUri(webview, context.extensionUri, [
      "out",
      "webviews",
      "game-webview.js",
    ]);
    const fontFamilyMono = "Courier Prime";
    const fontFormatMono = "truetype";
    const fontPathMono = getWebviewUri(webview, context.extensionUri, [
      "out",
      "data",
      "courier-prime.ttf",
    ]);
    const fontPathMonoBold = getWebviewUri(webview, context.extensionUri, [
      "out",
      "data",
      "courier-prime-bold.ttf",
    ]);
    const fontPathMonoItalic = getWebviewUri(webview, context.extensionUri, [
      "out",
      "data",
      "courier-prime-italic.ttf",
    ]);
    const fontPathMonoBoldItalic = getWebviewUri(
      webview,
      context.extensionUri,
      ["out", "data", "courier-prime-bold-italic.ttf"]
    );
    const styleNonce = getNonce();
    const scriptNonce = getNonce();
    return /*html*/ `
      <!DOCTYPE html>
      <html class="theme-dark se-theme" lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; connect-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; media-src ${webview.cspSource}; img-src ${webview.cspSource} https: data: blob: ; script-src 'nonce-${scriptNonce}'; worker-src blob:;">
          <title>Spark Game</title>
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
              padding: 0;
              margin: 0;
              overflow-y: hidden;
              overflow-x: hidden;
              min-height: 100%;
              position: relative;
            }

            body {
              position: absolute;
              inset: 0;
              padding: 0;
              margin: 0;
              opacity: 0;
              display: flex;
              flex-direction: column;
              font-family: var(--vscode-font-family);
              font-size: 12px;
              color: var(--vscode-foreground);
              background-color: var(--vscode-editor-background);
            }

            body.ready {
              opacity: 1;
              transition: 0.25s opacity;
            }
          </style>
        </head>
        <body>
          <spark-web-player toolbar play-button play-label="RUN"></spark-web-player>
          <script type="module" nonce="${scriptNonce}" src="${jsMainUri}"></script>
        </body>
      </html>
    `;
  }
}
