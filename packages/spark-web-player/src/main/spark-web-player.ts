import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { ConnectedPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/ConnectedPreviewMessage";
import { LoadPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/LoadPreviewMessage";
import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import { ConfigureGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/ConfigureGameMessage";
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
import { GameWillSimulateChoicesMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameWillSimulateChoicesMessage";
import { GetGameEvaluationContextMessage } from "@impower/spark-engine/src/game/core/classes/messages/GetGameEvaluationContextMessage";
import { GetGamePossibleBreakpointLocationsMessage } from "@impower/spark-engine/src/game/core/classes/messages/GetGamePossibleBreakpointLocationsMessage";
import { GetGameScriptsMessage } from "@impower/spark-engine/src/game/core/classes/messages/GetGameScriptsMessage";
import { GetGameStackTraceMessage } from "@impower/spark-engine/src/game/core/classes/messages/GetGameStackTraceMessage";
import { GetGameThreadsMessage } from "@impower/spark-engine/src/game/core/classes/messages/GetGameThreadsMessage";
import { GetGameVariablesMessage } from "@impower/spark-engine/src/game/core/classes/messages/GetGameVariablesMessage";
import { LoadGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/LoadGameMessage";
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
import { DocumentLocation } from "@impower/spark-engine/src/game/core/types/DocumentLocation";
import { ScriptLocation } from "@impower/spark-engine/src/game/core/types/ScriptLocation";
import { findClosestPath } from "@impower/spark-engine/src/game/core/utils/findClosestPath";
import { ErrorType } from "@impower/spark-engine/src/protocol/enums/ErrorType";
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

  _scripts: string[] = [];

  _pathLocations: [string, ScriptLocation][] = [];

  _options?: {
    workspace?: string;
    simulateFrom?: { file: string; line: number } | null;
    simulateChoices?: Record<string, number[]> | null;
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

  protected updateExecutionLabels(params?: GameExecutedParams) {
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
        this.refs.connectionLabel.replaceChildren();
        this.refs.connectionLabel.appendChild(document.createTextNode("→"));
        if (params.choices.length > 0) {
          params.choices.forEach((choice, choiceIndex) => {
            const dropdownEl = this.createChoiceDropdown(choice, choiceIndex);
            this.refs.connectionLabel.appendChild(dropdownEl);
            this.refs.connectionLabel.appendChild(document.createTextNode("→"));
          });
        }
        this.refs.connectionLabel.appendChild(document.createTextNode(" 🞪 →"));
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
      this.refs.connectionLabel.replaceChildren();
      this.refs.connectionLabel.appendChild(document.createTextNode("→"));
      if (params.choices.length > 0) {
        params.choices.forEach((choice, choiceIndex) => {
          const dropdownEl = this.createChoiceDropdown(choice, choiceIndex);
          this.refs.connectionLabel.appendChild(dropdownEl);
          this.refs.connectionLabel.appendChild(document.createTextNode("→"));
        });
      }
      this.refs.executedLabel.textContent = `${filePath} : ${lineNumber}`;
      this.refs.executionInfo.hidden = false;
    } else {
      this.refs.executionInfo.hidden = true;
    }
  }

  createChoiceDropdown(
    choice: {
      options: string[];
      selected: number;
    },
    choiceIndex: number
  ) {
    const divEl = document.createElement("div");
    divEl.classList.add("choice");
    divEl.classList.toggle("forced", choice.selected !== 0);
    const selectEl = document.createElement("select");
    divEl.appendChild(selectEl);
    selectEl.onpointerdown = (e) => {
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    };
    selectEl.onpointerup = (e) => {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    };
    selectEl.onchange = (e) => {
      const optionIndex = Number((e.currentTarget as HTMLSelectElement).value);
      if (this._game) {
        this._options ??= {};
        this._options.simulateChoices ??= {};
        if (this._game.simulatePath) {
          this._options.simulateChoices[this._game.simulatePath] ??= [];
          this._options.simulateChoices[this._game.simulatePath]![choiceIndex] =
            optionIndex;
          this._options.simulateChoices = this._game.setSimulateChoices(
            this._options.simulateChoices ?? null
          );
        }
      }
      this.emit(
        MessageProtocol.event,
        GameWillSimulateChoicesMessage.type.notification({
          simulateChoices: this._options?.simulateChoices,
        })
      );
    };
    choice.options.forEach((option, optionIndex) => {
      const optionEl = document.createElement("option");
      optionEl.value = `${optionIndex}`;
      optionEl.selected = optionIndex === choice.selected;
      optionEl.textContent = `${optionIndex + 1}: ${option}`;
      selectEl.appendChild(optionEl);
    });
    const selectedcontentEl = document.createElement("div");
    selectedcontentEl.classList.add("selectedcontent");
    selectedcontentEl.textContent = `  [ ${choice.selected + 1} ]  `;
    divEl.appendChild(selectedcontentEl);
    return divEl;
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

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
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
    this.emit(MessageProtocol.event, GameStartedMessage.type.notification({}));
  };

  protected handlePointerDownFullscreenButton = (e: PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.stopPropagation();
  };

  protected handlePointerUpFullscreenButton = (e: PointerEvent) => {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
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
    const { workspace, simulateFrom, simulateChoices, startFrom } =
      message.params;
    this._options ??= {};
    if (workspace !== undefined) {
      this._options.workspace = workspace;
    }
    if (simulateFrom !== undefined) {
      this._options.simulateFrom =
        this._game?.setSimulateFrom(simulateFrom) ?? simulateFrom;
    }
    if (simulateChoices !== undefined) {
      this._options.simulateChoices =
        this._game?.setSimulateChoices(simulateChoices) ?? simulateChoices;
    }
    if (startFrom !== undefined) {
      this._options.startFrom =
        this._game?.setStartFrom(startFrom) ?? startFrom;
    }
    this.updateLaunchStateIcon();
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
      await this.updatePreview(textDocument.uri, line);
      this.updateLaunchStateIcon();
      return messageType.response(message.id, {});
    }
    return undefined;
  };

  protected handleLoadGame = async (
    messageType: typeof LoadGameMessage.type,
    message: LoadGameMessage.Request
  ) => {
    const { program } = message.params;
    this._program = program;
    this._pathLocations = Object.entries(this._program?.pathToLocation ?? {});
    this._scripts = Object.keys(this._program?.scripts ?? {});
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
    this.updateLaunchStateIcon();
    return messageType.response(message.id, {});
  };

  protected handleStartGame = async (
    messageType: typeof StartGameMessage.type,
    message: StartGameMessage.Request
  ) => {
    this.hidePlayButton();
    const success = await this.startGameAndApp();
    this.updateLaunchStateIcon();
    return success
      ? messageType.response(message.id, { success })
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
    if (this._game) {
      this._game.pause();
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
    if (this._game) {
      this._game.unpause();
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
    if (this._game) {
      this._game.skip(seconds);
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
    return this._game
      ? messageType.response(message.id, { done: this._game.step(traversal) })
      : messageType.error(message.id, {
          code: 1,
          message: "no game loaded",
        });
  };

  protected handleContinueGame = async (
    messageType: typeof ContinueGameMessage.type,
    message: ContinueGameMessage.Request
  ) => {
    return this._game
      ? messageType.response(message.id, { done: this._game.continue() })
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
    const simulateChoices = options?.simulateChoices;
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
      simulateChoices,
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
      GameEncounteredRuntimeErrorMessage.method,
      async (msg) => {
        if (GameEncounteredRuntimeErrorMessage.type.isNotification(msg)) {
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
      GameFinishedMessage.method,
      async (msg) => {
        if (GameFinishedMessage.type.isNotification(msg)) {
          await this.stopGame("finished");
        }
      }
    );
    this._game.connection.outgoing.addListener(
      GameStartedThreadMessage.method,
      (msg) => {
        if (GameStartedThreadMessage.type.isNotification(msg)) {
          this.emit(
            MessageProtocol.event,
            GameStartedThreadMessage.type.notification(msg.params)
          );
        }
      }
    );
    this._game.connection.outgoing.addListener(
      GameExitedThreadMessage.method,
      (msg) => {
        if (GameExitedThreadMessage.type.isNotification(msg)) {
          this.emit(
            MessageProtocol.event,
            GameExitedThreadMessage.type.notification(msg.params)
          );
        }
      }
    );
    this._game.connection.outgoing.addListener(
      GameExecutedMessage.method,
      (msg) => {
        if (GameExecutedMessage.type.isNotification(msg)) {
          this.updateExecutionLabels(msg.params);
          this.emit(
            MessageProtocol.event,
            GameExecutedMessage.type.notification(msg.params)
          );
        }
      }
    );
    this._game.connection.outgoing.addListener(
      GamePreviewedMessage.method,
      (msg) => {
        if (GamePreviewedMessage.type.isNotification(msg)) {
          this.emit(
            MessageProtocol.event,
            GamePreviewedMessage.type.notification(msg.params)
          );
        }
      }
    );
    this._game.connection.outgoing.addListener(
      GameSteppedMessage.method,
      (msg) => {
        if (GameSteppedMessage.type.isNotification(msg)) {
          this.emit(
            MessageProtocol.event,
            GameSteppedMessage.type.notification(msg.params)
          );
        }
      }
    );
    this._game.connection.outgoing.addListener(
      GameHitBreakpointMessage.method,
      (msg) => {
        if (GameHitBreakpointMessage.type.isNotification(msg)) {
          this.emit(
            MessageProtocol.event,
            GameHitBreakpointMessage.type.notification(msg.params)
          );
        }
      }
    );
    this._game.connection.outgoing.addListener(
      GameAwaitingInteractionMessage.method,
      (msg) => {
        if (GameAwaitingInteractionMessage.type.isNotification(msg)) {
          this.emit(
            MessageProtocol.event,
            GameAwaitingInteractionMessage.type.notification(msg.params)
          );
        }
      }
    );
    this._game.connection.outgoing.addListener(
      GameAutoAdvancedToContinueMessage.method,
      (msg) => {
        if (GameAutoAdvancedToContinueMessage.type.isNotification(msg)) {
          this.emit(
            MessageProtocol.event,
            GameAutoAdvancedToContinueMessage.type.notification(msg.params)
          );
        }
      }
    );
    this._game.connection.outgoing.addListener(
      GameClickedToContinueMessage.method,
      (msg) => {
        if (GameClickedToContinueMessage.type.isNotification(msg)) {
          this.emit(
            MessageProtocol.event,
            GameClickedToContinueMessage.type.notification(msg.params)
          );
        }
      }
    );
    this._game.connection.outgoing.addListener(
      GameChosePathToContinueMessage.method,
      (msg) => {
        if (GameChosePathToContinueMessage.type.isNotification(msg)) {
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

    return this._game;
  }

  async updatePreview(file: string, line: number, force?: boolean) {
    if (this._app && !this._app.initialized && this._app.initializing) {
      await this._app.initializing;
    }
    const previewFrom = { file, line };
    const previewPath = findClosestPath(
      previewFrom,
      this._pathLocations,
      this._scripts
    );
    const scenePath = previewPath?.split(".")[0] || "0";
    const sceneLocation = this._program?.sceneLocations?.[scenePath];
    let simulatePath: string | undefined | null = undefined;
    if (sceneLocation) {
      // Simulate from the start of the closest scene
      const [sceneIndex, sceneStartLine] = sceneLocation;
      const simulateFrom = {
        file: this._scripts[sceneIndex]!,
        line: sceneStartLine,
      };
      this._options ??= {};
      this._options.simulateFrom = simulateFrom;
      simulatePath = findClosestPath(
        simulateFrom,
        this._pathLocations,
        this._scripts
      );
    }
    const executedChoices = this._game?.choices.map((c) => c.selected) ?? [];
    const shouldSimulateChoices = Array.from(
      { length: executedChoices.length },
      (_, i) => this._options?.simulateChoices?.[simulatePath || ""]?.[i] ?? 0
    );
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
        (this._game.context.system.previewing !== previewPath ||
          JSON.stringify(executedChoices) !==
            JSON.stringify(shouldSimulateChoices)))
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
