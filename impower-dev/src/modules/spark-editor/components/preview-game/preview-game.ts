import {
  SelectedEditorMessage,
  SelectedEditorMethod,
  SelectedEditorParams,
} from "@impower/spark-editor-protocol/src/protocols/editor/SelectedEditorMessage";
import { ConfigureGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/ConfigureGameMessage";
import { EnterGameFullscreenModeMessage } from "@impower/spark-editor-protocol/src/protocols/game/EnterGameFullscreenModeMessage";
import { ExitGameFullscreenModeMessage } from "@impower/spark-editor-protocol/src/protocols/game/ExitGameFullscreenModeMessage";
import { FetchGameAssetMessage } from "@impower/spark-editor-protocol/src/protocols/game/FetchGameAssetMessage";
import {
  GameStartedMessage,
  GameStartedMethod,
  GameStartedParams,
} from "@impower/spark-editor-protocol/src/protocols/game/GameStartedMessage";
import {
  GameToggledFullscreenModeMessage,
  GameToggledFullscreenModeMethod,
  GameToggledFullscreenModeParams,
} from "@impower/spark-editor-protocol/src/protocols/game/GameToggledFullscreenModeMessage";
import { LoadGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/LoadGameMessage";
import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { MessageProtocolRequestType } from "@impower/spark-editor-protocol/src/protocols/MessageProtocolRequestType";
import { ConnectedPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/ConnectedPreviewMessage";
import { LoadPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/LoadPreviewMessage";
import {
  DidCompileTextDocumentMessage,
  DidCompileTextDocumentMethod,
  DidCompileTextDocumentParams,
} from "@impower/spark-editor-protocol/src/protocols/textDocument/DidCompileTextDocumentMessage";
import { NotificationMessage } from "@impower/spark-editor-protocol/src/types/base/NotificationMessage";
import { SparkProgram } from "../../../../../../packages/sparkdown/src/types/SparkProgram";
import { Component } from "../../../../../../packages/spec-component/src/component";
import { Workspace } from "../../workspace/Workspace";
import spec from "./_preview-game";

const SPARKDOWN_PLAYER_ORIGIN =
  process?.env?.["VITE_SPARKDOWN_PLAYER_ORIGIN"] || "";

export default class GamePreview extends Component(spec) {
  _loadingProgram?: SparkProgram;

  _loadedProgram?: SparkProgram;

  _startFromFile = "";

  _startFromLine = 0;

  _previewIsConnected = false;

  _listeners: Set<(message: any) => void> = new Set();

  _reloadAbortController: AbortController | null = null;

  _reloadDebounceTimer: any;

  override onConnected() {
    window.addEventListener("message", this.handleMessage);
    window.addEventListener(MessageProtocol.event, this.handleProtocol);
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("resizing", this.handleResizingSplitPane);
    window.addEventListener("resized", this.handleResizedSplitPane);
    document.addEventListener("fullscreenchange", this.handleFullscreenChange);
  }

  override onDisconnected() {
    window.removeEventListener("message", this.handleMessage);
    window.removeEventListener(MessageProtocol.event, this.handleProtocol);
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("resizing", this.handleResizingSplitPane);
    window.removeEventListener("resized", this.handleResizedSplitPane);
    document.removeEventListener(
      "fullscreenchange",
      this.handleFullscreenChange
    );
  }

  handleMessage = async (e: MessageEvent) => {
    if (e.origin !== SPARKDOWN_PLAYER_ORIGIN) {
      return;
    }

    const message = (e as MessageEvent).data;

    // Resolve request promises
    for (const listener of this._listeners) {
      listener(message);
    }

    // Forward messages from player to editor
    this.emit(MessageProtocol.event, message);

    // Once player is ready, send assets and load the game
    if (ConnectedPreviewMessage.type.is(message)) {
      this._previewIsConnected = true;
      const program = await Workspace.ls.getProgram();
      await this.debouncedReload(program);
    }
    // Fetch assets from workspace and respond to player
    if (FetchGameAssetMessage.type.is(message)) {
      const { path } = message.params;
      const uri = Workspace.fs.getUriFromPath(path);
      const buffer = await Workspace.fs.readFile({ file: { uri } });
      const response = FetchGameAssetMessage.type.response(message.id, {
        transfer: [buffer],
      });
      const iframe = this.refs.iframe as HTMLIFrameElement;
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage(
          response,
          SPARKDOWN_PLAYER_ORIGIN,
          response.result?.transfer
        );
      }
    }
  };

  protected handleProtocol = (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (
        typeof message.method === "string" &&
        (message.method.startsWith("game/") ||
          message.method.startsWith("preview/"))
      ) {
        // Forward messages from editor to player
        const iframe = this.refs.iframe as HTMLIFrameElement;
        if (iframe?.contentWindow) {
          iframe.contentWindow.postMessage(
            message,
            SPARKDOWN_PLAYER_ORIGIN,
            message.result?.transfer || message.params?.transfer
          );
        }
      }
      if (SelectedEditorMessage.type.is(message)) {
        this.handleSelectedEditor(message);
      }
      if (GameStartedMessage.type.is(message)) {
        this.handleGameStarted(message);
      }
      if (GameToggledFullscreenModeMessage.type.is(message)) {
        this.handleGameToggledFullscreenMode(message);
      }
      if (DidCompileTextDocumentMessage.type.is(message)) {
        this.handleDidCompileTextDocument(message);
      }
    }
  };

  handleDidCompileTextDocument = async (
    message: NotificationMessage<
      DidCompileTextDocumentMethod,
      DidCompileTextDocumentParams
    >
  ) => {
    if (this._previewIsConnected) {
      const { program } = message.params;
      await this.debouncedReload(program);
    }
  };

  handleSelectedEditor = async (
    message: NotificationMessage<SelectedEditorMethod, SelectedEditorParams>
  ) => {
    const { textDocument, selectedRange, docChanged } = message.params;
    if (textDocument.uri === this._startFromFile && !docChanged) {
      const newEntryLine = selectedRange?.start?.line ?? 0;
      if (newEntryLine !== this._startFromLine) {
        await this.configureGame();
        await this.loadPreview();
      }
    }
  };

  handleGameStarted = async (
    message: NotificationMessage<GameStartedMethod, GameStartedParams>
  ) => {
    Workspace.window.startGame();
  };

  handleGameToggledFullscreenMode = async (
    message: NotificationMessage<
      GameToggledFullscreenModeMethod,
      GameToggledFullscreenModeParams
    >
  ) => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      this.refs.iframe.requestFullscreen();
    }
  };

  handleFullscreenChange = async (e: Event) => {
    if (document.fullscreenElement) {
      await this.sendRequest(EnterGameFullscreenModeMessage.type, {});
    } else {
      await this.sendRequest(ExitGameFullscreenModeMessage.type, {});
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
    this.refs.iframe.style.pointerEvents = "none";
  };

  handleResizedSplitPane = async (e: Event) => {
    this.refs.iframe.style.pointerEvents = "auto";
  };

  override onStoreUpdate() {
    if (this._previewIsConnected) {
      const store = this.stores.workspace.current;
      const running = store?.preview?.modes?.game?.running;
      const editor = Workspace.window.getActiveEditorForPane("logic");
      if (!running && editor) {
        const { uri } = editor;
        if (uri && uri !== this._startFromFile) {
          this.configureGame();
        }
      }
    }
  }

  async debouncedReload(program: SparkProgram) {
    if (
      this._loadedProgram?.uri === this._loadingProgram?.uri &&
      this._loadedProgram?.version === this._loadingProgram?.version
    ) {
      await this.reload(program);
    }
  }

  async reload(program: SparkProgram) {
    this._loadingProgram = program;
    await this.loadGame(program);
    await this.configureGame();
    await this.loadPreview();
    this._loadedProgram = program;
  }

  async configureGame() {
    const editor = Workspace.window.getActiveEditorForPane("logic");
    if (editor) {
      const { uri, selectedRange } = editor;
      const startLine = selectedRange?.start?.line ?? 0;
      this._startFromFile = uri;
      this._startFromLine = startLine;
      const breakpoints: { file: string; line: number }[] = [];
      const workspace = Workspace.window.store.project.directory;
      if (Workspace.window.store.debug?.breakpoints) {
        Object.entries(Workspace.window.store.debug.breakpoints).forEach(
          ([uri, ranges]) => {
            ranges.forEach((range) =>
              breakpoints.push({ file: uri, line: range.start.line })
            );
          }
        );
      }
      const simulateFrom = Workspace.window.store.debug.simulateFrom;
      const startFrom = {
        file: uri,
        line: startLine,
      };
      await this.sendRequest(ConfigureGameMessage.type, {
        workspace,
        breakpoints,
        startFrom,
        simulateFrom,
      });
    }
  }

  async loadGame(program: SparkProgram) {
    await this.sendRequest(LoadGameMessage.type, {
      program,
    });
  }

  async loadPreview() {
    const store = this.stores.workspace.current;
    const projectId = store.project.id;
    const running = store.preview.modes.game.running;
    if (projectId && !running) {
      const editor = Workspace.window.getActiveEditorForPane("logic");
      if (editor) {
        const { uri, visibleRange, selectedRange } = editor;
        const files = await Workspace.fs.getFiles(projectId);
        const file = files[uri];
        if (file && file.text != null) {
          await this.sendRequest(LoadPreviewMessage.type, {
            type: "game",
            textDocument: {
              uri,
              languageId: "sparkdown",
              version: file.version,
              text: file.text,
            },
            visibleRange,
            selectedRange,
          });
        }
      }
    }
  }

  async sendRequest<M extends string, P, R>(
    type: MessageProtocolRequestType<M, P, R>,
    params: P,
    transfer?: Transferable[]
  ): Promise<R> {
    const iframe = this.refs.iframe as HTMLIFrameElement;
    const contentWindow = iframe.contentWindow;
    if (contentWindow) {
      const request = type.request(params);
      return new Promise<R>((resolve, reject) => {
        const onResponse = (message: any) => {
          if (message) {
            if (
              message.method === request.method &&
              message.id === request.id
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
  }

  async pageUp() {
    const editor = Workspace.window.getActiveEditorForPane("logic");
    if (editor) {
      const { uri, selectedRange } = editor;
      const program = this._loadedProgram;
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
    if (editor) {
      const { uri, selectedRange } = editor;
      const program = this._loadedProgram;
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
      const pathToLocationEntries = Object.entries(
        program.pathToLocation || {}
      );
      const index = this.getClosestSourceIndex(
        files,
        pathToLocationEntries,
        currentFile,
        currentLine
      );
      if (index == null) {
        return null;
      }
      const uuidToSourceEntry = pathToLocationEntries[index + offset];
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
