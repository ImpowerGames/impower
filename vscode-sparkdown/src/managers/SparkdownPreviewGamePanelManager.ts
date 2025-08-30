import { MessageProtocolNotificationType } from "@impower/spark-editor-protocol/src/protocols/MessageProtocolNotificationType";
import { MessageProtocolRequestType } from "@impower/spark-editor-protocol/src/protocols/MessageProtocolRequestType";
import { AddCompilerFileMessage } from "@impower/spark-editor-protocol/src/protocols/compiler/AddCompilerFileMessage";
import { ConfigureCompilerMessage } from "@impower/spark-editor-protocol/src/protocols/compiler/ConfigureCompilerMessage";
import { RemoveCompilerFileMessage } from "@impower/spark-editor-protocol/src/protocols/compiler/RemoveCompilerFileMessage";
import { UpdateCompilerFileMessage } from "@impower/spark-editor-protocol/src/protocols/compiler/UpdateCompilerFileMessage";
import { ScrolledEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ScrolledEditorMessage";
import { SelectedEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/SelectedEditorMessage";
import { ConfigureGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/ConfigureGameMessage";
import { GameExitedMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameExitedMessage";
import { GameReloadedMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameReloadedMessage";
import { GameStartedMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameStartedMessage";
import { LoadGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/LoadGameMessage";
import { ResizeGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/ResizeGameMessage";
import { ConnectedPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/ConnectedPreviewMessage";
import { HoveredOffPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/HoveredOffPreviewMessage";
import { HoveredOnPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/HoveredOnPreviewMessage";
import { LoadPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/LoadPreviewMessage";
import { ScrolledPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/ScrolledPreviewMessage";
import { SelectedPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/SelectedPreviewMessage";
import { DidChangeTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidChangeTextDocumentMessage";
import { DidChangeConfigurationMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeConfigurationMessage";
import { Connection } from "@impower/spark-engine/src/game/core/classes/Connection";
import * as vscode from "vscode";
import { ViewColumn, WebviewPanel, window } from "vscode";
import { getClientRange } from "../utils/getClientRange";
import { getEditor } from "../utils/getEditor";
import { getNonce } from "../utils/getNonce";
import { getServerRange } from "../utils/getServerRange";
import { getSparkdownPreviewConfig } from "../utils/getSparkdownPreviewConfig";
import { getUri } from "../utils/getUri";
import { getWebviewUri } from "../utils/getWebviewUri";
import { getWorkspaceAudioFile } from "../utils/getWorkspaceAudioFile";
import { getWorkspaceFileWatchers } from "../utils/getWorkspaceFileWatchers";
import { getWorkspaceFiles } from "../utils/getWorkspaceFiles";
import { getWorkspaceFontFile } from "../utils/getWorkspaceFontFile";
import { getWorkspaceImageFile } from "../utils/getWorkspaceImageFile";
import { getWorkspaceScriptFile } from "../utils/getWorkspaceScriptFile";
import { SparkProgramManager } from "./SparkProgramManager";

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

  protected _selectedVersion?: number;

  protected _listeners = new Set<(message: any) => void>();

  protected _gameRunning = false;

  async showPanel(
    context: vscode.ExtensionContext,
    document: vscode.TextDocument
  ) {
    if (document.languageId !== "sparkdown") {
      vscode.window.showErrorMessage(
        `You can only preview Sparkdown documents as a Game!`
      );
      return undefined;
    }
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
    document: vscode.TextDocument
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
    document: vscode.TextDocument,
    canvasHeight?: number
  ) {
    const fileWatchers = getWorkspaceFileWatchers();
    const files = await getWorkspaceFiles();
    const [scriptWatcher, imageWatcher, audioWatcher, fontWatcher] =
      fileWatchers;
    // Watch script files
    scriptWatcher.onDidCreate(async (fileUri) => {
      const file = await getWorkspaceScriptFile(fileUri);
      await this.sendRequest(AddCompilerFileMessage.type, { file });
    });
    scriptWatcher.onDidChange(async (fileUri) => {
      const file = await getWorkspaceScriptFile(fileUri);
      await this.sendRequest(UpdateCompilerFileMessage.type, { file });
    });
    scriptWatcher.onDidDelete(async (fileUri) => {
      const file = await getWorkspaceScriptFile(fileUri);
      await this.sendRequest(RemoveCompilerFileMessage.type, { file });
    });
    // Watch image files
    imageWatcher.onDidCreate(async (fileUri) => {
      const file = await getWorkspaceImageFile(fileUri);
      await this.sendRequest(AddCompilerFileMessage.type, { file });
    });
    imageWatcher.onDidChange(async (fileUri) => {
      const file = await getWorkspaceImageFile(fileUri);
      await this.sendRequest(UpdateCompilerFileMessage.type, { file });
    });
    imageWatcher.onDidDelete(async (fileUri) => {
      const file = await getWorkspaceImageFile(fileUri);
      await this.sendRequest(RemoveCompilerFileMessage.type, { file });
    });
    // Watch audio files
    audioWatcher.onDidCreate(async (fileUri) => {
      const file = await getWorkspaceAudioFile(fileUri);
      await this.sendRequest(AddCompilerFileMessage.type, { file });
    });
    audioWatcher.onDidChange(async (fileUri) => {
      const file = await getWorkspaceAudioFile(fileUri);
      await this.sendRequest(UpdateCompilerFileMessage.type, { file });
    });
    audioWatcher.onDidDelete(async (fileUri) => {
      const file = await getWorkspaceAudioFile(fileUri);
      await this.sendRequest(RemoveCompilerFileMessage.type, { file });
    });
    // Watch font files
    fontWatcher.onDidCreate(async (fileUri) => {
      const file = await getWorkspaceFontFile(fileUri);
      await this.sendRequest(AddCompilerFileMessage.type, { file });
    });
    fontWatcher.onDidChange(async (fileUri) => {
      const file = await getWorkspaceFontFile(fileUri);
      await this.sendRequest(UpdateCompilerFileMessage.type, { file });
    });
    fontWatcher.onDidDelete(async (fileUri) => {
      const file = await getWorkspaceFontFile(fileUri);
      await this.sendRequest(RemoveCompilerFileMessage.type, { file });
    });
    // Setup document and panel
    this._document = document;
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
      if (ConnectedPreviewMessage.type.isNotification(message)) {
        if (message.params.type === "game") {
          this._connected = true;
          await this.sendRequest(ConfigureCompilerMessage.type, {
            files,
          });
          this.loadDocument(document, canvasHeight);
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

  async loadDocument(document: vscode.TextDocument, canvasHeight?: number) {
    if (this._panel) {
      this._document = document;
      const editor = getEditor(document.uri);
      const visibleRange = editor?.visibleRanges[0];
      const selectedRange = editor?.selection;
      let program = await SparkProgramManager.instance.getOrCompile(
        document.uri
      );

      if (!program) {
        console.warn("no program loaded for: ", document.uri.toString());
        return;
      }

      if (program.context) {
        for (const [, structs] of Object.entries(program.context)) {
          for (const [, struct] of Object.entries(structs)) {
            if (struct.uri) {
              const uri = vscode.Uri.parse(struct.uri);
              struct.src = this._panel?.webview.asWebviewUri(uri).toString();
            }
          }
        }
      }
      if (canvasHeight != null) {
        await this.sendRequest(ResizeGameMessage.type, {
          height: canvasHeight,
        });
      }
      await this.sendRequest(LoadGameMessage.type, {
        program,
      });
      await this.sendRequest(ConfigureGameMessage.type, {
        startFrom: {
          file: document.uri.toString(),
          line: selectedRange?.start.line ?? 0,
        },
        workspace: vscode.workspace
          .getWorkspaceFolder(document.uri)
          ?.uri.toString(),
      });
      await this.sendRequest(LoadPreviewMessage.type, {
        type: "game",
        textDocument: {
          uri: document.uri.toString(),
          languageId: document.languageId,
          version: document.version,
          text: "",
        },
        visibleRange: visibleRange ? getServerRange(visibleRange) : undefined,
        selectedRange: selectedRange
          ? getServerRange(selectedRange)
          : undefined,
      });
    }
  }

  async notifyChangedActiveEditor(editor: vscode.TextEditor) {
    if (this._connected) {
      const document = editor.document;
      if (editor.document.uri.toString() !== this._document?.uri.toString()) {
        if (!vscode.debug.activeDebugSession && !this._gameRunning) {
          // In preview-mode, we load whatever document is in the active editor
          await this.loadDocument(document);
        }
      }
    }
  }

  notifyChangedTextDocument(
    document: vscode.TextDocument,
    contentChanges: readonly vscode.TextDocumentContentChangeEvent[]
  ) {
    if (document.uri.toString() === this._document?.uri.toString()) {
      this.sendNotification(DidChangeTextDocumentMessage.type, {
        textDocument: {
          uri: document.uri.toString(),
          version: document.version,
        },
        contentChanges: contentChanges.map((c) => ({
          range: getServerRange(c.range),
          text: c.text,
        })),
      });
    }
  }

  notifyConfiguredWorkspace() {
    if (this._document) {
      const configuration = getSparkdownPreviewConfig(
        getUri(this._document.uri.toString())
      );
      this.sendNotification(DidChangeConfigurationMessage.type, {
        settings: { ...configuration },
      });
    }
  }

  async notifySelectedEditor(
    document: vscode.TextDocument,
    selectedRange: vscode.Range,
    userEvent: boolean
  ) {
    if (document.uri.toString() === this._document?.uri.toString()) {
      this.sendNotification(SelectedEditorMessage.type, {
        textDocument: { uri: document.uri.toString() },
        selectedRange: getServerRange(selectedRange),
        userEvent,
        docChanged: this._selectedVersion !== document.version,
      });
      await this.sendRequest(ConfigureGameMessage.type, {
        startFrom: {
          file: document.uri.toString(),
          line: selectedRange?.start.line ?? 0,
        },
      });
      await this.sendRequest(LoadPreviewMessage.type, {
        type: "game",
        textDocument: {
          uri: document.uri.toString(),
          languageId: document.languageId,
          version: document.version,
          text: document.getText(),
        },
        selectedRange: getServerRange(selectedRange),
      });
      this._selectedVersion = document.version;
    }
  }

  notifyScrolledEditor(document: vscode.TextDocument, range: vscode.Range) {
    if (document.uri.toString() === this._document?.uri.toString()) {
      this.sendNotification(ScrolledEditorMessage.type, {
        textDocument: { uri: document.uri.toString() },
        visibleRange: getServerRange(range),
        target: "element",
      });
    }
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
          <spark-web-player toolbar play-label="RUN"></spark-web-player>
          <script type="module" nonce="${scriptNonce}" src="${jsMainUri}"></script>
        </body>
      </html>
    `;
  }
}
