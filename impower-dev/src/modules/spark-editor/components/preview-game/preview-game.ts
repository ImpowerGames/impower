import { IFrameMessageConnection } from "@impower/jsonrpc/src/browser/classes/IFrameMessageConnection";
import { Port1MessageConnection } from "@impower/jsonrpc/src/browser/classes/Port1MessageConnection";
import { ChangedEditorBreakpointsMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ChangedEditorBreakpointsMessage";
import { ChangedEditorPinpointsMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ChangedEditorPinpointsMessage";
import { InitializeMessage } from "@impower/spark-editor-protocol/src/protocols/InitializeMessage";
import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { ExecuteCommandMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/ExecuteCommandMessage";
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
  private _resolveInitializing!: () => void;

  private _initializing? = new Promise<void>((resolve) => {
    this._resolveInitializing = resolve;
  });
  get initializing() {
    if (this._initialized) {
      return Promise.resolve();
    }
    return this._initializing;
  }

  protected _initialized = false;
  get initialized() {
    return this._initialized;
  }

  _iframeChannelConnection?: Port1MessageConnection;

  _reloadAbortController: AbortController | null = null;

  _reloadDebounceTimer: any;

  override onConnected() {
    window.addEventListener(MessageProtocol.event, this.handleProtocol);
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("resizing", this.handleResizingSplitPane);
    window.addEventListener("resized", this.handleResizedSplitPane);
    document.addEventListener("fullscreenchange", this.handleFullscreenChange);
    this.refs.iframe?.addEventListener("load", this.handleLoad);
  }

  override onDisconnected() {
    window.removeEventListener(MessageProtocol.event, this.handleProtocol);
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("resizing", this.handleResizingSplitPane);
    window.removeEventListener("resized", this.handleResizedSplitPane);
    document.removeEventListener(
      "fullscreenchange",
      this.handleFullscreenChange
    );
    this.refs.iframe?.removeEventListener("load", this.handleLoad);
  }

  protected handleLoad = async () => {
    if (this._iframeChannelConnection) {
      this._iframeChannelConnection.removeEventListener(
        "message",
        this.handleChannelMessage
      );
    }
    const iframe = this.refs.iframe as HTMLIFrameElement;
    const channel = new MessageChannel();
    const iframeWindowConnection = new IFrameMessageConnection(
      iframe,
      SPARKDOWN_PLAYER_ORIGIN
    );
    this._iframeChannelConnection = new Port1MessageConnection(channel.port1);
    await this._iframeChannelConnection.connect(
      iframeWindowConnection,
      channel.port2
    );
    this._iframeChannelConnection.addEventListener(
      "message",
      this.handleChannelMessage
    );
    const projectId = Workspace.window.store.project.id;
    if (!projectId) {
      console.error("No project loaded");
      return;
    }
    const files = await Workspace.fs.getFiles(projectId);
    const uri = Workspace.window.getOpenedDocumentUri();
    await this._iframeChannelConnection.sendRequest(InitializeMessage.type, {
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
    this._initialized = true;
    this._resolveInitializing();
  };

  handleChannelMessage = async (e: MessageEvent) => {
    const message = e.data;

    // Execute command and respond to iframe player
    if (ExecuteCommandMessage.type.is(message)) {
      const params = message.params;
      const result = await Workspace.fs.executeCommand(params);
      this._iframeChannelConnection?.sendResponse(message, result);
    }

    // Fetch assets from workspace and respond to iframe player
    if (FetchGameAssetMessage.type.is(message)) {
      const { path } = message.params;
      const uri = Workspace.fs.getUriFromPath(path);
      const buffer = await Workspace.fs.readFile({ file: { uri } });
      this._iframeChannelConnection?.sendResponse(
        message,
        {
          transfer: [buffer],
        },
        [buffer]
      );
    }

    // Forward messages from iframe player to editor
    this.emit(MessageProtocol.event, message);
  };

  protected handleProtocol = async (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;

      if (
        typeof message.method === "string" &&
        (message.method.startsWith("game/") ||
          message.method.startsWith("preview/") ||
          message.method.startsWith("workspace/") ||
          message.method.startsWith("textDocument/"))
      ) {
        // Forward messages from editor to iframe player
        if (!this._initialized) {
          await this.initializing;
        }
        this._iframeChannelConnection?.postMessage(message);
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
    const { locations, state, restarted, simulatePath, conditions, choices } =
      message.params;

    if (simulatePath) {
      const favoredConditions = conditions.map((c) => c.selected);
      const favoredChoices = choices.map((c) => c.selected);
      Workspace.window.setSimulationOptions(simulatePath, {
        favoredConditions,
        favoredChoices,
      });
    }

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
    if (this._initialized) {
      if (document.fullscreenElement) {
        await this._iframeChannelConnection?.sendRequest(
          EnterGameFullscreenModeMessage.type,
          {}
        );
      } else {
        await this._iframeChannelConnection?.sendRequest(
          ExitGameFullscreenModeMessage.type,
          {}
        );
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
      const simulationOptions = Workspace.window.store.debug.simulationOptions;
      return {
        workspace,
        startFrom,
        simulationOptions,
      };
    }
    return {};
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
