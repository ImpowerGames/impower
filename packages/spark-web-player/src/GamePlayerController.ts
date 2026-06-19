import {
  ProtocolObserver,
  sendProtocolMessage,
} from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { ConnectedPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/ConnectedPreviewMessage";
import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import { ContinueGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/ContinueGameMessage";
import { DisableGameDebugMessage } from "@impower/spark-engine/src/game/core/classes/messages/DisableGameDebugMessage";
import { EnableGameDebugMessage } from "@impower/spark-engine/src/game/core/classes/messages/EnableGameDebugMessage";
import { EnterGameFullscreenModeMessage } from "@impower/spark-engine/src/game/core/classes/messages/EnterGameFullscreenModeMessage";
import { ExitGameFullscreenModeMessage } from "@impower/spark-engine/src/game/core/classes/messages/ExitGameFullscreenModeMessage";
import { GameAutoAdvancedToContinueMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameAutoAdvancedToContinueMessage";
import { GameAwaitingInteractionMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameAwaitingInteractionMessage";
import { GameChosePathToContinueMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameChosePathToContinueMessage";
import { GameClickedToContinueMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameClickedToContinueMessage";
import { GameEncounteredRuntimeErrorMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameEncounteredRuntimeError";
import {
  GameExecutedMessage,
  GameExecutedParams,
} from "@impower/spark-engine/src/game/core/classes/messages/GameExecutedMessage";
import { GameExitedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameExitedMessage";
import { GameExitedThreadMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameExitedThreadMessage";
import { GameFinishedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameFinishedMessage";
import { GameHitBreakpointMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameHitBreakpointMessage";
import { GamePreviewedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GamePreviewedMessage";
import { GameReloadedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameReloadedMessage";
import { GameResizedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameResizedMessage";
import { GameStartedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameStartedMessage";
import { GameStartedThreadMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameStartedThreadMessage";
import { GameSteppedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameSteppedMessage";
import { GameToggledFullscreenModeMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameToggledFullscreenModeMessage";
import { GetGameEvaluationContextMessage } from "@impower/spark-engine/src/game/core/classes/messages/GetGameEvaluationContextMessage";
import { GetGamePossibleBreakpointLocationsMessage } from "@impower/spark-engine/src/game/core/classes/messages/GetGamePossibleBreakpointLocationsMessage";
import { GetGameScriptsMessage } from "@impower/spark-engine/src/game/core/classes/messages/GetGameScriptsMessage";
import { GetGameStackTraceMessage } from "@impower/spark-engine/src/game/core/classes/messages/GetGameStackTraceMessage";
import { GetGameThreadsMessage } from "@impower/spark-engine/src/game/core/classes/messages/GetGameThreadsMessage";
import { GetGameVariablesMessage } from "@impower/spark-engine/src/game/core/classes/messages/GetGameVariablesMessage";
import { PauseGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/PauseGameMessage";
import { ResizeGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/ResizeGameMessage";
import { RestartGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/RestartGameMessage";
import { SetGameBreakpointsMessage } from "@impower/spark-engine/src/game/core/classes/messages/SetGameBreakpointsMessage";
import { SetGameDataBreakpointsMessage } from "@impower/spark-engine/src/game/core/classes/messages/SetGameDataBreakpointsMessage";
import { SetGameFunctionBreakpointsMessage } from "@impower/spark-engine/src/game/core/classes/messages/SetGameFunctionBreakpointsMessage";
import { StartGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/StartGameMessage";
import { StepGameClockMessage } from "@impower/spark-engine/src/game/core/classes/messages/StepGameClockMessage";
import { StepGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/StepGameMessage";
import { StopGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/StopGameMessage";
import { UnpauseGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/UnpauseGameMessage";
import { ErrorType } from "@impower/spark-engine/src/game/core/enums/ErrorType";
import { DocumentLocation } from "@impower/spark-engine/src/game/core/types/DocumentLocation";
import { findClosestPath } from "@impower/spark-engine/src/game/core/utils/findClosestPath";
import { CompiledProgramMessage } from "@impower/sparkdown/src/compiler/classes/messages/CompiledProgramMessage";
import { RemovedCompilerFileMessage } from "@impower/sparkdown/src/compiler/classes/messages/RemovedCompilerFileMessage";
import { SelectedCompilerDocumentMessage } from "@impower/sparkdown/src/compiler/classes/messages/SelectedCompilerDocumentMessage";
import { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { SparkdownWorkspace } from "@impower/sparkdown/src/workspace/classes/SparkdownWorkspace";
import { Application } from "./app/Application";
import { conflate } from "./utils/conflate";
import { debounce } from "./utils/debounce";
import { profile } from "./utils/profile";

const COMMON_ASPECT_RATIOS = [
  [16, 9],
  [9, 16],
  [4, 3],
  [3, 4],
  [21, 9],
  [1, 1],
] as const;

const MIN_HEIGHT = 100;

// Middleware for the controller's ProtocolObserver: bracket every protocol
// handler with performance marks so message-handling time shows up in the
// profiler. Async so the "end" mark lands after the handler actually settles.
const profileMessageHandling =
  (handler: (message: any) => any) => async (message: { method: string }) => {
    profile("start", message.method);
    try {
      return await handler(message);
    } finally {
      profile("end", message.method);
    }
  };

// Module-level singleton. Set via setWorkspace() before any controller is
// constructed. Replaces SparkWebPlayer.workspace (the static field on the
// legacy spec-component class).
let workspace: SparkdownWorkspace | undefined;

export function setWorkspace(ws: SparkdownWorkspace): void {
  workspace = ws;
}

export interface GamePlayerRefs {
  viewport: HTMLElement;
  gameBackground: HTMLElement;
  gameView: HTMLElement;
  gameUI: HTMLElement;
  game: HTMLElement;
  playButton: HTMLElement | null;
  toolbar: HTMLElement | null;
  leftItems: HTMLElement | null;
  locationItems: HTMLElement | null;
  launchStateIcon: HTMLElement | null;
  launchInfo: HTMLElement | null;
  launchLabel: HTMLElement | null;
  executionInfo: HTMLElement | null;
  connectionLabel: HTMLElement | null;
  executedLabel: HTMLElement | null;
  sizeLabel: HTMLElement | null;
  aspectRatioLabel: HTMLElement | null;
  resetButton: HTMLElement | null;
  fullscreenButton: HTMLElement | null;
}

export class GamePlayerController {
  protected host: HTMLElement;
  protected refs: GamePlayerRefs;

  _audioContext?: AudioContext;
  _game?: Game;
  _app?: Application;
  _debugging = false;
  _program?: SparkProgram;
  _checkpoint?: string;

  _options?: {
    workspace?: string;
    startFrom?: { file: string; line: number } | null;
    simulationOptions?: Record<
      string,
      {
        favoredConditions?: (boolean | undefined)[];
        favoredChoices?: (number | undefined)[];
      }
    >;
    previewFrom?: { file: string; line: number };
    breakpoints?: { file: string; line: number }[];
    functionBreakpoints?: { name: string }[];
    dataBreakpoints?: { dataId: string }[];
  };

  private _resolveLoadingInitialProgram!: () => void;
  private _loadingInitialProgram?: Promise<void> = new Promise<void>(
    (resolve) => {
      this._resolveLoadingInitialProgram = resolve;
    },
  );
  get loadingInitialProgram() {
    if (this._program) {
      return Promise.resolve();
    }
    return this._loadingInitialProgram;
  }

  _isResizing = false;
  _resizeStartY = 0;
  _resizeStartHeight = 0;
  _gameResizeObserver?: ResizeObserver;

  // Owns every protocol-bus subscription; `dispose()` detaches them all. The
  // profiling middleware instruments each handler.
  protected _protocols = new ProtocolObserver(profileMessageHandling);

  constructor(host: HTMLElement, refs: GamePlayerRefs) {
    this.host = host;
    this.refs = refs;
  }

  setup(): void {
    this.registerProtocolHandlers();
    window.addEventListener("contextmenu", this.handleContextMenu, true);
    window.addEventListener("dragstart", this.handleDragStart);
    window.addEventListener("resize", this.handleResize);
    this.refs.playButton?.addEventListener("click", this.handleClickPlayButton);
    this.refs.toolbar?.addEventListener(
      "pointerdown",
      this.handlePointerDownToolbar,
    );
    this.refs.toolbar?.addEventListener(
      "pointermove",
      this.handlePointerMoveToolbar,
    );
    this.refs.toolbar?.addEventListener(
      "pointerup",
      this.handlePointerUpToolbar,
    );
    this.refs.fullscreenButton?.addEventListener(
      "pointerdown",
      this.handlePointerDownFullscreenButton,
    );
    this.refs.fullscreenButton?.addEventListener(
      "pointerup",
      this.handlePointerUpFullscreenButton,
    );
    this.refs.fullscreenButton?.addEventListener(
      "click",
      this.handleClickFullscreenButton,
    );
    this._gameResizeObserver = new ResizeObserver(this.handleResize);
    this._gameResizeObserver.observe(this.refs.game);
    this.updateSizeAndAspectRatioDisplay();
    sendProtocolMessage(
      ConnectedPreviewMessage.type.notification({ type: "game" }),
      this.host,
    );
  }

  dispose(): void {
    this._protocols.dispose();
    window.removeEventListener("contextmenu", this.handleContextMenu);
    window.removeEventListener("dragstart", this.handleDragStart);
    window.removeEventListener("resize", this.handleResize);
    this.refs.playButton?.removeEventListener(
      "click",
      this.handleClickPlayButton,
    );
    this.refs.toolbar?.removeEventListener(
      "pointerdown",
      this.handlePointerDownToolbar,
    );
    this.refs.toolbar?.removeEventListener(
      "pointermove",
      this.handlePointerMoveToolbar,
    );
    this.refs.toolbar?.removeEventListener(
      "pointerup",
      this.handlePointerUpToolbar,
    );
    this.refs.fullscreenButton?.removeEventListener(
      "pointerdown",
      this.handlePointerDownFullscreenButton,
    );
    this.refs.fullscreenButton?.removeEventListener(
      "pointerup",
      this.handlePointerUpFullscreenButton,
    );
    this.refs.fullscreenButton?.removeEventListener(
      "click",
      this.handleClickFullscreenButton,
    );
    this._gameResizeObserver?.disconnect();
  }

  protected async hidePlayButton() {
    if (this.refs.playButton) {
      this.refs.playButton.style.pointerEvents = "none";
      this.refs.playButton.style.opacity = "0";
      const animations = this.refs.playButton.getAnimations();
      await Promise.allSettled(
        animations.map((animation) => animation.finished),
      );
      this.refs.playButton.style.display = "none";
    }
  }

  protected async showPlayButton() {
    if (this.refs.playButton) {
      this.refs.playButton.style.pointerEvents = "";
      this.refs.playButton.style.opacity = "";
      this.refs.playButton.style.display = "";
    }
  }

  getRelativeFilePath(path: string | undefined) {
    if (!path) {
      return path;
    }
    const ws = this._options?.workspace;
    const relativePath =
      ws && path.startsWith(ws) ? path.slice(ws.length + 1) : path;
    const extIndex = relativePath.lastIndexOf(".");
    if (extIndex < 0) {
      return relativePath;
    }
    return relativePath.slice(0, extIndex);
  }

  protected updateLaunchStateIcon() {
    const icon = this._app?.paused
      ? "pause"
      : this._game?.state === "running"
        ? "play"
        : "preview";
    this.refs.launchStateIcon?.setAttribute("icon", icon);
  }

  protected updateExecutionLabels(params?: GameExecutedParams) {
    if (!this.refs.locationItems || !this.refs.leftItems) {
      return;
    }
    this.refs.locationItems.classList.toggle(
      "error",
      params?.simulation === "fail",
    );
    const firstExecutedLocation = params?.locations?.[0];
    const lastExecutedLocation = params?.locations?.at(-1);
    if (!params || !this._game) {
      this.refs.leftItems.hidden = true;
      return;
    }
    this.refs.leftItems.hidden = false;
    if (this._program && params.simulatePath && params.simulation === "fail") {
      const simulateFromLocation = Game.pathToDocumentLocation(
        this._program,
        params.simulatePath,
      );
      if (simulateFromLocation) {
        const filePath = this.getRelativeFilePath(simulateFromLocation.uri);
        const lineNumber = simulateFromLocation.range.start.line + 1;
        if (this.refs.launchLabel) {
          this.refs.launchLabel.textContent = `${filePath} : ${lineNumber}`;
        }
      } else if (this.refs.launchLabel) {
        this.refs.launchLabel.textContent = "";
      }
    } else if (firstExecutedLocation) {
      const filePath = this.getRelativeFilePath(firstExecutedLocation.uri);
      const lineNumber = firstExecutedLocation.range.start.line + 1;
      if (this.refs.launchLabel) {
        this.refs.launchLabel.textContent = `${filePath} : ${lineNumber}`;
      }
    } else if (this.refs.launchLabel) {
      this.refs.launchLabel.textContent = "";
    }
    if (this._program && params.startPath && params.simulation === "fail") {
      const startFromLocation = Game.pathToDocumentLocation(
        this._program,
        params.startPath,
      );
      if (startFromLocation && this.refs.connectionLabel) {
        const filePath = this.getRelativeFilePath(startFromLocation.uri);
        const lineNumber = startFromLocation.range.end.line + 1;
        this.refs.connectionLabel.replaceChildren();
        this.refs.connectionLabel.appendChild(document.createTextNode("→"));
        if (params.choices.length > 0) {
          params.choices.forEach((choice) => {
            const choiceEl = document.createElement("div");
            choiceEl.textContent = `  [ ${choice.selected + 1} ]  `;
            this.refs.connectionLabel!.appendChild(choiceEl);
            this.refs.connectionLabel!.appendChild(
              document.createTextNode("→"),
            );
          });
        }
        this.refs.connectionLabel.appendChild(document.createTextNode(" 🞪 →"));
        if (this.refs.executedLabel) {
          this.refs.executedLabel.textContent = `${filePath} : ${lineNumber}`;
        }
        if (this.refs.executionInfo) {
          this.refs.executionInfo.hidden = false;
        }
      } else if (this.refs.executionInfo) {
        this.refs.executionInfo.hidden = true;
      }
    } else if (
      lastExecutedLocation &&
      (firstExecutedLocation?.uri !== lastExecutedLocation.uri ||
        firstExecutedLocation?.range.start.line !==
          lastExecutedLocation.range.end.line)
    ) {
      const filePath = this.getRelativeFilePath(lastExecutedLocation.uri);
      const lineNumber = lastExecutedLocation.range.end.line + 1;
      if (this.refs.connectionLabel) {
        this.refs.connectionLabel.replaceChildren();
        this.refs.connectionLabel.appendChild(document.createTextNode("→"));
        if (params.choices.length > 0) {
          params.choices.forEach((choice) => {
            const choiceEl = document.createElement("div");
            choiceEl.textContent = `  [ ${choice.selected + 1} ]  `;
            this.refs.connectionLabel!.appendChild(choiceEl);
            this.refs.connectionLabel!.appendChild(
              document.createTextNode("→"),
            );
          });
        }
      }
      if (this.refs.executedLabel) {
        this.refs.executedLabel.textContent = `${filePath} : ${lineNumber}`;
      }
      if (this.refs.executionInfo) {
        this.refs.executionInfo.hidden = false;
      }
    } else if (this.refs.executionInfo) {
      this.refs.executionInfo.hidden = true;
    }
  }

  getAspectRatio(width: number, height: number) {
    for (const [w, h] of COMMON_ASPECT_RATIOS) {
      const expectedHeight = (width * h) / w;
      if (Math.round(height) === Math.round(expectedHeight)) {
        return `${w}:${h}`;
      }
    }
    return null;
  }

  updateSizeAndAspectRatioDisplay() {
    const rect = this.refs.game.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const ratio = this.getAspectRatio(width, height);
    const sizeLabel = `${Math.round(width)} × ${Math.round(height)}`;
    const aspectRatioLabel = ratio ? `(${ratio})` : "";
    if (this.refs.sizeLabel) {
      this.refs.sizeLabel.textContent = sizeLabel;
    }
    if (this.refs.aspectRatioLabel) {
      this.refs.aspectRatioLabel.textContent = aspectRatioLabel;
    }
  }

  protected handleResize = () => {
    this.updateSizeAndAspectRatioDisplay();
  };

  protected handleContextMenu = (e: Event) => {
    e.preventDefault();
  };

  protected handleDragStart = (e: DragEvent) => {
    e.preventDefault();
  };

  protected handlePointerDownToolbar = (e: PointerEvent) => {
    this._isResizing = true;
    this._resizeStartY = e.clientY;
    this._resizeStartHeight = this.refs.game.offsetHeight;

    document.body.style.cursor = "ns-resize";

    const width = this.refs.game.offsetWidth;
    let minDiff = Infinity;
    let snapped = false;

    for (const [w, h] of COMMON_ASPECT_RATIOS) {
      const expectedHeight = Math.round((width * h) / w);
      const diff = Math.abs(expectedHeight - this._resizeStartHeight);
      if (diff < 10 && diff < minDiff) {
        minDiff = diff;
        snapped = true;
      }
    }

    this.refs.toolbar?.classList.toggle("snapping", snapped);

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  protected handlePointerMoveToolbar = (e: PointerEvent) => {
    if (!this._isResizing || !this.refs.toolbar) {
      return;
    }
    const dy = e.clientY - this._resizeStartY;
    let newHeight = Math.round(this._resizeStartHeight + dy);

    const maxHeight = window.innerHeight - this.refs.toolbar.offsetHeight;
    newHeight = Math.max(MIN_HEIGHT, Math.min(maxHeight, newHeight));

    const width = this.refs.game.offsetWidth;
    let closestMatch = newHeight;
    let minDiff = Infinity;
    let snapped = false;

    for (const [w, h] of COMMON_ASPECT_RATIOS) {
      const expectedHeight = Math.round((width * h) / w);
      const diff = Math.abs(expectedHeight - newHeight);
      if (diff < 10 && diff < minDiff) {
        closestMatch = expectedHeight;
        minDiff = diff;
        snapped = true;
      }
    }

    if (closestMatch === maxHeight) {
      this.refs.game.style.height = "";
      this.refs.game.style.minHeight = "";
    } else {
      this.refs.game.style.height = `${closestMatch}px`;
      this.refs.game.style.minHeight = `${closestMatch}px`;
    }

    this.refs.toolbar.classList.toggle("snapping", snapped);

    this.updateSizeAndAspectRatioDisplay();

    sendProtocolMessage(
      GameResizedMessage.type.notification({ width, height: closestMatch }),
      this.host,
    );
  };

  protected handlePointerUpToolbar = (e: PointerEvent) => {
    this._isResizing = false;
    document.body.style.cursor = "";
    this.refs.toolbar?.classList.remove("snapping");
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  protected handleClickPlayButton = async () => {
    if (!this._audioContext || this._audioContext.state !== "running") {
      const audioContext = new AudioContext();
      if (audioContext.state === "running") {
        this._audioContext = audioContext;
      }
    }
    await this.startGameAndApp();
    this.hidePlayButton();
    sendProtocolMessage(GameStartedMessage.type.notification({}), this.host);
  };

  protected handlePointerDownFullscreenButton = (e: PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.stopPropagation();
  };

  protected handlePointerUpFullscreenButton = (e: PointerEvent) => {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  protected handleClickFullscreenButton = async () => {
    sendProtocolMessage(
      GameToggledFullscreenModeMessage.type.notification({}),
      this.host,
    );
  };

  // Wire every protocol message to its handler through the ProtocolObserver:
  // `onNotification` for notifications and `onRequest` for requests. `onRequest`
  // infers the required return type from the message type's own `response()`,
  // so forgetting to `return` the response is a compile error rather than a
  // silently-dropped reply; replies are dispatched on `this.host` so the
  // player-iframe relay (which keys on `event.target !== window`) forwards them
  // to the editor.
  protected registerProtocolHandlers(): void {
    const p = this._protocols;

    // Notifications (fire-and-forget, no response).
    p.onNotification(
      SelectedCompilerDocumentMessage.type,
      this.handleSelectedCompilerDocument,
    );
    p.onNotification(
      RemovedCompilerFileMessage.type,
      this.handleRemovedCompilerFile,
    );
    p.onNotification(CompiledProgramMessage.type, this.handleCompiledProgram);

    // Requests (handler must return the message's Response; replied on host).
    p.onRequest(ResizeGameMessage.type, this.handleResizeGame, this.host);
    p.onRequest(
      SetGameBreakpointsMessage.type,
      this.handleSetGameBreakpoints,
      this.host,
    );
    p.onRequest(
      SetGameFunctionBreakpointsMessage.type,
      this.handleSetGameFunctionBreakpoints,
      this.host,
    );
    p.onRequest(
      SetGameDataBreakpointsMessage.type,
      this.handleSetGameDataBreakpoints,
      this.host,
    );
    p.onRequest(
      EnableGameDebugMessage.type,
      this.handleEnableGameDebug,
      this.host,
    );
    p.onRequest(
      DisableGameDebugMessage.type,
      this.handleDisableGameDebug,
      this.host,
    );
    p.onRequest(StartGameMessage.type, this.handleStartGame, this.host);
    p.onRequest(StopGameMessage.type, this.handleStopGame, this.host);
    p.onRequest(RestartGameMessage.type, this.handleRestartGame, this.host);
    p.onRequest(PauseGameMessage.type, this.handlePauseGame, this.host);
    p.onRequest(UnpauseGameMessage.type, this.handleUnpauseGame, this.host);
    p.onRequest(StepGameClockMessage.type, this.handleStepGameClock, this.host);
    p.onRequest(StepGameMessage.type, this.handleStepGame, this.host);
    p.onRequest(ContinueGameMessage.type, this.handleContinueGame, this.host);
    p.onRequest(
      GetGameScriptsMessage.type,
      this.handleGetGameScripts,
      this.host,
    );
    p.onRequest(
      GetGamePossibleBreakpointLocationsMessage.type,
      this.handleGetGamePossibleBreakpointLocations,
      this.host,
    );
    p.onRequest(
      GetGameStackTraceMessage.type,
      this.handleGetGameStackTrace,
      this.host,
    );
    p.onRequest(
      GetGameEvaluationContextMessage.type,
      this.handleGetGameEvaluationContext,
      this.host,
    );
    p.onRequest(
      GetGameVariablesMessage.type,
      this.handleGetGameVariables,
      this.host,
    );
    p.onRequest(
      GetGameThreadsMessage.type,
      this.handleGetGameThreads,
      this.host,
    );
    p.onRequest(
      EnterGameFullscreenModeMessage.type,
      this.handleEnterGameFullscreenMode,
      this.host,
    );
    p.onRequest(
      ExitGameFullscreenModeMessage.type,
      this.handleExitGameFullscreenMode,
      this.host,
    );
  }

  protected handleEnterGameFullscreenMode = async (
    message: EnterGameFullscreenModeMessage.Request,
  ) => {
    this.refs.viewport.classList.add("fullscreen");
    return EnterGameFullscreenModeMessage.type.response(message.id, {});
  };

  protected handleExitGameFullscreenMode = async (
    message: ExitGameFullscreenModeMessage.Request,
  ) => {
    this.refs.viewport.classList.remove("fullscreen");
    return ExitGameFullscreenModeMessage.type.response(message.id, {});
  };

  protected handleSelectedCompilerDocument = async (
    message: SelectedCompilerDocumentMessage.Notification,
  ) => {
    const { textDocument, selectedRange, checkpoint, userEvent } =
      message.params;
    if (userEvent) {
      const startFrom = {
        file: textDocument.uri,
        line: selectedRange.start.line,
      };
      this._options ??= {};
      this._options.startFrom = startFrom;
      this._checkpoint = checkpoint;
      if (this._program && this._game?.state !== "running") {
        if (startFrom.file in this._program.scripts) {
          await this.updatePreview(
            this._program,
            startFrom.file,
            startFrom.line,
            checkpoint,
          );
        } else if (workspace) {
          // Ensure the workspace re-compiles document so preview can be updated
          await workspace.compileTextDocument({ textDocument });
        }
      }
    }
  };

  protected handleRemovedCompilerFile = async (
    message: RemovedCompilerFileMessage.Notification,
  ) => {
    const { textDocument } = message.params;
    this._options ??= {};
    if (this._options.startFrom?.file === textDocument.uri) {
      this._options.startFrom = undefined;
    }
  };

  protected handleCompiledProgram = async (
    message: CompiledProgramMessage.Notification,
  ) => {
    const { program, checkpoint } = message.params;
    await this.loadProgram(program, checkpoint);
  };

  protected handleResizeGame = async (message: ResizeGameMessage.Request) => {
    const { height } = message.params;
    this.refs.game.style.height = `${height}px`;
    return ResizeGameMessage.type.response(message.id, {});
  };

  protected handleSetGameBreakpoints = async (
    message: SetGameBreakpointsMessage.Request,
  ) => {
    const { breakpoints } = message.params;
    this._options ??= {};
    this._options.breakpoints = breakpoints;
    const actualBreakpoints = this._game
      ? this._game.setBreakpoints(breakpoints)
      : [];
    return SetGameBreakpointsMessage.type.response(message.id, {
      breakpoints: actualBreakpoints,
    });
  };

  protected handleSetGameFunctionBreakpoints = async (
    message: SetGameFunctionBreakpointsMessage.Request,
  ) => {
    const { functionBreakpoints } = message.params;
    this._options ??= {};
    this._options.functionBreakpoints = functionBreakpoints;
    const actualFunctionBreakpoints = this._game
      ? this._game.setFunctionBreakpoints(functionBreakpoints)
      : [];
    return SetGameFunctionBreakpointsMessage.type.response(message.id, {
      functionBreakpoints: actualFunctionBreakpoints,
    });
  };

  protected handleSetGameDataBreakpoints = async (
    message: SetGameDataBreakpointsMessage.Request,
  ) => {
    const { dataBreakpoints } = message.params;
    this._options ??= {};
    this._options.dataBreakpoints = dataBreakpoints;
    const actualDataBreakpoints = this._game
      ? this._game.setDataBreakpoints(dataBreakpoints)
      : [];
    return SetGameDataBreakpointsMessage.type.response(message.id, {
      dataBreakpoints: actualDataBreakpoints,
    });
  };

  protected handleEnableGameDebug = async (
    message: EnableGameDebugMessage.Request,
  ) => {
    if (this._game) {
      this._game.startDebugging();
    }
    this.updateLaunchStateIcon();
    return this._game
      ? EnableGameDebugMessage.type.response(message.id, {})
      : EnableGameDebugMessage.type.error(message.id, {
          code: 1,
          message: "no game loaded",
        });
  };

  protected handleDisableGameDebug = async (
    message: DisableGameDebugMessage.Request,
  ) => {
    if (this._game) {
      this._game.stopDebugging();
    }
    this.updateLaunchStateIcon();
    return this._game
      ? DisableGameDebugMessage.type.response(message.id, {})
      : DisableGameDebugMessage.type.error(message.id, {
          code: 1,
          message: "no game loaded",
        });
  };

  protected handleStartGame = async (message: StartGameMessage.Request) => {
    this.hidePlayButton();
    const success = await this.startGameAndApp();
    this.updateLaunchStateIcon();
    return success
      ? StartGameMessage.type.response(message.id, { success })
      : StartGameMessage.type.error(message.id, {
          code: 1,
          message: !this._program?.compiled
            ? "The program contains errors that prevent it from being compiled"
            : `The game could not be started`,
        });
  };

  protected handleStopGame = async (message: StopGameMessage.Request) => {
    await this.stopGame("quit");
    return StopGameMessage.type.response(message.id, {});
  };

  protected handleRestartGame = async (message: RestartGameMessage.Request) => {
    await this.restartGame();
    return RestartGameMessage.type.response(message.id, {});
  };

  protected handlePauseGame = async (message: PauseGameMessage.Request) => {
    if (this._app) {
      this._app.pause();
    }
    if (this._game) {
      this._game.pause();
    }
    this.updateLaunchStateIcon();
    return this._app
      ? PauseGameMessage.type.response(message.id, {})
      : PauseGameMessage.type.error(message.id, {
          code: 1,
          message: "no game loaded",
        });
  };

  protected handleUnpauseGame = async (message: UnpauseGameMessage.Request) => {
    if (this._app) {
      this._app.unpause();
    }
    if (this._game) {
      this._game.unpause();
    }
    this.updateLaunchStateIcon();
    return this._app
      ? UnpauseGameMessage.type.response(message.id, {})
      : UnpauseGameMessage.type.error(message.id, {
          code: 1,
          message: "no game loaded",
        });
  };

  protected handleStepGameClock = async (
    message: StepGameClockMessage.Request,
  ) => {
    const { seconds } = message.params;
    if (this._app) {
      this._app.skip(seconds);
    }
    if (this._game) {
      this._game.skip(seconds);
    }
    this.updateLaunchStateIcon();
    return this._app
      ? StepGameClockMessage.type.response(message.id, {})
      : StepGameClockMessage.type.error(message.id, {
          code: 1,
          message: "no game loaded",
        });
  };

  protected handleStepGame = async (message: StepGameMessage.Request) => {
    const { traversal } = message.params;
    return this._game
      ? StepGameMessage.type.response(message.id, {
          done: this._game.step(traversal),
        })
      : StepGameMessage.type.error(message.id, {
          code: 1,
          message: "no game loaded",
        });
  };

  protected handleContinueGame = async (
    message: ContinueGameMessage.Request,
  ) => {
    return this._game
      ? ContinueGameMessage.type.response(message.id, {
          done: this._game.continue(),
        })
      : ContinueGameMessage.type.error(message.id, {
          code: 1,
          message: "no game loaded",
        });
  };

  protected handleGetGameScripts = async (
    message: GetGameScriptsMessage.Request,
  ) => {
    if (this._program) {
      const uris = Object.keys(this._program?.scripts || {});
      return GetGameScriptsMessage.type.response(message.id, { uris });
    }
    return GetGameScriptsMessage.type.error(message.id, {
      code: 1,
      message: "no program loaded",
    });
  };

  protected handleGetGameThreads = async (
    message: GetGameThreadsMessage.Request,
  ) => {
    if (this._game) {
      const threads = this._game.getThreads();
      return GetGameThreadsMessage.type.response(message.id, { threads });
    }
    return GetGameThreadsMessage.type.error(message.id, {
      code: 1,
      message: "no game loaded",
    });
  };

  protected handleGetGamePossibleBreakpointLocations = async (
    message: GetGamePossibleBreakpointLocationsMessage.Request,
  ) => {
    const { search } = message.params;
    const program = this._game?.program || this._program;
    if (program) {
      const lines: number[] = [];
      const possibleLocations = Object.values(program.pathLocations || {});
      const scripts = Object.keys(program.scripts);
      const searchScriptIndex = scripts.indexOf(search.uri);
      for (const possibleLocation of possibleLocations) {
        const [scriptIndex, line] = possibleLocation;
        if (scriptIndex != null && scriptIndex === searchScriptIndex) {
          if (
            line >= search.range.start.line &&
            line <= search.range.end.line
          ) {
            lines.push(line);
          }
        }
        if (scriptIndex > searchScriptIndex) {
          break;
        }
      }
      const result = { lines };
      return GetGamePossibleBreakpointLocationsMessage.type.response(
        message.id,
        result,
      );
    }
    return GetGamePossibleBreakpointLocationsMessage.type.error(message.id, {
      code: 1,
      message: "no game loaded",
    });
  };

  protected handleGetGameStackTrace = async (
    message: GetGameStackTraceMessage.Request,
  ) => {
    const { threadId, startFrame, levels } = message.params;
    if (this._game) {
      const result = this._game.getStackTrace(threadId, startFrame, levels);
      return GetGameStackTraceMessage.type.response(message.id, result);
    }
    return GetGameStackTraceMessage.type.error(message.id, {
      code: 1,
      message: "no game loaded",
    });
  };

  protected handleGetGameEvaluationContext = async (
    message: GetGameEvaluationContextMessage.Request,
  ) => {
    if (this._game) {
      const context = this._game.getEvaluationContext();
      return GetGameEvaluationContextMessage.type.response(message.id, {
        context,
      });
    }
    return GetGameEvaluationContextMessage.type.error(message.id, {
      code: 1,
      message: "no game loaded",
    });
  };

  protected handleGetGameVariables = async (
    message: GetGameVariablesMessage.Request,
  ) => {
    const { scope, variablesReference, value } = message.params;
    if (this._game) {
      if (scope === "temps") {
        const variables = this._game.getTempVariables();
        return GetGameVariablesMessage.type.response(message.id, { variables });
      } else if (scope === "vars") {
        const variables = this._game.getVarVariables();
        return GetGameVariablesMessage.type.response(message.id, { variables });
      } else if (scope === "lists") {
        const variables = this._game.getListVariables();
        return GetGameVariablesMessage.type.response(message.id, { variables });
      } else if (scope === "defines") {
        const variables = this._game.getDefineVariables();
        return GetGameVariablesMessage.type.response(message.id, { variables });
      } else if (scope === "children") {
        const variables = this._game.getChildVariables(variablesReference ?? 0);
        return GetGameVariablesMessage.type.response(message.id, { variables });
      } else if (scope === "value") {
        const variables = this._game.getValueVariables(value);
        return GetGameVariablesMessage.type.response(message.id, { variables });
      }
    }
    return GetGameVariablesMessage.type.error(message.id, {
      code: 1,
      message: "no game loaded",
    });
  };

  loadProgram = conflate(
    async (program: SparkProgram, checkpoint: string | undefined) => {
      if (!program.compiled) {
        console.error("Program not compiled", program);
        return;
      }
      const isInitialProgram = !this._program;
      this._program = program;
      this._checkpoint = checkpoint;
      if (this._game?.state === "running") {
        // Stop and restart game if we loaded a new game while the old game was running
        await this.debouncedRestartGame();
        sendProtocolMessage(
          GameReloadedMessage.type.notification({}),
          this.host,
        );
      } else {
        this._options ??= {};
        this._options.startFrom ??= program.startFrom;
        this._options.workspace ??= program.workspace;
        this._options.simulationOptions ??= program.simulationOptions;
        if (this._options.startFrom) {
          await this.updatePreview(
            program,
            this._options.startFrom.file,
            this._options.startFrom.line,
            checkpoint,
          );
        }
      }
      this.updateLaunchStateIcon();
      if (isInitialProgram) {
        // Notify that initial program is loaded
        this._resolveLoadingInitialProgram();
      }
    },
    true,
  );

  async startGameAndApp(restarted?: boolean) {
    if (!this._program) {
      // wait for initial program to be loaded
      await this.loadingInitialProgram;
    }
    if (!this._program) {
      return false;
    }
    this._options ??= {};
    this._options.previewFrom = undefined;
    this._game = await this.buildGame(this._program, restarted);
    this.simulate(this._game, this._options?.simulationOptions);
    this.listen(this._game);
    this._app = await this.buildApp(this._game);
    const programCompiled = Boolean(this._program?.compiled);
    this._game?.start();
    if (programCompiled) {
      this._app?.start();
    }
    this.updateLaunchStateIcon();
    return programCompiled;
  }

  async destroyGameAndApp() {
    if (this._game) {
      this._game.destroy();
      this._game = undefined;
    }
    if (this._app) {
      await this._app.initializing;
      this._app.destroy(true);
      this._app = undefined;
    }
    this.updateLaunchStateIcon();
  }

  async stopGame(
    reason: "finished" | "quit" | "invalidated" | "error" | "restart",
    error?: {
      message: string;
      location: DocumentLocation;
    },
  ) {
    const lastExecutedLocation = this._game?.getLastExecutedDocumentLocation();
    await this.destroyGameAndApp();
    this.showPlayButton();
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    sendProtocolMessage(
      GameExitedMessage.type.notification({
        reason,
        error,
      }),
      this.host,
    );
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    if (lastExecutedLocation && workspace) {
      // Ensure the workspace simulates a checkpoint from last executed location
      await workspace.selectTextDocument({
        textDocument: { uri: lastExecutedLocation.uri },
        selectedRange: lastExecutedLocation.range,
        userEvent: true,
        docChanged: false,
      });
    }
  }

  async restartGame() {
    await this.destroyGameAndApp();
    await this.startGameAndApp(true);
  }

  protected debouncedRestartGame = debounce(() => this.restartGame(), 100);

  async buildGame(program: SparkProgram, restarted?: boolean) {
    const options = this._options;
    const startFrom = options?.startFrom;
    const previewFrom = options?.previewFrom;
    const breakpoints = options?.breakpoints;
    const functionBreakpoints = options?.functionBreakpoints;
    const dataBreakpoints = options?.dataBreakpoints;
    if (this._game) {
      profile("start", "game/destroy");
      this._game.destroy();
      profile("end", "game/destroy");
    }
    profile("start", "game/create");
    this._game = new Game({
      program,
      restarted,
      previewFrom,
      startFrom,
      breakpoints,
      functionBreakpoints,
      dataBreakpoints,
      now: () => window.performance.now(),
      resolve: (path: string) => {
        // TODO: resolve import and load paths to url
        return path;
      },
      fetch: async (url: string): Promise<string> => {
        const response = await fetch(url);
        const text = await response.text();
        return text;
      },
      log: (message: unknown, severity: "info" | "warning" | "error") => {
        if (severity === "error") {
          console.error(message);
        } else if (severity === "warning") {
          console.warn(message);
        } else {
          console.log(message);
        }
      },
      setTimeout: (
        handler: Function,
        timeout?: number,
        ...args: any[]
      ): number => {
        return setTimeout(handler, timeout, ...args);
      },
    });
    profile("end", "game/create");
    return this._game;
  }

  async buildApp(game: Game) {
    if (this._app) {
      profile("start", "app/destroy");
      await this._app.destroy(true);
      this._app = undefined;
      profile("end", "app/destroy");
    }
    this.updateExecutionLabels();
    profile("start", "app/create");
    this._app = new Application(
      game,
      this.refs.gameView,
      this.refs.gameUI,
      this._audioContext,
    );
    profile("end", "app/create");
    profile("start", "app/init");
    await this._app.init();
    profile("end", "app/init");
    return this._app;
  }

  simulate(
    game: Game,
    simulationOptions:
      | Record<
          string,
          {
            favoredChoices?: (number | undefined)[];
            favoredConditions?: (boolean | undefined)[];
          }
        >
      | undefined,
  ) {
    profile("start", "game/simulate");
    game.simulate(simulationOptions);
    profile("end", "game/simulate");
  }

  listen(game: Game) {
    game.connection.outgoing.addListener(
      GameEncounteredRuntimeErrorMessage.method,
      async (msg) => {
        if (GameEncounteredRuntimeErrorMessage.type.isNotification(msg)) {
          const type = msg.params.type;
          const message = msg.params.message;
          const location = msg.params.location;
          if (type === ErrorType.Error) {
            console.error(message, location);
          } else if (type === ErrorType.Warning) {
            console.warn(message, location);
          } else {
            console.log(message, location);
          }
          if (game && game.state === "running") {
            const error = {
              message,
              location,
            };
            await this.stopGame("error", error);
          }
        }
      },
    );
    game.connection.outgoing.addListener(
      GameFinishedMessage.method,
      async (msg) => {
        if (GameFinishedMessage.type.isNotification(msg)) {
          await this.stopGame("finished");
        }
      },
    );
    game.connection.outgoing.addListener(
      GameStartedThreadMessage.method,
      (msg) => {
        if (GameStartedThreadMessage.type.isNotification(msg)) {
          sendProtocolMessage(
            GameStartedThreadMessage.type.notification(msg.params),
            this.host,
          );
        }
      },
    );
    game.connection.outgoing.addListener(
      GameExitedThreadMessage.method,
      (msg) => {
        if (GameExitedThreadMessage.type.isNotification(msg)) {
          sendProtocolMessage(
            GameExitedThreadMessage.type.notification(msg.params),
            this.host,
          );
        }
      },
    );
    game.connection.outgoing.addListener(GameExecutedMessage.method, (msg) => {
      if (GameExecutedMessage.type.isNotification(msg)) {
        this.updateExecutionLabels(msg.params);
        sendProtocolMessage(
          GameExecutedMessage.type.notification(msg.params),
          this.host,
        );
      }
    });
    game.connection.outgoing.addListener(GamePreviewedMessage.method, (msg) => {
      if (GamePreviewedMessage.type.isNotification(msg)) {
        sendProtocolMessage(
          GamePreviewedMessage.type.notification(msg.params),
          this.host,
        );
      }
    });
    game.connection.outgoing.addListener(GameSteppedMessage.method, (msg) => {
      if (GameSteppedMessage.type.isNotification(msg)) {
        sendProtocolMessage(
          GameSteppedMessage.type.notification(msg.params),
          this.host,
        );
      }
    });
    game.connection.outgoing.addListener(
      GameHitBreakpointMessage.method,
      (msg) => {
        if (GameHitBreakpointMessage.type.isNotification(msg)) {
          sendProtocolMessage(
            GameHitBreakpointMessage.type.notification(msg.params),
            this.host,
          );
        }
      },
    );
    game.connection.outgoing.addListener(
      GameAwaitingInteractionMessage.method,
      (msg) => {
        if (GameAwaitingInteractionMessage.type.isNotification(msg)) {
          sendProtocolMessage(
            GameAwaitingInteractionMessage.type.notification(msg.params),
            this.host,
          );
        }
      },
    );
    game.connection.outgoing.addListener(
      GameAutoAdvancedToContinueMessage.method,
      (msg) => {
        if (GameAutoAdvancedToContinueMessage.type.isNotification(msg)) {
          sendProtocolMessage(
            GameAutoAdvancedToContinueMessage.type.notification(msg.params),
            this.host,
          );
        }
      },
    );
    game.connection.outgoing.addListener(
      GameClickedToContinueMessage.method,
      (msg) => {
        if (GameClickedToContinueMessage.type.isNotification(msg)) {
          sendProtocolMessage(
            GameClickedToContinueMessage.type.notification(msg.params),
            this.host,
          );
        }
      },
    );
    game.connection.outgoing.addListener(
      GameChosePathToContinueMessage.method,
      (msg) => {
        if (GameChosePathToContinueMessage.type.isNotification(msg)) {
          sendProtocolMessage(
            GameChosePathToContinueMessage.type.notification(msg.params),
            this.host,
          );
        }
      },
    );
  }

  updatePreview = async (
    program: SparkProgram,
    file: string,
    line: number,
    checkpoint: string | undefined,
  ) => {
    if (this._game?.state === "running") {
      return;
    }

    if (!program) {
      return;
    }

    const previewFrom = { file, line };
    const previewPath = findClosestPath(
      previewFrom,
      Object.entries(program.pathLocations ?? {}),
      Object.keys(program.scripts),
    );

    const programChanged =
      this._game?.program.uri !== program?.uri ||
      this._game.program.version !== program?.version;

    const validPreviewFrom = previewPath
      ? previewFrom
      : this._game?.previewFrom;
    const validPreviewPath = previewPath
      ? previewPath
      : this._game?.previewPath;

    if (
      this._game &&
      this._game.state === "previewing" &&
      this._game.context.system.previewing === validPreviewPath &&
      !programChanged
    ) {
      return;
    }

    this._options ??= {};
    this._options.previewFrom = validPreviewFrom;

    // Reuse the Game + Application across edits instead of rebuilding them.
    // `updateProgram` swaps the recompiled program + a fresh Story IN PLACE (the
    // intended live-edit path), keeping the SAME Game object — so the Application
    // (bound to that object) stays valid and we never destroy/recreate the
    // Application or its pixi canvas (the old `buildApp`-every-edit was the
    // game-view blink + per-edit object churn).
    if (!this._game) {
      this._game = await this.buildGame(program);
      this.listen(this._game);
    } else if (programChanged) {
      this._game.updateProgram(program);
    }

    if (!this._game) {
      console.error("No game to preview");
      return;
    }

    if (checkpoint) {
      this._game.load(checkpoint);
    } else {
      if (validPreviewPath) {
        const simulateFromPath = Game.getSimulateFromPath(validPreviewPath);
        this._game.simulatePath = simulateFromPath;
      }
      this._game.simulation = "fail";
    }

    if (!this._app) {
      // First render: build the Application (renderer/canvas + managers) and
      // connect the game (its onConnected renders the screen tree).
      this._app = await this.buildApp(this._game);
    } else {
      // Re-render in place: adopt the preserved overlay DOM (beginReconcilePass),
      // then re-run the game's onConnected + restore via connectGame — the
      // re-emitted create stream reconciles against the existing DOM. No app /
      // canvas / manager teardown.
      this._app.ui.beginReconcilePass();
      await this._app.connectGame();
    }

    if (validPreviewFrom) {
      this._game.preview(validPreviewFrom.file, validPreviewFrom.line);
    }

    // DOM reconcile tail: the full create/write stream for this preview point has
    // now been dispatched (synchronously through here), so sweep whatever wasn't
    // re-emitted — elements that disappeared since the last edit.
    this._app?.ui.sweepReconcile();
  };
}
