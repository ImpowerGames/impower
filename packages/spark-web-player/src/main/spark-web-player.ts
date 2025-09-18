import { ConfigureGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/ConfigureGameMessage";
import { ContinueGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/ContinueGameMessage";
import { DisableGameDebugMessage } from "@impower/spark-editor-protocol/src/protocols/game/DisableGameDebugMessage";
import { EnableGameDebugMessage } from "@impower/spark-editor-protocol/src/protocols/game/EnableGameDebugMessage";
import { EnterGameFullscreenModeMessage } from "@impower/spark-editor-protocol/src/protocols/game/EnterGameFullscreenModeMessage";
import { ExitGameFullscreenModeMessage } from "@impower/spark-editor-protocol/src/protocols/game/ExitGameFullscreenModeMessage";
import { GameAutoAdvancedToContinueMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameAutoAdvancedToContinueMessage";
import { GameAwaitingInteractionMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameAwaitingInteractionMessage";
import { GameChosePathToContinueMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameChosePathToContinueMessage";
import { GameClickedToContinueMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameClickedToContinueMessage";
import { GameExecutedMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameExecutedMessage";
import { GameExitedMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameExitedMessage";
import { GameExitedThreadMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameExitedThreadMessage";
import { GameHitBreakpointMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameHitBreakpointMessage";
import { GamePreviewedMessage } from "@impower/spark-editor-protocol/src/protocols/game/GamePreviewedMessage";
import { GameReloadedMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameReloadedMessage";
import { GameResizedMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameResizedMessage";
import { GameStartedMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameStartedMessage";
import { GameStartedThreadMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameStartedThreadMessage";
import { GameSteppedMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameSteppedMessage";
import { GameToggledFullscreenModeMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameToggledFullscreenModeMessage";
import { GameWillSimulateFromMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameWillSimulateFromMessage";
import { GetGameEvaluationContextMessage } from "@impower/spark-editor-protocol/src/protocols/game/GetGameEvaluationContextMessage";
import { GetGamePossibleBreakpointLocationsMessage } from "@impower/spark-editor-protocol/src/protocols/game/GetGamePossibleBreakpointLocationsMessage";
import { GetGameScriptsMessage } from "@impower/spark-editor-protocol/src/protocols/game/GetGameScriptsMessage";
import { GetGameStackTraceMessage } from "@impower/spark-editor-protocol/src/protocols/game/GetGameStackTraceMessage";
import { GetGameThreadsMessage } from "@impower/spark-editor-protocol/src/protocols/game/GetGameThreadsMessage";
import { GetGameVariablesMessage } from "@impower/spark-editor-protocol/src/protocols/game/GetGameVariablesMessage";
import { LoadGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/LoadGameMessage";
import { PauseGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/PauseGameMessage";
import { ResizeGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/ResizeGameMessage";
import { RestartGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/RestartGameMessage";
import { SetGameBreakpointsMessage } from "@impower/spark-editor-protocol/src/protocols/game/SetGameBreakpointsMessage";
import { SetGameDataBreakpointsMessage } from "@impower/spark-editor-protocol/src/protocols/game/SetGameDataBreakpointsMessage";
import { SetGameFunctionBreakpointsMessage } from "@impower/spark-editor-protocol/src/protocols/game/SetGameFunctionBreakpointsMessage";
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
import { PreviewedMessage } from "@impower/spark-engine/src/game/core/classes/messages/PreviewedMessage";
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
    workspace?: string;
    simulateFrom?: { file: string; line: number } | null;
    startFrom?: { file: string; line: number } | null;
    previewFrom?: { file: string; line: number };
    breakpoints?: { file: string; line: number }[];
    functionBreakpoints?: { name: string }[];
    dataBreakpoints?: { dataId: string }[];
  };

  _loadListeners = new Set<() => void>();

  _isResizing = false;

  _resizeStartY = 0;

  _resizeStartHeight = 0;

  _gameResizeObserver?: ResizeObserver;

  _preloadedImages: Map<string, HTMLElement> = new Map();

  override onConnected() {
    window.addEventListener(MessageProtocol.event, this.handleProtocol);
    window.addEventListener("contextmenu", this.handleContextMenu, true);
    window.addEventListener("dragstart", this.handleDragStart);
    window.addEventListener("resize", this.handleResize);
    this.refs.playButton?.addEventListener("click", this.handleClickPlayButton);
    this.refs.toolbar?.addEventListener(
      "pointerdown",
      this.handlePointerDownToolbar
    );
    this.refs.toolbar?.addEventListener(
      "pointermove",
      this.handlePointerMoveToolbar
    );
    this.refs.toolbar?.addEventListener(
      "pointerup",
      this.handlePointerUpToolbar
    );
    this.refs.launchButton?.addEventListener(
      "pointerdown",
      this.handlePointerDownLaunchButton
    );
    this.refs.launchButton?.addEventListener(
      "pointerup",
      this.handlePointerUpLaunchButton
    );
    this.refs.launchButton?.addEventListener(
      "click",
      this.handleClickLaunchButton
    );
    this.refs.resetButton?.addEventListener(
      "pointerdown",
      this.handlePointerDownResetButton
    );
    this.refs.resetButton?.addEventListener(
      "pointerup",
      this.handlePointerUpResetButton
    );
    this.refs.resetButton?.addEventListener(
      "click",
      this.handleClickResetButton
    );
    this.refs.fullscreenButton?.addEventListener(
      "pointerdown",
      this.handlePointerDownFullscreenButton
    );
    this.refs.fullscreenButton?.addEventListener(
      "pointerup",
      this.handlePointerUpFullscreenButton
    );
    this.refs.fullscreenButton?.addEventListener(
      "click",
      this.handleClickFullscreenButton
    );
    this._gameResizeObserver = new ResizeObserver(this.handleResize);
    this._gameResizeObserver.observe(this.refs.game);
    this.updateSizeAndAspectRatioDisplay();
    this.emit(
      MessageProtocol.event,
      ConnectedPreviewMessage.type.notification({ type: "game" })
    );
  }

  override onDisconnected() {
    window.removeEventListener(MessageProtocol.event, this.handleProtocol);
    window.removeEventListener("contextmenu", this.handleContextMenu);
    window.removeEventListener("dragstart", this.handleDragStart);
    window.removeEventListener("resize", this.handleResize);
    this.refs.playButton?.removeEventListener(
      "click",
      this.handleClickPlayButton
    );
    this.refs.toolbar?.removeEventListener(
      "pointerdown",
      this.handlePointerDownToolbar
    );
    this.refs.toolbar?.removeEventListener(
      "pointermove",
      this.handlePointerMoveToolbar
    );
    this.refs.toolbar?.removeEventListener(
      "pointerup",
      this.handlePointerUpToolbar
    );
    this.refs.launchButton?.removeEventListener(
      "pointerdown",
      this.handlePointerDownLaunchButton
    );
    this.refs.launchButton?.removeEventListener(
      "pointerup",
      this.handlePointerUpLaunchButton
    );
    this.refs.launchButton?.removeEventListener(
      "click",
      this.handleClickLaunchButton
    );
    this.refs.resetButton?.removeEventListener(
      "pointerdown",
      this.handlePointerDownResetButton
    );
    this.refs.resetButton?.removeEventListener(
      "pointerup",
      this.handlePointerUpResetButton
    );
    this.refs.resetButton?.removeEventListener(
      "click",
      this.handleClickResetButton
    );
    this.refs.fullscreenButton?.removeEventListener(
      "pointerdown",
      this.handlePointerDownFullscreenButton
    );
    this.refs.fullscreenButton?.removeEventListener(
      "pointerup",
      this.handlePointerUpFullscreenButton
    );
    this.refs.fullscreenButton?.removeEventListener(
      "click",
      this.handleClickFullscreenButton
    );
    this._gameResizeObserver?.disconnect();
  }

  protected async hidePlayButton() {
    if (this.refs.playButton) {
      this.refs.playButton.style.pointerEvents = "none";
      this.refs.playButton.style.opacity = "0";
      const animations = this.refs.playButton.getAnimations();
      await Promise.allSettled(
        animations.map((animation) => animation.finished)
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
    const workspace = this._options?.workspace;
    const relativePath =
      workspace && path.startsWith(workspace)
        ? path.slice(workspace.length + 1)
        : path;
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
    this.refs.launchStateIcon.setAttribute("icon", icon);
  }

  protected getLaunchLocation() {
    if (!this._game) {
      return undefined;
    }
    const mainFallbackLocation = {
      uri: this._game.program.uri,
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      },
    };
    const location = this._game.simulatePath
      ? this._game.getPathDocumentLocation(this._game.simulatePath)
      : this._game.startPath
      ? this._game.getPathDocumentLocation(this._game.startPath)
      : mainFallbackLocation;
    if (this._game.state === "running") {
      return location ?? mainFallbackLocation;
    }
    return location;
  }

  protected updateResetButton() {
    const simulation = Boolean(this._options?.simulateFrom);
    if (simulation || this._game?.state === "running") {
      this.refs.resetButton.hidden = true;
    } else {
      this.refs.resetButton.hidden = false;
    }
  }

  protected updateLaunchButton() {
    const simulation = Boolean(this._options?.simulateFrom);
    this.refs.launchButton.classList.toggle("pinned", simulation);
    if (!simulation) {
      this.refs.locationItems.classList.toggle("error", false);
      this.refs.connectionLabel.textContent = `→`;
    }
  }

  protected updateExecutionLabels(params?: {
    locations: DocumentLocation[];
    simulation?: "none" | "simulating" | "success" | "fail";
  }) {
    this.refs.locationItems.classList.toggle(
      "error",
      params?.simulation === "fail"
    );
    const firstExecutedLocation = params?.locations?.[0];
    const lastExecutedLocation = params?.locations?.at(-1);
    if (!params || !this._game) {
      this.refs.leftItems.hidden = true;
      return;
    }
    this.refs.leftItems.hidden = false;
    if (this._game.simulatePath && params?.simulation === "fail") {
      const simulateFromLocation = this._game.getPathDocumentLocation(
        this._game.simulatePath
      );
      if (simulateFromLocation) {
        const filePath = this.getRelativeFilePath(simulateFromLocation.uri);
        const lineNumber = simulateFromLocation.range.start.line + 1;
        this.refs.launchLabel.textContent = `${filePath} : ${lineNumber}`;
      } else {
        this.refs.launchLabel.textContent = "";
      }
    } else if (firstExecutedLocation) {
      const filePath = this.getRelativeFilePath(firstExecutedLocation.uri);
      const lineNumber = firstExecutedLocation.range.start.line + 1;
      this.refs.launchLabel.textContent = `${filePath} : ${lineNumber}`;
    } else {
      this.refs.launchLabel.textContent = "";
    }
    if (this._game.startPath && params?.simulation === "fail") {
      const startFromLocation = this._game.getPathDocumentLocation(
        this._game.startPath
      );
      if (startFromLocation) {
        const filePath = this.getRelativeFilePath(startFromLocation.uri);
        const lineNumber = startFromLocation.range.end.line + 1;
        this.refs.connectionLabel.textContent = `→ 🞪 →`;
        this.refs.executedLabel.textContent = `${filePath} : ${lineNumber}`;
        this.refs.executionInfo.hidden = false;
      } else {
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
      this.refs.connectionLabel.textContent = `→`;
      this.refs.executedLabel.textContent = `${filePath} : ${lineNumber}`;
      this.refs.executionInfo.hidden = false;
    } else {
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
    this.refs.sizeLabel.textContent = sizeLabel;
    this.refs.aspectRatioLabel.textContent = aspectRatioLabel;
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

    this.refs.toolbar.classList.toggle("snapping", snapped);

    this.refs.toolbar.setPointerCapture(e.pointerId);
  };

  protected handlePointerMoveToolbar = (e: PointerEvent) => {
    if (!this._isResizing) {
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

    this.emit(
      MessageProtocol.event,
      GameResizedMessage.type.notification({ width, height: closestMatch })
    );
  };

  protected handlePointerUpToolbar = (e: PointerEvent) => {
    this._isResizing = false;
    document.body.style.cursor = "";
    this.refs.toolbar.classList.remove("snapping");
    this.refs.toolbar.releasePointerCapture(e.pointerId);
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

  protected handlePointerDownLaunchButton = (e: PointerEvent) => {
    this.refs.launchButton.setPointerCapture(e.pointerId);
    e.stopPropagation();
  };

  protected handlePointerUpLaunchButton = (e: PointerEvent) => {
    this.refs.launchButton.releasePointerCapture(e.pointerId);
  };

  protected handleClickLaunchButton = async () => {
    if (!this._game) {
      return;
    }
    if (this._options?.simulateFrom) {
      this._options ??= {};
      this._options.simulateFrom = this._game.setSimulateFrom(null);
    } else {
      const startFrom = this._game.startFrom ?? null;
      this._options ??= {};
      this._options.simulateFrom = this._game.setSimulateFrom(startFrom);
    }
    this.updateLaunchButton();
    this.updateResetButton();
    this.emit(
      MessageProtocol.event,
      GameWillSimulateFromMessage.type.notification({
        simulateFrom: this._options.simulateFrom,
      })
    );
  };

  protected handlePointerDownResetButton = (e: PointerEvent) => {
    this.refs.resetButton.setPointerCapture(e.pointerId);
    e.stopPropagation();
  };

  protected handlePointerUpResetButton = (e: PointerEvent) => {
    this.refs.resetButton.releasePointerCapture(e.pointerId);
  };

  protected handleClickResetButton = async () => {
    if (!this._game) {
      return;
    }
    if (this._game.state === "running") {
      await this.restartGame();
    } else {
      if (this._game.previewFrom) {
        await this.updatePreview(
          this._game.previewFrom.file,
          this._game.previewFrom.line,
          true
        );
      }
    }
  };

  protected handlePointerDownFullscreenButton = (e: PointerEvent) => {
    this.refs.fullscreenButton.setPointerCapture(e.pointerId);
    e.stopPropagation();
  };

  protected handlePointerUpFullscreenButton = (e: PointerEvent) => {
    this.refs.fullscreenButton.releasePointerCapture(e.pointerId);
  };

  protected handleClickFullscreenButton = async () => {
    this.emit(
      MessageProtocol.event,
      GameToggledFullscreenModeMessage.type.notification({})
    );
  };

  protected handleProtocol = async (e: Event) => {
    if (e instanceof CustomEvent) {
      if (ResizeGameMessage.type.is(e.detail)) {
        const response = await this.handleResizeGame(
          ResizeGameMessage.type,
          e.detail
        );
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (ConfigureGameMessage.type.is(e.detail)) {
        const response = await this.handleConfigureGame(
          ConfigureGameMessage.type,
          e.detail
        );
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (SetGameBreakpointsMessage.type.is(e.detail)) {
        const response = await this.handleSetGameBreakpoints(
          SetGameBreakpointsMessage.type,
          e.detail
        );
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (SetGameFunctionBreakpointsMessage.type.is(e.detail)) {
        const response = await this.handleSetGameFunctionBreakpoints(
          SetGameFunctionBreakpointsMessage.type,
          e.detail
        );
        if (response) {
          this.emit(MessageProtocol.event, response);
        }
      }
      if (SetGameDataBreakpointsMessage.type.is(e.detail)) {
        const response = await this.handleSetGameDataBreakpoints(
          SetGameDataBreakpointsMessage.type,
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
      if (EnterGameFullscreenModeMessage.type.is(e.detail)) {
        this.refs.viewport.classList.add("fullscreen");
      }
      if (ExitGameFullscreenModeMessage.type.is(e.detail)) {
        this.refs.viewport.classList.remove("fullscreen");
      }
    }
  };

  protected handleResizeGame = async (
    messageType: typeof ResizeGameMessage.type,
    message: ResizeGameMessage.Request
  ) => {
    const { height } = message.params;
    this.refs.game.style.height = `${height}px`;
    return messageType.response(message.id, {});
  };

  protected handleConfigureGame = async (
    messageType: typeof ConfigureGameMessage.type,
    message: ConfigureGameMessage.Request
  ) => {
    const { workspace, simulateFrom, startFrom } = message.params;
    this._options ??= {};
    if (workspace !== undefined) {
      this._options.workspace = workspace;
    }
    if (simulateFrom !== undefined) {
      this._options.simulateFrom =
        this._game?.setSimulateFrom(simulateFrom) ?? simulateFrom;
    }
    if (startFrom !== undefined) {
      this._options.startFrom =
        this._game?.setStartFrom(startFrom) ?? startFrom;
    }
    this.updateLaunchButton();
    this.updateLaunchStateIcon();
    this.updateResetButton();
    return messageType.response(message.id, {});
  };

  protected handleSetGameBreakpoints = async (
    messageType: typeof SetGameBreakpointsMessage.type,
    message: SetGameBreakpointsMessage.Request
  ) => {
    const { breakpoints } = message.params;
    this._options ??= {};
    this._options.breakpoints = breakpoints;
    const actualBreakpoints = this._game
      ? this._game.setBreakpoints(breakpoints)
      : [];
    return messageType.response(message.id, {
      breakpoints: actualBreakpoints,
    });
  };

  protected handleSetGameFunctionBreakpoints = async (
    messageType: typeof SetGameFunctionBreakpointsMessage.type,
    message: SetGameFunctionBreakpointsMessage.Request
  ) => {
    const { functionBreakpoints } = message.params;
    this._options ??= {};
    this._options.functionBreakpoints = functionBreakpoints;
    const actualFunctionBreakpoints = this._game
      ? this._game.setFunctionBreakpoints(functionBreakpoints)
      : [];
    return messageType.response(message.id, {
      functionBreakpoints: actualFunctionBreakpoints,
    });
  };

  protected handleSetGameDataBreakpoints = async (
    messageType: typeof SetGameDataBreakpointsMessage.type,
    message: SetGameDataBreakpointsMessage.Request
  ) => {
    const { dataBreakpoints } = message.params;
    this._options ??= {};
    this._options.dataBreakpoints = dataBreakpoints;
    const actualDataBreakpoints = this._game
      ? this._game.setDataBreakpoints(dataBreakpoints)
      : [];
    return messageType.response(message.id, {
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
    this.updateResetButton();
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
    this.updateResetButton();
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
      await this.updatePreview(textDocument.uri, line);
      this.updateLaunchStateIcon();
      this.updateResetButton();
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
    // Preload all images
    // TODO: Only preload images that are going to be shown before the next interaction
    this._preloadedImages.clear();
    const images = this._program.context?.["image"];
    if (images) {
      await Promise.all(
        Object.values(images).map((image) => this.preloadImage(image.src))
      );
    }
    // Notify program is loaded
    this._loadListeners.forEach((callback) => {
      callback();
    });
    this._loadListeners.clear();
    // Stop and restart game if we loaded a new game while the old game was running
    if (this._game && this._game.state === "running") {
      this.debouncedRestartGame();
      this.emit(
        MessageProtocol.event,
        GameReloadedMessage.type.notification({})
      );
    }
    this.updateLaunchButton();
    this.updateLaunchStateIcon();
    this.updateResetButton();
    return messageType.response(message.id, {});
  };

  protected handleStartGame = async (
    messageType: typeof StartGameMessage.type,
    message: StartGameMessage.Request
  ) => {
    this.hidePlayButton();
    const success = await this.startGameAndApp();
    this.updateLaunchStateIcon();
    this.updateResetButton();
    return success
      ? messageType.response(message.id, {})
      : messageType.error(message.id, {
          code: 1,
          message: !this._program?.compiled
            ? "The program contains errors that prevent it from being compiled"
            : `The game could not be started`,
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
    this.updateResetButton();
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
    this.updateResetButton();
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
    this.updateResetButton();
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

  async preloadImage(src: string) {
    if (src) {
      try {
        await new Promise((resolve, reject) => {
          const img = new Image();
          img.src = src;
          img.onload = () => {
            resolve(img);
          };
          img.onerror = () => {
            reject(img);
          };
          this._preloadedImages.set(src, img);
        });
      } catch (e) {
        console.warn("Could not preload: ", src);
      }
    }
  }

  async startGameAndApp(restarted?: boolean) {
    if (!this._program) {
      // wait for program to be loaded
      await new Promise<void>((resolve) => {
        this._loadListeners.add(resolve);
      });
    }
    this._options ??= {};
    this._options.previewFrom = undefined;
    await this.buildGame(restarted);
    const programCompiled = this._program?.compiled;
    const gameStarted = this._game?.start();
    const success = Boolean(programCompiled && gameStarted);
    if (success) {
      this._app?.start();
    }
    this.updateLaunchStateIcon();
    this.updateResetButton();
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
    this.updateResetButton();
  }

  async stopGame(
    reason: "finished" | "quit" | "invalidated" | "error" | "restart",
    error?: {
      message: string;
      location: DocumentLocation;
    }
  ) {
    const previewFrom = this._game?.getLastExecutedDocumentLocation();
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
    if (previewFrom) {
      await this.updatePreview(previewFrom.uri, previewFrom.range.start.line);
    }
  }

  async restartGame() {
    this.destroyGameAndApp();
    await this.startGameAndApp(true);
  }

  protected debouncedRestartGame = debounce(() => this.restartGame(), 100);

  async buildGame(restarted?: boolean) {
    const options = this._options;
    const simulateFrom = options?.simulateFrom;
    const startFrom = options?.startFrom;
    const previewFrom = options?.previewFrom;
    const breakpoints = options?.breakpoints;
    const functionBreakpoints = options?.functionBreakpoints;
    const dataBreakpoints = options?.dataBreakpoints;
    if (!this._program || !this._program.compiled) {
      return;
    }
    if (this._game) {
      this._game.destroy();
    }
    this._game = new Game(this._program, {
      restarted,
      simulateFrom,
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
        // TODO: Differentiate between script text response and asset blob response
        // const buffer = await response.arrayBuffer();
        // return buffer;
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
    this.updateExecutionLabels();
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
          if (this._game && this._game.state === "running") {
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
          this.updateExecutionLabels(msg.params);
          this.emit(
            MessageProtocol.event,
            GameExecutedMessage.type.notification(msg.params)
          );
        }
      }
    );
    this._game.connection.outgoing.addListener(
      PreviewedMessage.method,
      (msg) => {
        if (PreviewedMessage.type.isNotification(msg)) {
          this.emit(
            MessageProtocol.event,
            GamePreviewedMessage.type.notification(msg.params)
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
      this.refs.gameView,
      this.refs.gameOverlay,
      this._audioContext
    );
    await this._app.init();

    this.updateResetButton();

    return this._game;
  }

  async updatePreview(file: string, line: number, force?: boolean) {
    if (this._app && !this._app.initialized && this._app.initializing) {
      await this._app.initializing;
    }
    const previewPath = this._game?.getClosestPath(file, line);
    if (
      force ||
      !this._app ||
      !this._app.initialized ||
      !this._game ||
      (this._game.state === "previewing" &&
        (this._game.program.uri !== this._program?.uri ||
          this._game.program.version !== this._program?.version)) ||
      (this._game.state === "previewing" &&
        this._options?.simulateFrom &&
        previewPath &&
        this._game.context.system.previewing !== previewPath)
    ) {
      // If haven't built game yet, or programs have changed since last build, build game.
      this._options ??= {};
      this._options.previewFrom = { file, line };
      await this.buildGame();
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
