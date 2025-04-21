import { ConfigureGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/ConfigureGameMessage";
import { ContinueGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/ContinueGameMessage";
import { DisableGameDebugMessage } from "@impower/spark-editor-protocol/src/protocols/game/DisableGameDebugMessage";
import { EnableGameDebugMessage } from "@impower/spark-editor-protocol/src/protocols/game/EnableGameDebugMessage";
import { GameAutoAdvancedToContinueMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameAutoAdvancedToContinueMessage";
import { GameAwaitingInteractionMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameAwaitingInteractionMessage";
import { GameChosePathToContinueMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameChosePathToContinueMessage";
import { GameClickedToContinueMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameClickedToContinueMessage";
import { GameExecutedMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameExecutedMessage";
import { GameExitedMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameExitedMessage";
import { GameExitedThreadMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameExitedThreadMessage";
import { GameHitBreakpointMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameHitBreakpointMessage";
import { GameStartedMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameStartedMessage";
import { GameStartedThreadMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameStartedThreadMessage";
import { GameSteppedMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameSteppedMessage";
import { GetGameEvaluationContextMessage } from "@impower/spark-editor-protocol/src/protocols/game/GetGameEvaluationContextMessage";
import { GetGamePossibleBreakpointLocationsMessage } from "@impower/spark-editor-protocol/src/protocols/game/GetGamePossibleBreakpointLocationsMessage";
import { GetGameScriptsMessage } from "@impower/spark-editor-protocol/src/protocols/game/GetGameScriptsMessage";
import { GetGameStackTraceMessage } from "@impower/spark-editor-protocol/src/protocols/game/GetGameStackTraceMessage";
import { GetGameThreadsMessage } from "@impower/spark-editor-protocol/src/protocols/game/GetGameThreadsMessage";
import { GetGameVariablesMessage } from "@impower/spark-editor-protocol/src/protocols/game/GetGameVariablesMessage";
import { LoadGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/LoadGameMessage";
import { PauseGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/PauseGameMessage";
import { RestartGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/RestartGameMessage";
import { StartGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/StartGameMessage";
import { StepGameClockMessage } from "@impower/spark-editor-protocol/src/protocols/game/StepGameClockMessage";
import { StepGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/StepGameMessage";
import { StopGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/StopGameMessage";
import { UnpauseGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/UnpauseGameMessage";
import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { ConnectedPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/ConnectedPreviewMessage";
import { LoadPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/LoadPreviewMessage";
import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import { AutoAdvancedToContinueMessage } from "@impower/spark-engine/src/game/core/classes/messages/AutoAdvancedToContinueMessage";
import { AwaitingInteractionMessage } from "@impower/spark-engine/src/game/core/classes/messages/AwaitingInteractionMessage";
import { ChosePathToContinueMessage } from "@impower/spark-engine/src/game/core/classes/messages/ChoosePathToContinueMessage";
import { ClickedToContinueMessage } from "@impower/spark-engine/src/game/core/classes/messages/ClickedToContinueMessage";
import { ExecutedMessage } from "@impower/spark-engine/src/game/core/classes/messages/ExecutedMessage";
import { ExitedThreadMessage } from "@impower/spark-engine/src/game/core/classes/messages/ExitedThreadMessage";
import { FinishedMessage } from "@impower/spark-engine/src/game/core/classes/messages/FinishedMessage";
import { HitBreakpointMessage } from "@impower/spark-engine/src/game/core/classes/messages/HitBreakpointMessage";
import { RuntimeErrorMessage } from "@impower/spark-engine/src/game/core/classes/messages/RuntimeErrorMessage";
import { StartedThreadMessage } from "@impower/spark-engine/src/game/core/classes/messages/StartedThreadMessage";
import { SteppedMessage } from "@impower/spark-engine/src/game/core/classes/messages/SteppedMessage";
import { DocumentLocation } from "@impower/spark-engine/src/game/core/types/DocumentLocation";
import { ErrorType } from "@impower/spark-engine/src/game/core/types/ErrorType";
import { SparkProgram } from "@impower/sparkdown/src/types/SparkProgram";
import { Component } from "../../../spec-component/src/component";
import { Application } from "../app/Application";
import { debounce } from "../utils/debounce";
import spec from "./_spark-web-player";

const COMMON_ASPECT_RATIOS = [
  [16, 9],
  [9, 16],
  [4, 3],
  [3, 4],
  [21, 9],
  [1, 1],
] as const;

const MIN_HEIGHT = 100;

export default class SparkWebPlayer extends Component(spec) {
  _audioContext?: AudioContext;

  _game?: Game;

  _app?: Application;

  _debugging = false;

  _program?: SparkProgram;

  _options?: {
    startpoint?: { file: string; line: number };
    breakpoints?: { file: string; line: number }[];
    functionBreakpoints?: { name: string }[];
    dataBreakpoints?: { dataId: string }[];
    workspace?: string;
  };

  _loadListeners = new Set<() => void>();

  _isResizing = false;

  _resizeStartY = 0;

  _resizeStartHeight = 0;

  override onConnected() {
    window.addEventListener(MessageProtocol.event, this.handleProtocol);
    window.addEventListener("contextmenu", this.handleContextMenu, true);
    window.addEventListener("dragstart", this.handleDragStart);
    window.addEventListener("resize", this.updateSizeDisplay);
    this.ref.playButton?.addEventListener("click", this.handleClickPlayButton);
    this.ref.toolbar?.addEventListener("pointerdown", this.handlePointerDown);
    this.ref.toolbar?.addEventListener("pointermove", this.handlePointerMove);
    this.ref.toolbar?.addEventListener("pointerup", this.handlePointerUp);
    this.updateSizeDisplay();
    this.emit(
      MessageProtocol.event,
      ConnectedPreviewMessage.type.notification({ type: "game" })
    );
  }

  override onDisconnected() {
    window.removeEventListener(MessageProtocol.event, this.handleProtocol);
    window.removeEventListener("contextmenu", this.handleContextMenu);
    window.removeEventListener("dragstart", this.handleDragStart);
    window.removeEventListener("resize", this.updateSizeDisplay);
    this.ref.playButton?.removeEventListener(
      "click",
      this.handleClickPlayButton
    );
    this.ref.toolbar?.removeEventListener(
      "pointerdown",
      this.handlePointerDown
    );
    this.ref.toolbar?.removeEventListener(
      "pointermove",
      this.handlePointerMove
    );
    this.ref.toolbar?.removeEventListener("pointerup", this.handlePointerUp);
  }

  protected handleContextMenu = (e: Event) => {
    e.preventDefault();
  };

  protected handleDragStart = (e: DragEvent) => {
    e.preventDefault();
  };

  protected handlePointerDown = (e: PointerEvent) => {
    this._isResizing = true;
    this._resizeStartY = e.clientY;
    this._resizeStartHeight = this.root.offsetHeight;
    document.body.style.cursor = "ns-resize";
    this.ref.toolbar.setPointerCapture(e.pointerId);
  };

  protected handlePointerMove = (e: PointerEvent) => {
    if (!this._isResizing) {
      return;
    }
    const dy = e.clientY - this._resizeStartY;
    let newHeight = this._resizeStartHeight + dy;

    const maxHeight = window.innerHeight;
    newHeight = Math.max(MIN_HEIGHT, Math.min(maxHeight, newHeight));

    const width = this.root.offsetWidth;
    let closestMatch = newHeight;
    let minDiff = Infinity;

    for (const [w, h] of COMMON_ASPECT_RATIOS) {
      const expectedHeight = Math.round((width * h) / w);
      const diff = Math.abs(expectedHeight - newHeight);
      if (diff < 10 && diff < minDiff) {
        closestMatch = expectedHeight;
        minDiff = diff;
      }
    }

    this.root.style.height = `${closestMatch}px`;
    this.updateSizeDisplay();
  };

  protected handlePointerUp = (e: PointerEvent) => {
    this._isResizing = false;
    document.body.style.cursor = "";
    this.ref.toolbar.releasePointerCapture(e.pointerId);
  };

  protected async hidePlayButton() {
    if (this.ref.playButton) {
      this.ref.playButton.style.pointerEvents = "none";
      this.ref.playButton.style.opacity = "0";
      const animations = this.ref.playButton.getAnimations();
      await Promise.allSettled(
        animations.map((animation) => animation.finished)
      );
      this.ref.playButton.style.display = "none";
    }
  }

  protected async showPlayButton() {
    if (this.ref.playButton) {
      this.ref.playButton.style.pointerEvents = "";
      this.ref.playButton.style.opacity = "";
      this.ref.playButton.style.display = "";
    }
  }

  getLaunchFilePath() {
    const workspace = this._options?.workspace;
    const startpoint = this._options?.startpoint;
    const launchFilePath = startpoint ? startpoint.file : this._program?.uri;
    if (!launchFilePath) {
      return undefined;
    }
    return workspace && launchFilePath.startsWith(workspace)
      ? launchFilePath.slice(workspace.length + 1)
      : launchFilePath;
  }

  getLaunchLineNumber() {
    const startpoint = this._options?.startpoint;
    const launchLine = startpoint ? startpoint.line : 0;
    return launchLine + 1;
  }

  protected updateLaunchLabel(lastExecutedLocation?: DocumentLocation) {
    const workspace = this._options?.workspace;
    const startpoint = this._options?.startpoint;
    const program = this._program;
    if (!program) {
      return;
    }
    const launchFilePath = lastExecutedLocation
      ? lastExecutedLocation.uri
      : startpoint
      ? startpoint.file
      : program.uri;
    const launchLine = lastExecutedLocation
      ? lastExecutedLocation.range.start.line
      : startpoint
      ? startpoint.line
      : 0;
    const launchLineNumber = launchLine + 1;
    const relativeLaunchFile =
      workspace && launchFilePath.startsWith(workspace)
        ? launchFilePath.slice(workspace.length + 1)
        : launchFilePath;
    this.ref.launchLabel.textContent = `${relativeLaunchFile}    Ln ${launchLineNumber}`;
  }

  protected updateLaunchStateIcon() {
    const icon = this._app?.paused
      ? "pause"
      : this._game?.state === "running"
      ? "play"
      : "preview";
    this.ref.launchStateIcon.setAttribute("icon", icon);
  }

  getAspectRatioLabel(width: number, height: number) {
    for (const [w, h] of COMMON_ASPECT_RATIOS) {
      const expectedHeight = Math.round((width * h) / w);
      if (height === expectedHeight) {
        return `${w}:${h}`;
      }
    }
    return null;
  }

  updateSizeDisplay = () => {
    const width = this.root.offsetWidth;
    const height = this.root.offsetHeight;
    const ratioLabel = this.getAspectRatioLabel(width, height);
    this.ref.sizeDisplay.textContent =
      `${width} × ${height}` + (ratioLabel ? ` (${ratioLabel})` : "");
    // canvas.width = this.root.clientWidth;
    // canvas.height = this.root.clientHeight - this.ref.toolbar.offsetHeight;
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
    this.emit(MessageProtocol.event, GameStartedMessage.type.notification({}));
  };

  protected handleProtocol = async (e: Event) => {
    if (e instanceof CustomEvent) {
      if (ConfigureGameMessage.type.is(e.detail)) {
        const response = await this.handleConfigureGame(
          ConfigureGameMessage.type,
          e.detail
        );
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (EnableGameDebugMessage.type.is(e.detail)) {
        const response = await this.handleEnableGameDebug(
          EnableGameDebugMessage.type,
          e.detail
        );
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (DisableGameDebugMessage.type.is(e.detail)) {
        const response = await this.handleDisableGameDebug(
          DisableGameDebugMessage.type,
          e.detail
        );
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (LoadPreviewMessage.type.is(e.detail)) {
        const response = await this.handleLoadPreview(
          LoadPreviewMessage.type,
          e.detail
        );
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (LoadGameMessage.type.is(e.detail)) {
        const response = await this.handleLoadGame(
          LoadGameMessage.type,
          e.detail
        );
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (StartGameMessage.type.is(e.detail)) {
        const response = await this.handleStartGame(
          StartGameMessage.type,
          e.detail
        );
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (StopGameMessage.type.is(e.detail)) {
        const response = await this.handleStopGame(
          StopGameMessage.type,
          e.detail
        );
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (RestartGameMessage.type.is(e.detail)) {
        const response = await this.handleRestartGame(
          RestartGameMessage.type,
          e.detail
        );
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (PauseGameMessage.type.is(e.detail)) {
        const response = await this.handlePauseGame(
          PauseGameMessage.type,
          e.detail
        );
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (UnpauseGameMessage.type.is(e.detail)) {
        const response = await this.handleUnpauseGame(
          UnpauseGameMessage.type,
          e.detail
        );
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (StepGameClockMessage.type.is(e.detail)) {
        const response = await this.handleStepGameClock(
          StepGameClockMessage.type,
          e.detail
        );
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (StepGameMessage.type.is(e.detail)) {
        const response = await this.handleStepGame(
          StepGameMessage.type,
          e.detail
        );
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (ContinueGameMessage.type.is(e.detail)) {
        const response = await this.handleContinueGame(
          ContinueGameMessage.type,
          e.detail
        );
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (GetGameScriptsMessage.type.is(e.detail)) {
        const response = await this.handleGetGameScripts(
          GetGameScriptsMessage.type,
          e.detail
        );
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (GetGamePossibleBreakpointLocationsMessage.type.is(e.detail)) {
        const response = await this.handleGetGamePossibleBreakpointLocations(
          GetGamePossibleBreakpointLocationsMessage.type,
          e.detail
        );
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (GetGameStackTraceMessage.type.is(e.detail)) {
        const response = await this.handleGetGameStackTrace(
          GetGameStackTraceMessage.type,
          e.detail
        );
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (GetGameEvaluationContextMessage.type.is(e.detail)) {
        const response = await this.handleGetGameEvaluationContext(
          GetGameEvaluationContextMessage.type,
          e.detail
        );
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (GetGameVariablesMessage.type.is(e.detail)) {
        const response = await this.handleGetGameVariables(
          GetGameVariablesMessage.type,
          e.detail
        );
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (GetGameThreadsMessage.type.is(e.detail)) {
        const response = await this.handleGetGameThreads(
          GetGameThreadsMessage.type,
          e.detail
        );
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
    }
  };

  protected handleConfigureGame = async (
    messageType: typeof ConfigureGameMessage.type,
    message: ConfigureGameMessage.Request
  ) => {
    const {
      workspace,
      startpoint,
      breakpoints,
      functionBreakpoints,
      dataBreakpoints,
    } = message.params;
    if (!this._program) {
      // wait for program to be loaded
      await new Promise<void>((resolve) => {
        this._loadListeners.add(resolve);
      });
    }
    if (this._game?.state === "running") {
      // Ignore if game is already running
      return undefined;
    }
    const program = this._program!;
    this._options ??= {};
    if (workspace) {
      this._options.workspace = workspace;
    }
    if (startpoint) {
      this._options.startpoint = startpoint;
      this._game?.setStartpoint(startpoint);
    }
    if (breakpoints) {
      this._options.breakpoints = breakpoints;
      this._game?.setBreakpoints(breakpoints);
    }
    if (functionBreakpoints) {
      this._options.functionBreakpoints = functionBreakpoints;
      this._game?.setFunctionBreakpoints(functionBreakpoints);
    }
    if (dataBreakpoints) {
      this._options.dataBreakpoints = dataBreakpoints;
      this._game?.setDataBreakpoints(dataBreakpoints);
    }
    const actualBreakpoints =
      breakpoints && program.pathToLocation
        ? Game.getActualBreakpoints(
            Object.entries(program.pathToLocation),
            breakpoints,
            Object.keys(program.scripts)
          )
        : undefined;
    const actualFunctionBreakpoints =
      functionBreakpoints && program.functionLocations
        ? Game.getActualFunctionBreakpoints(
            program.functionLocations,
            functionBreakpoints,
            Object.keys(program.scripts)
          )
        : undefined;
    const actualDataBreakpoints =
      dataBreakpoints && program.dataLocations
        ? Game.getActualDataBreakpoints(
            program.dataLocations,
            dataBreakpoints,
            Object.keys(program.scripts)
          )
        : undefined;
    this.updateLaunchLabel();
    this.updateLaunchStateIcon();
    return messageType.response(message.id, {
      breakpoints: actualBreakpoints,
      functionBreakpoints: actualFunctionBreakpoints,
      dataBreakpoints: actualDataBreakpoints,
    });
  };

  protected handleEnableGameDebug = async (
    messageType: typeof EnableGameDebugMessage.type,
    message: EnableGameDebugMessage.Request
  ) => {
    if (this._game) {
      this._game.startDebugging();
    }
    this.updateLaunchStateIcon();
    return this._game
      ? messageType.response(message.id, {})
      : messageType.error(message.id, {
          code: 1,
          message: "no game loaded",
        });
  };

  protected handleDisableGameDebug = async (
    messageType: typeof DisableGameDebugMessage.type,
    message: DisableGameDebugMessage.Request
  ) => {
    if (this._game) {
      this._game.stopDebugging();
    }
    this.updateLaunchStateIcon();
    return this._game
      ? messageType.response(message.id, {})
      : messageType.error(message.id, {
          code: 1,
          message: "no game loaded",
        });
  };

  protected handleLoadPreview = async (
    messageType: typeof LoadPreviewMessage.type,
    message: LoadPreviewMessage.Request
  ) => {
    const { type, textDocument, selectedRange } = message.params;
    if (type === "game") {
      const line = selectedRange?.start.line ?? 0;
      this.updatePreview(textDocument.uri, line);
      this.updateLaunchStateIcon();
      return messageType.response(message.id, {});
    }
    return undefined;
  };

  protected handleLoadGame = async (
    messageType: typeof LoadGameMessage.type,
    message: LoadGameMessage.Request
  ) => {
    const params = message.params;
    this._program = params.program;
    this._loadListeners.forEach((callback) => {
      callback();
    });
    this._loadListeners.clear();
    if (this._game?.state === "running") {
      // Stop and restart game if we loaded a new game while the old game was running
      this.debouncedRestartGame();
    }
    this.updateLaunchLabel();
    this.updateLaunchStateIcon();
    return messageType.response(message.id, {});
  };

  protected handleStartGame = async (
    messageType: typeof StartGameMessage.type,
    message: StartGameMessage.Request
  ) => {
    const success = await this.startGameAndApp();
    this.updateLaunchStateIcon();
    return success
      ? messageType.response(message.id, {})
      : messageType.error(message.id, {
          code: 1,
          message: !this._program?.compiled
            ? "The program contains errors that prevent it from being compiled"
            : `The game cannot be started from line ${this.getLaunchLineNumber()} of ${this.getLaunchFilePath()}`,
        });
  };

  protected handleStopGame = async (
    messageType: typeof StopGameMessage.type,
    message: StopGameMessage.Request
  ) => {
    await this.stopGame("quit");
    return messageType.response(message.id, {});
  };

  protected handleRestartGame = async (
    messageType: typeof RestartGameMessage.type,
    message: RestartGameMessage.Request
  ) => {
    await this.restartGame();
    return messageType.response(message.id, {});
  };

  protected handlePauseGame = async (
    messageType: typeof PauseGameMessage.type,
    message: PauseGameMessage.Request
  ) => {
    if (this._app) {
      this._app.pause();
    }
    this.updateLaunchStateIcon();
    return this._app
      ? messageType.response(message.id, {})
      : messageType.error(message.id, {
          code: 1,
          message: "no game loaded",
        });
  };

  protected handleUnpauseGame = async (
    messageType: typeof UnpauseGameMessage.type,
    message: UnpauseGameMessage.Request
  ) => {
    if (this._app) {
      this._app.unpause();
    }
    this.updateLaunchStateIcon();
    return this._app
      ? messageType.response(message.id, {})
      : messageType.error(message.id, {
          code: 1,
          message: "no game loaded",
        });
  };

  protected handleStepGameClock = async (
    messageType: typeof StepGameClockMessage.type,
    message: StepGameClockMessage.Request
  ) => {
    const { seconds } = message.params;
    if (this._app) {
      this._app.skip(seconds);
    }
    this.updateLaunchStateIcon();
    return this._app
      ? messageType.response(message.id, {})
      : messageType.error(message.id, {
          code: 1,
          message: "no game loaded",
        });
  };

  protected handleStepGame = async (
    messageType: typeof StepGameMessage.type,
    message: StepGameMessage.Request
  ) => {
    const { traversal } = message.params;
    if (this._game) {
      this._game.step(traversal);
    }
    return this._game
      ? messageType.response(message.id, {})
      : messageType.error(message.id, {
          code: 1,
          message: "no game loaded",
        });
  };

  protected handleContinueGame = async (
    messageType: typeof ContinueGameMessage.type,
    message: ContinueGameMessage.Request
  ) => {
    if (this._game) {
      this._game.continue();
    }
    return this._game
      ? messageType.response(message.id, {})
      : messageType.error(message.id, {
          code: 1,
          message: "no game loaded",
        });
  };

  protected handleGetGameScripts = async (
    messageType: typeof GetGameScriptsMessage.type,
    message: GetGameScriptsMessage.Request
  ) => {
    if (this._program) {
      const uris = Object.keys(this._program?.scripts || {});
      return messageType.response(message.id, { uris });
    }
    return messageType.error(message.id, {
      code: 1,
      message: "no program loaded",
    });
  };

  protected handleGetGameThreads = async (
    messageType: typeof GetGameThreadsMessage.type,
    message: GetGameThreadsMessage.Request
  ) => {
    if (this._game) {
      const threads = this._game.getThreads();
      return messageType.response(message.id, { threads });
    }
    return messageType.error(message.id, {
      code: 1,
      message: "no game loaded",
    });
  };

  protected handleGetGamePossibleBreakpointLocations = async (
    messageType: typeof GetGamePossibleBreakpointLocationsMessage.type,
    message: GetGamePossibleBreakpointLocationsMessage.Request
  ) => {
    const { search } = message.params;
    const program = this._game?.program || this._program;
    if (program) {
      const lines: number[] = [];
      const possibleLocations = Object.values(program.pathToLocation || {});
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
      return messageType.response(message.id, result);
    }
    return messageType.error(message.id, {
      code: 1,
      message: "no game loaded",
    });
  };

  protected handleGetGameStackTrace = async (
    messageType: typeof GetGameStackTraceMessage.type,
    message: GetGameStackTraceMessage.Request
  ) => {
    const { threadId, startFrame, levels } = message.params;
    if (this._game) {
      const result = this._game.getStackTrace(threadId, startFrame, levels);
      return messageType.response(message.id, result);
    }
    return messageType.error(message.id, {
      code: 1,
      message: "no game loaded",
    });
  };

  protected handleGetGameEvaluationContext = async (
    messageType: typeof GetGameEvaluationContextMessage.type,
    message: GetGameEvaluationContextMessage.Request
  ) => {
    if (this._game) {
      const context = this._game.getEvaluationContext();
      return messageType.response(message.id, { context });
    }
    return messageType.error(message.id, {
      code: 1,
      message: "no game loaded",
    });
  };

  protected handleGetGameVariables = async (
    messageType: typeof GetGameVariablesMessage.type,
    message: GetGameVariablesMessage.Request
  ) => {
    const { scope, variablesReference, value } = message.params;
    if (this._game) {
      if (scope === "temps") {
        const variables = this._game.getTempVariables();
        return messageType.response(message.id, { variables });
      } else if (scope === "vars") {
        const variables = this._game.getVarVariables();
        return messageType.response(message.id, { variables });
      } else if (scope === "lists") {
        const variables = this._game.getListVariables();
        return messageType.response(message.id, { variables });
      } else if (scope === "defines") {
        const variables = this._game.getDefineVariables();
        return messageType.response(message.id, { variables });
      } else if (scope === "children") {
        const variables = this._game.getChildVariables(variablesReference ?? 0);
        return messageType.response(message.id, { variables });
      } else if (scope === "value") {
        const variables = this._game.getValueVariables(value);
        return messageType.response(message.id, { variables });
      }
    }
    return messageType.error(message.id, {
      code: 1,
      message: "no game loaded",
    });
  };

  async startGameAndApp() {
    if (!this._program) {
      // wait for program to be loaded
      await new Promise<void>((resolve) => {
        this._loadListeners.add(resolve);
      });
    }
    await this.buildGame();
    const programCompiled = this._program?.compiled;
    const gameStarted = this._game?.start();
    const success = Boolean(programCompiled && gameStarted);
    if (success) {
      this._app?.start();
    }
    this.updateLaunchStateIcon();
    return success;
  }

  destroyGameAndApp() {
    if (this._game) {
      this._game.destroy();
      this._game = undefined;
    }
    if (this._app) {
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
    }
  ) {
    this.destroyGameAndApp();
    this.showPlayButton();
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    this.emit(
      MessageProtocol.event,
      GameExitedMessage.type.notification({
        reason,
        error,
      })
    );
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
  }

  async restartGame() {
    this.destroyGameAndApp();
    await this.startGameAndApp();
  }

  protected debouncedRestartGame = debounce(() => this.restartGame(), 100);

  async buildGame(preview?: { file: string; line: number }): Promise<void> {
    const options = this._options;
    const startpoint = options?.startpoint;
    const breakpoints = options?.breakpoints;
    const functionBreakpoints = options?.functionBreakpoints;
    if (!this._program || !this._program.compiled) {
      return;
    }
    if (this._game) {
      this._game.destroy();
    }
    this._game = new Game(this._program, {
      startpoint,
      breakpoints,
      functionBreakpoints,
      preview,
    });
    this._game.connection.outgoing.addListener(
      RuntimeErrorMessage.method,
      async (msg) => {
        if (RuntimeErrorMessage.type.isNotification(msg)) {
          const type = msg.params.type;
          const message = msg.params.message;
          const location = msg.params.location;
          // TODO: Display message in on-screen debug console
          if (type === ErrorType.Error) {
            console.error(message, location);
          } else if (type === ErrorType.Warning) {
            console.warn(message, location);
          } else {
            console.log(message, location);
          }
          if (this._game?.state === "running") {
            const error = {
              message,
              location,
            };
            await this.stopGame("error", error);
          }
        }
      }
    );
    this._game.connection.outgoing.addListener(
      FinishedMessage.method,
      async (msg) => {
        if (FinishedMessage.type.isNotification(msg)) {
          await this.stopGame("finished");
        }
      }
    );
    this._game.connection.outgoing.addListener(
      StartedThreadMessage.method,
      (msg) => {
        if (StartedThreadMessage.type.isNotification(msg)) {
          this.emit(
            MessageProtocol.event,
            GameStartedThreadMessage.type.notification(msg.params)
          );
        }
      }
    );
    this._game.connection.outgoing.addListener(
      ExitedThreadMessage.method,
      (msg) => {
        if (ExitedThreadMessage.type.isNotification(msg)) {
          this.emit(
            MessageProtocol.event,
            GameExitedThreadMessage.type.notification(msg.params)
          );
        }
      }
    );
    this._game.connection.outgoing.addListener(
      ExecutedMessage.method,
      (msg) => {
        if (ExecutedMessage.type.isNotification(msg)) {
          const { locations } = msg.params;
          const lastExecutedLocation = locations.at(-1);
          if (lastExecutedLocation) {
            this.updateLaunchLabel(lastExecutedLocation);
          }
          this.emit(
            MessageProtocol.event,
            GameExecutedMessage.type.notification(msg.params)
          );
        }
      }
    );
    this._game.connection.outgoing.addListener(SteppedMessage.method, (msg) => {
      if (SteppedMessage.type.isNotification(msg)) {
        this.emit(
          MessageProtocol.event,
          GameSteppedMessage.type.notification(msg.params)
        );
      }
    });
    this._game.connection.outgoing.addListener(
      HitBreakpointMessage.method,
      (msg) => {
        if (HitBreakpointMessage.type.isNotification(msg)) {
          this.emit(
            MessageProtocol.event,
            GameHitBreakpointMessage.type.notification(msg.params)
          );
        }
      }
    );
    this._game.connection.outgoing.addListener(
      AwaitingInteractionMessage.method,
      (msg) => {
        if (AwaitingInteractionMessage.type.isNotification(msg)) {
          this.emit(
            MessageProtocol.event,
            GameAwaitingInteractionMessage.type.notification(msg.params)
          );
        }
      }
    );
    this._game.connection.outgoing.addListener(
      AutoAdvancedToContinueMessage.method,
      (msg) => {
        if (AutoAdvancedToContinueMessage.type.isNotification(msg)) {
          this.emit(
            MessageProtocol.event,
            GameAutoAdvancedToContinueMessage.type.notification(msg.params)
          );
        }
      }
    );
    this._game.connection.outgoing.addListener(
      ClickedToContinueMessage.method,
      (msg) => {
        if (ClickedToContinueMessage.type.isNotification(msg)) {
          this.emit(
            MessageProtocol.event,
            GameClickedToContinueMessage.type.notification(msg.params)
          );
        }
      }
    );
    this._game.connection.outgoing.addListener(
      ChosePathToContinueMessage.method,
      (msg) => {
        if (ChosePathToContinueMessage.type.isNotification(msg)) {
          this.emit(
            MessageProtocol.event,
            GameChosePathToContinueMessage.type.notification(msg.params)
          );
        }
      }
    );
    if (this._app) {
      this._app.destroy(true);
      this._app = undefined;
    }
    this._app = new Application(
      this._game,
      this.ref.gameView,
      this.ref.gameOverlay,
      this._audioContext
    );
    await this._app.init();
  }

  async updatePreview(file: string, line: number) {
    if (this._app && !this._app.initialized && this._app.initializing) {
      await this._app.initializing;
    } else {
      if (
        !this._app ||
        !this._app.initialized ||
        !this._game ||
        (this._game.state === "previewing" &&
          (this._game.program.uri !== this._program?.uri ||
            this._game.program.version !== this._program?.version))
      ) {
        // If haven't built game yet, or programs have changed since last build, build game.
        await this.buildGame({ file, line });
      }
    }
    if (this._game && this._game.state === "previewing") {
      this._game.preview(file, line);
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "spark-web-player": SparkWebPlayer;
  }
}
