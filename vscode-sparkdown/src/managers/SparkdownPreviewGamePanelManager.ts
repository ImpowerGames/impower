import { ConnectMessage } from "@impower/jsonrpc/src/common/classes/ConnectMessage";
import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import { FileChangeType } from "@impower/spark-editor-protocol/src/enums/FileChangeType";
import { InitializeMessage } from "@impower/spark-editor-protocol/src/protocols/InitializeMessage";
import { ScrolledEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ScrolledEditorMessage";
import { SelectedEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/SelectedEditorMessage";
import { ConnectedPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/ConnectedPreviewMessage";
import { DidChangeRouteTogglesMessage } from "@impower/spark-editor-protocol/src/protocols/preview/DidChangeRouteTogglesMessage";
import {
  SetRouteTogglesMessage,
  type RouteTogglesParams,
} from "@impower/spark-editor-protocol/src/protocols/preview/SetRouteTogglesMessage";
import { ShowDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/window/ShowDocumentMessage";
import { HoveredOffPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/HoveredOffPreviewMessage";
import { HoveredOnPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/HoveredOnPreviewMessage";
import { ScrolledPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/ScrolledPreviewMessage";
import { SelectedPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/SelectedPreviewMessage";
import { DidChangeTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidChangeTextDocumentMessage";
import { DidCloseTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidCloseTextDocumentMessage";
import { DidOpenTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidOpenTextDocumentMessage";
import { DidSelectTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidSelectTextDocumentMessage";
import {
  PreviewCompletionMessage,
  type PreviewCompletionParams,
} from "@impower/spark-editor-protocol/src/protocols/textDocument/PreviewCompletionMessage";
import { DidChangeConfigurationMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeConfigurationMessage";
import { DidChangeWatchedFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeWatchedFilesMessage";
import { ExecuteCommandMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/ExecuteCommandMessage";
import { Connection } from "@impower/spark-engine/src/game/core/classes/Connection";
import { GameExitedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameExitedMessage";
import { GameWorkerRestartedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameWorkerRestartedMessage";
import { GameReloadedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameReloadedMessage";
import { GameStartedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameStartedMessage";
import { ResizeGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/ResizeGameMessage";
import { DEFAULT_DESCRIPTION_DEFINITIONS } from "@impower/spark-engine/src/game/modules/DEFAULT_DESCRIPTION_DEFINITIONS";
import { DEFAULT_OPTIONAL_DEFINITIONS } from "@impower/spark-engine/src/game/modules/DEFAULT_OPTIONAL_DEFINITIONS";
import { DEFAULT_SCHEMA_DEFINITIONS } from "@impower/spark-engine/src/game/modules/DEFAULT_SCHEMA_DEFINITIONS";
import * as vscode from "vscode";
import { ViewColumn, WebviewPanel, window } from "vscode";
import { executeLanguageCommand } from "../utils/executeLanguageCommand";
import { getClientRange } from "../utils/getClientRange";
import { getEditor } from "../utils/getEditor";
import { getNonce } from "../utils/getNonce";
import { getServerRange } from "../utils/getServerRange";
import { getSparkdownPreviewConfig } from "../utils/getSparkdownPreviewConfig";
import { getUri } from "../utils/getUri";
import { getWebviewUri } from "../utils/getWebviewUri";
import { getWorkspaceFileWatchers } from "../utils/getWorkspaceFileWatchers";
import { getWorkspaceFiles } from "../utils/getWorkspaceFiles";

/** The empty message the game webview posts once its script has loaded. */
const isWebviewHello = (message: unknown) =>
  message != null &&
  typeof message === "object" &&
  Object.keys(message).length === 0;

/** Where the extension keeps which kinds the Game Preview's route list
 *  shows, for the author in every workspace. */
const ROUTE_TOGGLES_STATE_KEY = "sparkdown.gamePreview.routeToggles";

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

  /**
   * The script the preview is showing, which is the last one an editor
   * selection was reported for. Undefined until a selection has been
   * reported, and again once that file is closed.
   */
  get document(): vscode.TextDocument | undefined {
    const uri = this._selected?.uri;
    if (!uri) {
      return undefined;
    }
    return vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri);
  }

  _hovering = false;
  get hovering() {
    return this._hovering;
  }

  _connected = false;
  get connected() {
    return this._connected;
  }

  /** The project's files, read as the panel's webview loads so the player's
   *  initialization does not wait for the read after it has mounted. Taken by
   *  the first initialization; a reloaded webview reads them again. */
  protected _workspaceFilesReading?: ReturnType<typeof getWorkspaceFiles>;

  /** A file was created, changed or deleted since that read began, so what
   *  it found may be out of date: the initialization reads again. */
  protected _workspaceFilesStale = false;

  /** Counts the initializations begun, each webview script that loads, and
   *  the panel closing. Requests go to whichever webview the panel holds
   *  now, so an initialization overtaken by any of them (a webview reloaded
   *  while the first read was still under way) stops rather than initialize
   *  the new player as well. */
  protected _initializations = 0;

  _fileWatchersRegistered = false;

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

  protected _onDidDisposePanel = new vscode.EventEmitter<void>();
  /** Fires when the panel closes. */
  readonly onDidDisposePanel = this._onDidDisposePanel.event;

  protected _onDidConnectPanel = new vscode.EventEmitter<void>();
  /** Fires when the player in the panel has been initialized, the first time
   *  and each time the webview reloads. */
  readonly onDidConnectPanel = this._onDidConnectPanel.event;

  /**
   * Whether autocomplete highlights should be sent to the preview: it is
   * open, has been initialized and is not playing. The preview itself still
   * decides whether it takes part (a hidden panel does not).
   */
  get canPreviewCompletions() {
    return this._panel != null && this._connected && !this._gameRunning;
  }

  protected _startFrom?: {
    file: string;
    line: number;
  };

  async showPanel(
    context: vscode.ExtensionContext,
    document: vscode.TextDocument | undefined,
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
          vscode.window.tabGroups.activeTabGroup.activeTab,
        );
      }
      return this.createPanel(context, document);
    }
  }

  protected async createPanel(
    context: vscode.ExtensionContext,
    document: vscode.TextDocument | undefined,
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
    canvasHeight?: number,
  ) {
    // Setup document and panel
    this._panel = panel;
    panel.iconPath = {
      light: vscode.Uri.joinPath(context.extensionUri, "icon-lang.png"),
      dark: vscode.Uri.joinPath(context.extensionUri, "icon-lang.png"),
    };
    panel.onDidDispose(() => {
      this._connection.receive(
        GameExitedMessage.type.notification({ reason: "quit" }),
      );
      this._panel = undefined;
      this._connected = false;
      this._gameRunning = false;
      this._initializations += 1;
      this._onDidDisposePanel.fire();
    });
    // Read while the webview loads: its player asks for initialization only
    // once it has mounted, and on a large project the read is a few tenths
    // of a second it would otherwise wait for (#1875). Watching starts first,
    // so a file that changes meanwhile is not lost.
    this.registerFileWatchers();
    this.readWorkspaceFiles();
    panel.webview.html = this.getWebviewContent(panel.webview, context);
    panel.webview.onDidReceiveMessage(async (message) => {
      if (isWebviewHello(message)) {
        // A webview's script has loaded: on first load, or in place of a
        // webview vscode reloaded. Its player has not mounted yet, since the
        // script says so before registering it (`game-webview.ts`), so an
        // initialization still under way is for the webview this one
        // replaced, and would otherwise go on to initialize this one's player
        // before that player asks (#1874): it is overtaken. Answer, so the
        // panel activates after deserialization. Answering every message
        // instead doubled the traffic of a cold start, which sends a request
        // for each of the project's files.
        this._initializations += 1;
        panel.webview.postMessage({});
      }
      if (
        ConnectedPreviewMessage.type.isNotification(message) &&
        message.params.type === "game"
      ) {
        // The player mounted and asks to be initialized. This happens on
        // first load and also whenever the webview is reloaded by vscode
        // (e.g. when its tab is moved to another editor group or undocked
        // into a new window): each reload spins up a fresh webview instance
        // that must be initialized again. Nothing else the webview sends
        // starts an initialization. The empty message it posts when its
        // script has loaded used to start one too, so the player was
        // initialized twice at once: it read and compiled the whole project
        // twice, and the burst of programs that followed could leave the
        // preview black for good (#1874).
        this._connected = false;
        // Which kinds the route list shows, as the author left them in any
        // window.
        this.sendRequest(SetRouteTogglesMessage.type, {
          toggles: context.globalState.get<RouteTogglesParams>(
            ROUTE_TOGGLES_STATE_KEY,
            {},
          ),
        }).catch(console.error);
        try {
          await this.connectAndInitializeWebview(document, canvasHeight);
        } catch (e) {
          // The player waits for this, so a failure would otherwise leave
          // the panel black with nothing said (#1874).
          const reason =
            e instanceof Error ? e.message : (e as any)?.message ?? String(e);
          console.error("Game Preview could not start", e);
          vscode.window.showErrorMessage(
            `Game Preview could not start: ${reason}`,
          );
        }
      }
      if (DidChangeRouteTogglesMessage.type.isNotification(message)) {
        context.globalState.update(
          ROUTE_TOGGLES_STATE_KEY,
          message.params.toggles,
        );
      }
      if (ShowDocumentMessage.type.isRequest(message)) {
        // A line the route list links to.
        const { uri, selection, takeFocus } = message.params;
        let success = false;
        try {
          const doc = await vscode.workspace.openTextDocument(getUri(uri));
          const shown = getEditor(doc.uri);
          const editor = await vscode.window.showTextDocument(doc, {
            viewColumn: shown?.viewColumn,
            preserveFocus: takeFocus === false,
          });
          if (selection) {
            const range = getClientRange(selection);
            editor.selection = new vscode.Selection(range.start, range.end);
            editor.revealRange(
              range,
              vscode.TextEditorRevealType.InCenterIfOutsideViewport,
            );
          }
          success = true;
        } catch (e) {
          console.error(e);
        }
        this.sendResponse(ShowDocumentMessage.type, message.id, { success });
      }
      if (ExecuteCommandMessage.type.isRequest(message)) {
        const params = message.params;
        // Always answer. `executeLanguageCommand` returns undefined for an
        // unrecognized command and for a missing/non-string uri, and the
        // webview player awaits this request — skipping the response leaves
        // it waiting for the life of the panel (#332). `null` is the
        // JSON-RPC "no value" result.
        const result = await executeLanguageCommand(params);
        this.sendResponse(
          ExecuteCommandMessage.type,
          message.id,
          result ?? null,
        );
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
                false,
              );
            }
            editor.selection = new vscode.Selection(range.start, range.end);
            editor.revealRange(
              range,
              vscode.TextEditorRevealType.InCenterIfOutsideViewport,
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
      if (GameWorkerRestartedMessage.type.isNotification(message)) {
        // The player restarted its worker because the script did not yield
        // (#679). The line is in the Problems panel too, but the author did
        // not ask for anything, so say what happened.
        const { location } = message.params;
        const showLine = "Show Line";
        vscode.window
          .showWarningMessage(
            message.params.message,
            ...(location ? [showLine] : []),
          )
          .then(async (choice) => {
            if (choice !== showLine || !location) {
              return;
            }
            const doc = await vscode.workspace.openTextDocument(
              getUri(location.uri),
            );
            const editor = await vscode.window.showTextDocument(doc);
            const range = getClientRange(location.range);
            editor.selection = new vscode.Selection(range.start, range.end);
            editor.revealRange(
              range,
              vscode.TextEditorRevealType.InCenterIfOutsideViewport,
            );
          });
      }
      if (message) {
        for (const listener of this._listeners) {
          listener(message);
        }
        this._connection.receive(message);
      }
    });
  }

  async connectAndInitializeWebview(
    document: vscode.TextDocument | undefined,
    canvasHeight?: number,
  ) {
    const editor = document ? getEditor(document.uri) : undefined;
    const sparkdownConfig = vscode.workspace.getConfiguration("sparkdown");
    const settings = JSON.parse(JSON.stringify(sparkdownConfig));

    const initialization = ++this._initializations;
    const overtaken = () => initialization !== this._initializations;
    this.registerFileWatchers();
    // The read begun as the webview loaded, unless a file has changed since
    // it began, when what it found may be out of date.
    const reading =
      this._workspaceFilesReading && !this._workspaceFilesStale
        ? this._workspaceFilesReading
        : getWorkspaceFiles();
    this._workspaceFilesReading = undefined;
    const files = await reading;
    if (overtaken()) {
      return;
    }
    await this.sendRequest(ConnectMessage.type, {});
    if (overtaken()) {
      return;
    }
    await this.sendRequest(InitializeMessage.type, {
      initializationOptions: {
        settings,
        // Each file with the address the webview loads it from, which the
        // player would otherwise ask for file by file: a request each, before
        // it could start compiling (#1875).
        files: Object.values(files).map((file) => ({
          ...file,
          src: file.src ?? this.getWebviewSrc(file.uri),
        })),
        definitions: {
          // builtins now come from the implicitly-imported builtins prelude
          // (useBuiltinsPrelude is the compiler default).
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
    if (overtaken()) {
      return;
    }
    // Scripts open in an editor reach the preview as edits, so it must know
    // them as open: their saves are then not mistaken for outside changes to
    // the file, and their text is the editor's, unsaved edits included.
    for (const openDocument of vscode.workspace.textDocuments) {
      this.notifyOpenedTextDocument(openDocument);
    }
    if (canvasHeight != null) {
      await this.sendRequest(ResizeGameMessage.type, {
        height: canvasHeight,
      });
      if (overtaken()) {
        return;
      }
    }
    this._connected = true;
    this._onDidConnectPanel.fire();
  }

  /** Watch the project's files, once per manager lifetime: initialization
   *  runs again every time the webview is reloaded (e.g. moved or undocked),
   *  and re-creating watchers each time would leak them and duplicate
   *  listeners. Watching starts before the panel's first read of the files,
   *  so a file created, changed or deleted after that read began is not lost:
   *  the read is marked out of date, and the initialization reads again
   *  (#1874). Each change is also sent to the player as it happens; one that
   *  reaches it before its initialization waits for the project there. */
  protected registerFileWatchers() {
    if (this._fileWatchersRegistered) {
      return;
    }
    this._fileWatchersRegistered = true;
    const notify = (type: FileChangeType, fileUri: vscode.Uri) => {
      this._workspaceFilesStale = true;
      this.sendNotification(DidChangeWatchedFilesMessage.type, {
        changes: [{ type, uri: fileUri.toString() }],
      });
    };
    for (const fileWatcher of getWorkspaceFileWatchers()) {
      fileWatcher.onDidCreate((fileUri) =>
        notify(FileChangeType.Created, fileUri),
      );
      fileWatcher.onDidChange((fileUri) =>
        notify(FileChangeType.Changed, fileUri),
      );
      fileWatcher.onDidDelete((fileUri) =>
        notify(FileChangeType.Deleted, fileUri),
      );
    }
  }

  /** Start reading the project's files for the next initialization. */
  protected readWorkspaceFiles() {
    this._workspaceFilesStale = false;
    const reading = getWorkspaceFiles();
    // Awaited by the initialization, which reports a failure; a panel closed
    // before its player mounted never takes it.
    reading.catch(() => {});
    this._workspaceFilesReading = reading;
  }

  /** The address the panel's webview loads `uri` from, as
   *  `sparkdown.getFileSrc` answers it. */
  protected getWebviewSrc(uri: string) {
    return this._panel?.webview.asWebviewUri(vscode.Uri.parse(uri)).toString();
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

  notifyOpenedTextDocument(document: vscode.TextDocument) {
    if (!this.isProjectScript(document)) {
      return;
    }
    this.sendNotification(DidOpenTextDocumentMessage.type, {
      textDocument: {
        uri: document.uri.toString(),
        languageId: document.languageId,
        version: document.version,
        text: document.getText(),
      },
    });
  }

  notifyClosedTextDocument(document: vscode.TextDocument) {
    if (!this.isProjectScript(document)) {
      return;
    }
    this.sendNotification(DidCloseTextDocumentMessage.type, {
      textDocument: { uri: document.uri.toString() },
    });
  }

  /** A Sparkdown document that is one of the project's files, not a view of
   *  one (a diff or an older revision) under another scheme. */
  protected isProjectScript(document: vscode.TextDocument) {
    return (
      document.languageId === "sparkdown" &&
      vscode.workspace.getWorkspaceFolder(document.uri) !== undefined
    );
  }

  notifyChangedTextDocument(
    document: vscode.TextDocument,
    changes: readonly vscode.TextDocumentContentChangeEvent[],
  ) {
    if (!this.isProjectScript(document)) {
      return;
    }
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
    userEvent: boolean,
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

  /** An autocomplete list highlighted a suggestion, or closed. */
  notifyPreviewCompletion(params: PreviewCompletionParams) {
    this.sendNotification(PreviewCompletionMessage.type, params);
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
    params: P,
  ): void {
    const notification = type.notification(params);
    this._panel?.webview.postMessage(notification);
  }

  protected async sendRequest<M extends string, P, R>(
    type: MessageProtocolRequestType<M, P, R>,
    params: P,
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
    result: R,
  ): void {
    const response = type.response(id, result);
    this._panel?.webview.postMessage(response);
  }

  protected getWebviewContent(
    webview: vscode.Webview,
    context: vscode.ExtensionContext,
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
      ["out", "data", "courier-prime-bold-italic.ttf"],
    );
    const fontFamilyEmoji = "Noto Color Emoji";
    const fontFormatEmoji = "truetype";
    const fontPathEmoji = getWebviewUri(webview, context.extensionUri, [
      "out",
      "data",
      "noto-color-emoji.ttf",
    ]);
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
            @font-face {
              font-family: "${fontFamilyEmoji}";
              font-style: normal;
              font-weight: normal;
              font-display: swap;
              src: url("${fontPathEmoji}") format("${fontFormatEmoji}");
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
              display: flex;
              flex-direction: column;
              font-family: var(--vscode-font-family);
              font-size: 12px;
              color: var(--vscode-foreground);
              background-color: var(--vscode-editor-background);
            }

            /* The player stays hidden until it has something to show, which
               on a large project waits for it to mount and compile the whole
               project in its own worker; the bar says the preview is coming
               (#1221). It animates on the compositor, so it keeps moving
               while the page's script loads and the player mounts. */
            spark-web-player {
              opacity: 0;
            }

            body.ready spark-web-player {
              opacity: 1;
              transition: 0.25s opacity;
            }

            .loading {
              position: absolute;
              top: 0;
              left: 0;
              right: 0;
              height: 2px;
              overflow: hidden;
              pointer-events: none;
            }

            .loading::before {
              content: "";
              position: absolute;
              inset: 0;
              background-color: var(--vscode-progressBar-background);
              transform-origin: left;
              animation: loading-sweep 2.5s cubic-bezier(0.37, 0, 0.63, 1) infinite;
            }

            @keyframes loading-sweep {
              0% {
                transform: translateX(-50%) scaleX(0.5);
              }
              75%,
              100% {
                transform: translateX(100%) scaleX(0.5);
              }
            }

            body.ready .loading {
              display: none;
            }
          </style>
        </head>
        <body>
          <div class="loading" role="progressbar" aria-busy="true" aria-label="Loading Game Preview"></div>
          <spark-web-player toolbar play-button play-label="RUN"></spark-web-player>
          <script type="module" nonce="${scriptNonce}" src="${jsMainUri}"></script>
        </body>
      </html>
    `;
  }
}
