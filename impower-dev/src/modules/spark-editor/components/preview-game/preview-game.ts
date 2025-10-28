import { MessageProtocolRequestType } from "@impower/jsonrpc/src/classes/MessageProtocolRequestType";
import { ChangedEditorBreakpointsMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ChangedEditorBreakpointsMessage";
import { ChangedEditorPinpointsMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ChangedEditorPinpointsMessage";
import { InitializeMessage } from "@impower/spark-editor-protocol/src/protocols/InitializeMessage";
import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { ConnectedPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/ConnectedPreviewMessage";
import { ExecuteCommandMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/ExecuteCommandMessage";
import { isResponse } from "@impower/spark-editor-protocol/src/utils/isResponse";
import { EnterGameFullscreenModeMessage } from "@impower/spark-engine/src/game/core/classes/messages/EnterGameFullscreenModeMessage";
import { ExitGameFullscreenModeMessage } from "@impower/spark-engine/src/game/core/classes/messages/ExitGameFullscreenModeMessage";
import { FetchGameAssetMessage } from "@impower/spark-engine/src/game/core/classes/messages/FetchGameAssetMessage";
import { GameExecutedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameExecutedMessage";
import { GameExitedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameExitedMessage";
import { GameStartedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameStartedMessage";
import { GameToggledFullscreenModeMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameToggledFullscreenModeMessage";
import { DEFAULT_BUILTIN_DEFINITIONS } from "@impower/spark-engine/src/game/modules/DEFAULT_BUILTIN_DEFINITIONS";
import { DEFAULT_DESCRIPTION_DEFINITIONS } from "@impower/spark-engine/src/game/modules/DEFAULT_DESCRIPTION_DEFINITIONS";
import { DEFAULT_OPTIONAL_DEFINITIONS } from "@impower/spark-engine/src/game/modules/DEFAULT_OPTIONAL_DEFINITIONS";
import { DEFAULT_SCHEMA_DEFINITIONS } from "@impower/spark-engine/src/game/modules/DEFAULT_SCHEMA_DEFINITIONS";
import { SparkProgram } from "../../../../../../packages/sparkdown/src/compiler/types/SparkProgram";
import { Component } from "../../../../../../packages/spec-component/src/component";
import { Workspace } from "../../workspace/Workspace";
import spec from "./_preview-game";

const SPARKDOWN_PLAYER_ORIGIN =
  process?.env?.["VITE_SPARKDOWN_PLAYER_ORIGIN"] || "";

export default class GamePreview extends Component(spec) {
  private _resolveConnecting!: () => void;

  private _connecting? = new Promise<void>((resolve) => {
    this._resolveConnecting = resolve;
  });
  get connecting() {
    if (this._connected) {
      return Promise.resolve();
    }
    return this._connecting;
  }

  protected _connected = false;
  get connected() {
    return this._connected;
  }

  _listeners: Set<(message: any) => void> = new Set();

  _reloadAbortController: AbortController | null = null;

  _reloadDebounceTimer: any;

  override onConnected() {
    window.addEventListener("message", this.handleWindowMessage);
    window.addEventListener(MessageProtocol.event, this.handleProtocol);
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("resizing", this.handleResizingSplitPane);
    window.addEventListener("resized", this.handleResizedSplitPane);
    document.addEventListener("fullscreenchange", this.handleFullscreenChange);

    if (!this.refs.iframe) {
      this._connected = true;
    }
  }

  override onDisconnected() {
    window.removeEventListener("message", this.handleWindowMessage);
    window.removeEventListener(MessageProtocol.event, this.handleProtocol);
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("resizing", this.handleResizingSplitPane);
    window.removeEventListener("resized", this.handleResizedSplitPane);
    document.removeEventListener(
      "fullscreenchange",
      this.handleFullscreenChange
    );
  }

  handleWindowMessage = async (e: MessageEvent) => {
    if (e.origin !== SPARKDOWN_PLAYER_ORIGIN) {
      return;
    }

    const message = (e as MessageEvent).data;

    // Forward messages from iframe player to editor
    this.emit(MessageProtocol.event, message);

    // Fetch assets from workspace and respond to iframe player
    if (FetchGameAssetMessage.type.is(message)) {
      const { path } = message.params;
      const uri = Workspace.fs.getUriFromPath(path);
      const buffer = await Workspace.fs.readFile({ file: { uri } });
      this.sendResponse(
        FetchGameAssetMessage.type,
        message.id,
        {
          transfer: [buffer],
        },
        [buffer]
      );
    }

    // Execute command and respond to iframe player
    if (ExecuteCommandMessage.type.is(message)) {
      const params = message.params;
      const result = await Workspace.fs.executeCommand(params);
      this.sendResponse(ExecuteCommandMessage.type, message.id, result);
    }
  };

  protected handleProtocol = async (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;

      // Resolve request promises
      for (const listener of this._listeners) {
        listener(message);
      }

      // Once player is ready, send assets and load the game
      if (ConnectedPreviewMessage.type.is(message)) {
        const projectId = Workspace.window.store.project.id;
        if (projectId) {
          const files = await Workspace.fs.getFiles(projectId);
          const uri = Workspace.window.getOpenedDocumentUri();
          await this.sendRequest(InitializeMessage.type, {
            initializationOptions: {
              settings: Workspace.configuration.settings,
              files: Object.values(files),
              definitions: {
                builtins: DEFAULT_BUILTIN_DEFINITIONS,
                optionals: DEFAULT_OPTIONAL_DEFINITIONS,
                schemas: DEFAULT_SCHEMA_DEFINITIONS,
                descriptions: DEFAULT_DESCRIPTION_DEFINITIONS,
              },
              skipValidation: true,
              uri,
              ...this.getGameConfiguration(),
            },
            capabilities: {},
            rootUri: null,
            processId: 0,
          });
        }

        this._connected = true;
        this._resolveConnecting();
      }

      if (
        typeof message.method === "string" &&
        (message.method.startsWith("game/") ||
          message.method.startsWith("preview/") ||
          message.method.startsWith("workspace/") ||
          message.method.startsWith("textDocument/"))
      ) {
        // Forward messages from editor to iframe player
        if (!this._connected) {
          await this.connecting;
        }
        this.forwardMessage(message);
      }

      if (GameStartedMessage.type.is(message)) {
        this.handleGameStarted(message);
      }
      if (GameToggledFullscreenModeMessage.type.is(message)) {
        this.handleGameToggledFullscreenMode(message);
      }
      if (GameExecutedMessage.type.is(e.detail)) {
        this.handleGameExecuted(e.detail);
      }
      if (GameExitedMessage.type.is(e.detail)) {
        this.handleGameExited(e.detail);
      }
      if (ChangedEditorBreakpointsMessage.type.is(message)) {
        this.handleChangedEditorBreakpoints(message);
      }
      if (ChangedEditorPinpointsMessage.type.is(message)) {
        this.handleChangedEditorPinpoints(message);
      }
    }
  };

  forwardMessage(message: any) {
    const iframe = this.refs.iframe as HTMLIFrameElement;
    if (iframe?.contentWindow) {
      performance.mark(`start forward ${message.method}`);
      iframe.contentWindow.postMessage(
        message,
        SPARKDOWN_PLAYER_ORIGIN,
        message.result?.transfer || message.params?.transfer
      );
      performance.mark(`end forward ${message.method}`);
      performance.measure(
        `forward ${message.method}`,
        `start forward ${message.method}`,
        `end forward ${message.method}`
      );
    }
  }

  handleChangedEditorBreakpoints = async (
    message: ChangedEditorBreakpointsMessage.Notification
  ) => {
    // TODO
  };

  handleChangedEditorPinpoints = async (
    message: ChangedEditorPinpointsMessage.Notification
  ) => {
    // TODO
  };

  handleGameStarted = async (message: GameStartedMessage.Notification) => {
    Workspace.window.startGame();
  };

  handleGameToggledFullscreenMode = async (
    message: GameToggledFullscreenModeMessage.Notification
  ) => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      this.refs.preview.requestFullscreen();
    }
  };

  protected handleGameExecuted = (
    message: GameExecutedMessage.Notification
  ): void => {
    const { locations, state, restarted } = message.params;

    const executedSets: Record<string, Set<number>> = {};
    for (const location of locations) {
      executedSets[location.uri] ??= new Set();
      for (
        let i = location.range.start.line;
        i <= location.range.end.line;
        i++
      ) {
        executedSets[location.uri]?.add(i);
      }
    }
    const executedMap: Record<string, number[]> = {};
    for (const [uri, set] of Object.entries(executedSets)) {
      executedMap[uri] = Array.from(set);
    }
    Workspace.window.setHighlights(executedMap);

    // TODO:
    // if (simulateFrom && simulateFrom.file === this._textDocument?.uri) {
    //   this._view.dom.classList.toggle("pinpointError", simulation === "fail");
    // }

    if (state === "running" && !restarted) {
      const editor = Workspace.window.getActiveEditorForPane("logic");
      if (editor) {
        const { uri } = editor;
        const currentDocExecutedLines = executedMap[uri];
        const lastExecutedLine = currentDocExecutedLines?.at(-1);
        if (lastExecutedLine != null) {
          const range = {
            start: {
              line: lastExecutedLine,
              character: 0,
            },
            end: {
              line: lastExecutedLine,
              character: 0,
            },
          };
          Workspace.window.showDocument(uri, range, false);
        }
      }
    }
  };

  protected handleGameExited = (
    _message: GameExitedMessage.Notification
  ): void => {
    Workspace.window.setHighlights({});
  };

  handleFullscreenChange = async (e: Event) => {
    if (this._connected) {
      if (document.fullscreenElement) {
        await this.sendRequest(EnterGameFullscreenModeMessage.type, {});
      } else {
        await this.sendRequest(ExitGameFullscreenModeMessage.type, {});
      }
    }
  };

  handleKeyDown = async (e: KeyboardEvent) => {
    if (e.key === "PageUp") {
      await this.pageUp();
    }
    if (e.key === "PageDown") {
      await this.pageDown();
    }
  };

  handleResizingSplitPane = async (e: Event) => {
    if (this.refs.iframe) {
      this.refs.iframe.style.pointerEvents = "none";
    }
  };

  handleResizedSplitPane = async (e: Event) => {
    if (this.refs.iframe) {
      this.refs.iframe.style.pointerEvents = "auto";
    }
  };

  override onStoreUpdate() {
    const store = this.stores.workspace.current;
    const running = store?.preview?.modes?.game?.running;
    const editor = Workspace.window.getActiveEditorForPane("logic");
    if (!running && editor) {
      const { uri } = editor;
      if (uri) {
        // TODO: Preview new file?
      }
    }
  }

  getGameConfiguration() {
    const editor = Workspace.window.getActiveEditorForPane("logic");
    if (editor) {
      const { uri, selectedRange } = editor;
      const startLine = selectedRange?.start?.line ?? 0;
      const workspace = Workspace.window.store.project.directory;
      const startFrom = {
        file: uri,
        line: startLine,
      };
      const simulateChoices = Workspace.window.store.debug.simulateChoices;
      return {
        workspace,
        startFrom,
        simulateChoices,
      };
    }
    return {};
  }

  async sendRequest<M extends string, P, R>(
    type: MessageProtocolRequestType<M, P, R>,
    params: P,
    transfer?: Transferable[]
  ): Promise<R> {
    const request = type.request(params);
    const iframe = this.refs.iframe as HTMLIFrameElement;
    if (iframe) {
      // Post message to iframe
      const contentWindow = iframe.contentWindow;
      if (contentWindow) {
        return new Promise<R>((resolve, reject) => {
          const onResponse = (message: any) => {
            if (message) {
              if (
                message.method === request.method &&
                message.id === request.id &&
                isResponse<string, R>(message, request.method)
              ) {
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
          contentWindow.postMessage(request, SPARKDOWN_PLAYER_ORIGIN, transfer);
        });
      } else {
        throw new Error("content window not loaded");
      }
    } else {
      // Send event
      return new Promise<R>((resolve, reject) => {
        const onResponse = (message: any) => {
          if (message) {
            if (
              message.method === request.method &&
              message.id === request.id &&
              isResponse<string, R>(message, request.method)
            ) {
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
        this.emit(MessageProtocol.event, request);
      });
    }
  }

  sendResponse<M extends string, P, R>(
    type: MessageProtocolRequestType<M, P, R>,
    id: number | string,
    result: R,
    transfer?: Transferable[]
  ): void {
    const response = type.response(id, result);
    const iframe = this.refs.iframe as HTMLIFrameElement;
    if (iframe) {
      // Post message to iframe
      const contentWindow = iframe.contentWindow;
      if (contentWindow) {
        contentWindow.postMessage(response, SPARKDOWN_PLAYER_ORIGIN, transfer);
      } else {
        throw new Error("content window not loaded");
      }
    } else {
      // Send event
      this.emit(MessageProtocol.event, response);
    }
  }

  async pageUp() {
    const editor = Workspace.window.getActiveEditorForPane("logic");
    const program = await Workspace.ls.getProgram();
    if (editor) {
      const { uri, selectedRange } = editor;
      const currLine = selectedRange?.start.line ?? 0;
      if (program) {
        const prevSource = this.getPreviousSource(program, uri, currLine);
        if (prevSource && prevSource.file === uri) {
          const range = {
            start: {
              line: prevSource.line,
              character: 0,
            },
            end: {
              line: prevSource.line,
              character: 0,
            },
          };
          Workspace.window.showDocument(uri, range, true);
        }
      }
    }
  }

  async pageDown() {
    const editor = Workspace.window.getActiveEditorForPane("logic");
    const program = await Workspace.ls.getProgram();
    if (editor) {
      const { uri, selectedRange } = editor;
      const currLine = selectedRange?.start.line ?? 0;
      if (program) {
        const nextSource = this.getNextSource(program, uri, currLine);
        if (nextSource && nextSource.file === uri) {
          const range = {
            start: {
              line: nextSource.line,
              character: 0,
            },
            end: {
              line: nextSource.line,
              character: 0,
            },
          };
          Workspace.window.showDocument(uri, range, true);
        }
      }
    }
  }

  getPreviousSource(
    program: SparkProgram,
    currentFile: string | undefined,
    currentLine: number
  ) {
    return this.getOffsetSource(program, currentFile, currentLine, -1);
  }

  getNextSource(
    program: SparkProgram,
    currentFile: string | undefined,
    currentLine: number
  ) {
    return this.getOffsetSource(program, currentFile, currentLine, 1);
  }

  getOffsetSource(
    program: SparkProgram,
    currentFile: string | undefined,
    currentLine: number,
    offset: number
  ) {
    if (program) {
      const files = Object.keys(program.scripts);
      const pathLocationEntries = Object.entries(program.pathLocations || {});
      const index = this.getClosestSourceIndex(
        files,
        pathLocationEntries,
        currentFile,
        currentLine
      );
      if (index == null) {
        return null;
      }
      const uuidToSourceEntry = pathLocationEntries[index + offset];
      if (uuidToSourceEntry == null) {
        return null;
      }
      const [uuid, source] = uuidToSourceEntry;
      if (uuid == null) {
        return null;
      }
      const [fileIndex, lineIndex] = source;
      const file = files[fileIndex];
      const line = lineIndex;
      return { file, line };
    }
    return undefined;
  }

  getClosestSourceIndex(
    allFiles: string[],
    allPathToLocationEntries: [
      string,
      [number, number, number, number, number]
    ][],
    currentFile: string | undefined,
    currentLine: number
  ) {
    if (currentFile == null) {
      return null;
    }
    const fileIndex = allFiles.indexOf(currentFile);
    if (fileIndex < 0) {
      return null;
    }
    let closestIndex: number | null = null;
    for (let i = 0; i < allPathToLocationEntries.length; i++) {
      const entry = allPathToLocationEntries[i]!;
      const [, source] = entry;
      if (source) {
        const [currFileIndex, currStartLine] = source;
        if (currFileIndex === fileIndex && currStartLine === currentLine) {
          closestIndex = i;
          break;
        }
        if (currFileIndex === fileIndex && currStartLine > currentLine) {
          closestIndex = i - 1;
          break;
        }
        if (currFileIndex > fileIndex) {
          closestIndex = null;
          break;
        }
      }
    }
    return closestIndex;
  }
}
