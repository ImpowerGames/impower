import { isRunnableProgram } from "@impower/sparkdown/src/compiler/utils/programSummary";
import { getSharedAssetCache } from "./main/assets/sharedAssetCache";
import { DisplayPreviewMessage } from "./main/workers/messages/DisplayPreviewMessage";
import type { WorkerDisplayWorkspace } from "./main/workers/WorkerDisplayWorkspace";
import {
  ProtocolObserver,
  sendProtocolMessage,
} from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { ConnectedPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/ConnectedPreviewMessage";
import { DidSelectTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidSelectTextDocumentMessage";
import { GameStateMessage, DidChangeGameStateMessage, type CompletionPreviewStatus, type GameState } from "@impower/spark-editor-protocol/src/protocols/preview/GameStateMessage";
import {
  PreviewCompletionMessage,
  type PreviewCompletionParams,
} from "@impower/spark-editor-protocol/src/protocols/textDocument/PreviewCompletionMessage";
import type { PreviewCompileProgramResult } from "@impower/sparkdown/src/compiler/classes/messages/PreviewCompileProgramMessage";
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
  type GameExecutedParams,
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
import type { DocumentLocation } from "@impower/spark-engine/src/game/core/types/DocumentLocation";
import { CompiledProgramMessage } from "@impower/sparkdown/src/compiler/classes/messages/CompiledProgramMessage";
import { RemovedCompilerFileMessage } from "@impower/sparkdown/src/compiler/classes/messages/RemovedCompilerFileMessage";
import { SelectedCompilerDocumentMessage } from "@impower/sparkdown/src/compiler/classes/messages/SelectedCompilerDocumentMessage";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { SparkdownWorkspace } from "@impower/sparkdown/src/workspace/classes/SparkdownWorkspace";
import { Application, type GameEndpoint } from "./app/Application";
import type { WorkerGameLink } from "./main/workers/WorkerGameLink";
import type { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import { toResponseError } from "@impower/jsonrpc/src/common/utils/toResponseError";
import type { Message } from "@impower/jsonrpc/src/common/types/Message";
import { ConnectPlayMessage } from "./main/workers/messages/ConnectPlayMessage";
import { PlayMessage } from "./main/workers/messages/PlayMessage";
import { StartPlayMessage } from "./main/workers/messages/StartPlayMessage";
import { StopPlayMessage } from "./main/workers/messages/StopPlayMessage";
import { conflate } from "./utils/conflate";
import { describeSimulationFailure } from "./utils/describeSimulationFailure";
import { programIdentity } from "./utils/programIdentity";
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

/** One autocomplete suggestion to preview: the request that asked for it, and
 *  what it would compile. */
export interface CompletionEvaluation {
  params: PreviewCompletionParams & {
    contentChanges: NonNullable<PreviewCompletionParams["contentChanges"]>;
  };
  key: string;
  filesRevision: number;
}

/** A suggestion that was drawn, with the program it was drawn from, so a
 *  return to it can draw it again without compiling. */
export interface ShownCompletion {
  evaluation: CompletionEvaluation;
  program: SparkProgram;
}

/** What a suggestion would compile, as one comparable string: the document
 *  and version the edit applies to, the edit, the line shown, and the project
 *  files it was compiled against. Two suggestions with the same key produce
 *  the same program and the same preview. */
export const completionKey = (
  params: Pick<
    PreviewCompletionParams,
    "textDocument" | "contentChanges" | "selectedRange"
  >,
  filesRevision: number,
) =>
  JSON.stringify([
    params.textDocument.uri,
    params.textDocument.version,
    params.selectedRange?.start.line ?? 0,
    filesRevision,
    params.contentChanges,
  ]);

/** How long a suggestion may be prepared before the status says so. Most
 *  finish sooner on a small project, and a message that flashes for a moment
 *  on every arrow key reads as flicker. */
const COMPLETION_PREPARING_STATUS_DELAY = 150;

// Module-level singleton. Set via setWorkspace() before any controller is
// constructed.
let workspace: (SparkdownWorkspace & WorkerDisplayWorkspace) | undefined;

export function setWorkspace(
  ws: SparkdownWorkspace & WorkerDisplayWorkspace,
): void {
  workspace = ws;
}

/** PLAY's game in the worker, as the page follows it. */
interface WorkerPlay {
  /** The summary of the program it runs. */
  program: SparkProgram;
  state: "starting" | "running";
  /** The run the worker built for it, once it has answered. */
  run?: number;
  /** Where the application that shows it hears it. */
  sink?: (message: Message) => void;
  /** How far the editor stepped the application's clock while PLAY started,
   *  which the worker's game is stepped by once it runs: steps add, so their
   *  order does not matter. */
  stepped: number;
  /** `player/startPlay` is sent: the game runs in the worker, whatever the
   *  start still brings it to. */
  startSent?: boolean;
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
  /** Where the autocomplete suggestion preview reports its state. */
  completionStatus?: HTMLElement | null;
}

export class GamePlayerController {
  protected host: HTMLElement;
  protected refs: GamePlayerRefs;

  _audioContext?: AudioContext;
  /** The preview the worker's game displays, while it does: the program
   *  whose frame the screen shows or is being drawn. */
  _workerGame?: { program?: SparkProgram };
  /** Stop listening to the worker's game. */
  _stopListeningToWorker?: () => void;
  /** PLAY's game in the worker, from the moment PLAY asks for it until it
   *  stops: the program it runs, and whether it has started. */
  _workerPlay?: WorkerPlay;
  /** Stop listening to PLAY's game in the worker. */
  _stopListeningToPlay?: () => void;
  /** PLAY is setting up its game, so no preview may take the screen. */
  _startingPlay = false;
  _app?: Application;
  _debugging = false;
  _program?: SparkProgram;
  private _mounted = false;
  private _previewPosition: GameState["position"] = null;
  private _selectionVersion = 0;
  private _launchState: GameState["launchState"] = null;
  /** Counts the preview updates, so one that another overtakes while it
   *  waits can tell (`updatePreview`). */
  _previewUpdates = 0;

  // ---- Autocomplete suggestion previews -----------------------------------
  //
  // A highlighted suggestion is compiled as a hypothetical edit and shown in
  // place of the real document until the list closes. Everything below keeps
  // that hypothetical program out of the real state above: `_program` always
  // describes the real document, which is what PLAY and the next real preview
  // start from.
  //
  // A suggestion is identified by what it would compile (`completionKey`), not
  // by when it was asked for, so returning to a suggestion reuses a result
  // that is still on screen, and a result for anything but the newest wanted
  // suggestion is dropped before it can touch the screen or the status.
  /** The list being previewed, while it is open. */
  _completionSession: { uri: string; session: number } | null = null;
  /** The newest `textDocument/previewCompletion` handled. */
  _completionRequest = 0;
  /** The suggestion the screen should show, or null for the real document. */
  _completionWanted: CompletionEvaluation | null = null;
  /** The one suggestion being compiled; at most one at a time. */
  _completionEvaluating: CompletionEvaluation | null = null;
  /** The newest suggestion waiting for that compile to finish. A newer one
   *  replaces it, so holding an arrow key queues nothing. */
  _completionPending: CompletionEvaluation | null = null;
  /** The last suggestion drawn completely, with the program it was drawn
   *  from. The screen shows it while the game still holds its program. */
  _completionShown: ShownCompletion | null = null;
  _completionStatus: CompletionPreviewStatus | null = null;
  _completionStatusTimer = 0;
  /** Counts suggestion programs, so each gets a version no real program has
   *  and the game always swaps programs to show one. */
  _completionPrograms = 0;
  /** After an accepted suggestion whose frame is on screen: keep it until a
   *  program compiled from the accepted document arrives. */
  _completionAccepted: { uri: string; version: number } | null = null;
  /** Every suggestion program handed to the game. */
  _completionProgramSet = new WeakSet<SparkProgram>();
  /** The newest real program would not compile. */
  _canonicalInvalid = false;

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
    breakpoints?: { file: string; line: number }[];
    functionBreakpoints?: { name: string }[];
    dataBreakpoints?: { dataId: string }[];
    /** What the editor last asked of the preview's debug toggle, which the
     *  game built next enters as the breakpoints above are applied to it. */
    debugging?: boolean;
  };

  private _resolveLoadingInitialProgram!: () => void;
  private _loadingInitialProgram?: Promise<void> = new Promise<void>(
    (resolve) => {
      this._resolveLoadingInitialProgram = resolve;
    },
  );
  /** The program whose frame the screen shows, or is being drawn. */
  get screenProgram(): SparkProgram | undefined {
    return this._workerPlay?.program ?? this._workerGame?.program;
  }

  /** PLAY runs, or is starting in the worker: nothing previews, and a new
   *  program restarts the run. */
  get playing(): boolean {
    return this._workerPlay != null;
  }

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
    this._mounted = true;
    this.publishGameState();
    window.addEventListener("contextmenu", this.handleContextMenu, true);
    window.addEventListener("dragstart", this.handleDragStart);
    window.addEventListener("resize", this.handleResize);
    // Unlock/adopt the shared AudioContext on the first user interaction with the
    // preview so voices start playing immediately (browsers require a gesture).
    window.addEventListener("pointerdown", this.handleUserInteraction, true);
    window.addEventListener("keydown", this.handleUserInteraction, true);
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
    if (this._completionStatusTimer) {
      clearTimeout(this._completionStatusTimer);
      this._completionStatusTimer = 0;
    }
    this._mounted = false;
    this._stops += 1;
    this._previewPosition = null;
    this._selectionVersion++;
    this._launchState = null;
    this.publishGameState();
    this._protocols.dispose();
    // What the worker's games show goes with the controller, as it goes when
    // the preview detaches or PLAY stops, and so does PLAY's application,
    // which no detach reaches.
    this.releaseGames().catch(console.error);
    window.removeEventListener("contextmenu", this.handleContextMenu);
    window.removeEventListener("dragstart", this.handleDragStart);
    window.removeEventListener("resize", this.handleResize);
    window.removeEventListener("pointerdown", this.handleUserInteraction, true);
    window.removeEventListener("keydown", this.handleUserInteraction, true);
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
      : this._workerPlay?.state === "running"
        ? "play"
        : "preview";
    this.refs.launchStateIcon?.setAttribute("icon", icon);
    this._launchState = icon;
    this.publishGameState();
  }

  getGameState(): GameState {
    return {
      mounted: this._mounted,
      programLoaded: this._mounted && this._program != null && this._launchState != null,
      programVersion: this._program?.version ?? null,
      launchState: this._launchState,
      position: this._previewPosition,
      completion: this._completionStatus
        ? { request: this._completionRequest, status: this._completionStatus }
        : null,
    };
  }

  private publishGameState() {
    sendProtocolMessage(DidChangeGameStateMessage.type.notification(this.getGameState()), this.host);
  }

  protected updateExecutionLabels(params?: GameExecutedParams) {
    if (!this.refs.locationItems || !this.refs.leftItems) {
      return;
    }
    this.refs.locationItems.classList.toggle(
      "error",
      params?.simulation === "fail",
    );
    // The row turning red is the only thing that ever told an author a preview
    // could not be simulated. Hovering it now says why. Attached to the whole
    // row rather than to the 🞪 alone so that a failure with no 🞪 to point at
    // (a line that is not part of the story flow) is still explained, and so
    // there is no small target to find.
    const failureMessage = describeSimulationFailure(
      params?.simulation,
      params?.simulationFailure,
    );
    if (failureMessage) {
      this.refs.locationItems.title = failureMessage;
      this.refs.locationItems.setAttribute("aria-label", failureMessage);
    } else {
      this.refs.locationItems.removeAttribute("title");
      this.refs.locationItems.removeAttribute("aria-label");
    }
    const firstExecutedLocation = params?.firstLocation;
    const lastExecutedLocation = params?.lastLocation;
    if (!params || (!this._workerGame && !this._workerPlay)) {
      this.refs.leftItems.hidden = true;
      return;
    }
    this.refs.leftItems.hidden = false;
    // The page holds only a program's summary, which has no locations to
    // look paths up in: the worker that holds the program sends them with
    // the report.
    if (
      (this._program || params.simulateLocation) &&
      params.simulatePath &&
      params.simulation === "fail"
    ) {
      const simulateFromLocation = params.simulateLocation;
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
    if (
      (this._program || params.startLocation) &&
      params.startPath &&
      params.simulation === "fail"
    ) {
      const startFromLocation = params.startLocation;
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

  // Create ONE shared AudioContext (cached on the controller) and resume it once
  // the user has interacted with the page — browsers gate audio behind a user
  // gesture. It is reused for every Application built afterward (the preview's
  // after each detach, and each PLAY's), so no new context is minted per
  // application. Applied to the live app immediately once running, so preview
  // audio (character voices, sfx) starts on the first interaction.
  ensureAudioContext = async (): Promise<void> => {
    if (!this._audioContext) {
      this._audioContext = new AudioContext();
    }
    if (this._audioContext.state !== "running") {
      try {
        await this._audioContext.resume();
      } catch {}
    }
    if (this._audioContext.state === "running") {
      this._app?.setAudioContext(this._audioContext);
    }
  };

  protected handleUserInteraction = () => {
    void this.ensureAudioContext();
  };

  protected handleClickPlayButton = async () => {
    await this.ensureAudioContext();
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
    p.onNotification(
      PreviewCompletionMessage.type,
      this.handlePreviewCompletion,
    );

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
    p.onRequest(GameStateMessage.type, (m) => GameStateMessage.type.response(m.id, this.getGameState()), this.host);
    p.onNotification(DidSelectTextDocumentMessage.type, (m) => {
      if (m.params.userEvent) {
        this._selectionVersion++;
        this._previewPosition = null;
        this.publishGameState();
      }
    });
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
    const { textDocument, selectedRange, userEvent, programOutdated } =
      message.params;
    if (userEvent) {
      if (
        this._completionSession &&
        this._completionSession.uri !== textDocument.uri
      ) {
        // The author is working in another document, so the list that was
        // open there is gone even if its editor never said so.
        this.endCompletionPreview();
      }
      const startFrom = {
        file: textDocument.uri,
        line: selectedRange.start.line,
      };
      this._options ??= {};
      this._options.startFrom = startFrom;
      this._previewPosition = null;
      this.publishGameState();
      if (this._program && !this.playing) {
        if (!(startFrom.file in this._program.scripts)) {
          if (workspace) {
            // Ensure the workspace re-compiles document so preview can be updated
            await workspace.compileTextDocument({ textDocument });
          }
        } else if (!programOutdated && !this.completionPreviewHoldsScreen()) {
          await this.updatePreview(
            this._program,
            startFrom.file,
            startFrom.line,
          );
        }
        // A selection is answered by looking its line up in the program's path
        // locations, and `programOutdated` says a script that program was built
        // from has been edited since. Those locations then describe where the
        // script's lines used to be, so this line would preview a different
        // beat — the one that stood at this line number before the edit
        // (#489). Nothing happens here in that case: the selection is recorded
        // above, and the compile the edit scheduled starts from it, so
        // `loadProgram` previews it as soon as that program arrives.
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
    if (this._previewPosition?.uri === textDocument.uri || !this._options.startFrom) {
      this._previewPosition = null;
      this._selectionVersion++;
      this.publishGameState();
    }
  };

  protected handlePreviewCompletion = async (
    message: PreviewCompletionMessage.Notification,
  ) => {
    const params = message.params;
    if (params.request <= this._completionRequest) {
      return;
    }
    this._completionRequest = params.request;
    if (params.state === "close") {
      await this.closeCompletionPreview(params);
      return;
    }
    if (!this.completionPreviewEligible()) {
      // A hidden or playing preview takes no part: nothing is compiled, and
      // nothing it shows changes.
      return;
    }
    this._completionSession = {
      uri: params.textDocument.uri,
      session: params.session,
    };
    this._completionAccepted = null;
    if (!params.contentChanges) {
      // The editor could not work out what accepting would insert. Keep the
      // frame and say so, rather than preview a guess.
      this._completionWanted = null;
      this._completionPending = null;
      this.setCompletionStatus("unavailable");
      const request = params.request;
      await this.restoreCompletionFrame(
        this._completionShown,
        () => this._completionRequest === request,
      );
      return;
    }
    await this.wantCompletion(
      this.completionEvaluation({
        ...params,
        contentChanges: params.contentChanges,
      }),
    );
  };

  /** A suggestion as the preview compiles it: its request, and its key
   *  against the project files as they are now. */
  completionEvaluation(
    params: PreviewCompletionParams & {
      contentChanges: NonNullable<PreviewCompletionParams["contentChanges"]>;
    },
  ): CompletionEvaluation {
    const filesRevision = workspace?.filesRevision ?? 0;
    return {
      params,
      key: completionKey(params, filesRevision),
      filesRevision,
    };
  }

  isWantedCompletion(evaluation: CompletionEvaluation) {
    return this._completionWanted?.key === evaluation.key;
  }

  /** Make `evaluation` the suggestion the screen should show. */
  async wantCompletion(evaluation: CompletionEvaluation) {
    this._completionWanted = evaluation;
    const shown = this._completionShown;
    if (shown && shown.evaluation.key === evaluation.key) {
      this._completionPending = null;
      if (this.screenProgram === shown.program) {
        // Back to the suggestion on screen.
        this.setCompletionStatus("showing");
        return;
      }
      // A later suggestion began drawing over it before being abandoned.
      // Draw this one again from the result kept for it, without compiling.
      this.setCompletionStatus("preparing");
      await this.drawCompletion(shown.evaluation, shown);
      return;
    }
    if (evaluation.key === this._completionEvaluating?.key) {
      // The compile in flight answers this one.
      this._completionPending = null;
      return;
    }
    this._completionPending = evaluation;
    this.setCompletionStatus("preparing");
    await this.evaluateCompletionPreviews();
  }

  /** The game holds a program the real document did not produce, so what it
   *  reports about what it ran is not the author's and is not passed on. */
  get displayingSpeculative() {
    const program = this.screenProgram;
    return program != null && this._completionProgramSet.has(program);
  }

  /** Only a preview that is open and stopped shows suggestions. */
  completionPreviewEligible() {
    if (!this._mounted || this.playing) {
      return false;
    }
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return false;
    }
    const game = this.refs.game;
    // A collapsed pane leaves the player mounted at no size at all.
    return !game || !(game.clientWidth === 0 && game.clientHeight === 0);
  }

  /** Compile the pending suggestion, one at a time, and show the result if it
   *  is still the one wanted when it arrives. */
  async evaluateCompletionPreviews() {
    const evaluation = this._completionPending;
    if (this._completionEvaluating || !evaluation || !workspace) {
      return;
    }
    this._completionPending = null;
    this._completionEvaluating = evaluation;
    const { params } = evaluation;
    const line = params.selectedRange?.start.line ?? 0;
    let result: PreviewCompileProgramResult | undefined;
    try {
      result = await workspace.previewCompile({
        textDocument: params.textDocument,
        contentChanges: params.contentChanges,
        startFrom: { file: params.textDocument.uri, line },
      });
    } catch (e) {
      console.error(e);
    } finally {
      this._completionEvaluating = null;
    }
    // Start on the next suggestion before showing this one, so the compiler
    // is never idle while a newer suggestion waits.
    void this.evaluateCompletionPreviews();
    if (
      !this.isWantedCompletion(evaluation) ||
      !this.completionPreviewEligible()
    ) {
      return;
    }
    if (evaluation.filesRevision !== (workspace.filesRevision ?? 0)) {
      // A project file changed while this compiled, so the result may name
      // assets as they were. Compile the same suggestion again.
      await this.wantCompletion(this.completionEvaluation(params));
      return;
    }
    if (result?.outdated) {
      // The document moved on; the editor sends the suggestion again against
      // the new version.
      return;
    }
    const program = result?.program;
    if (!result || !program || !isRunnableProgram(program)) {
      this.setCompletionStatus("unavailable");
      await this.restoreCompletionFrame(this._completionShown, () =>
        this.isWantedCompletion(evaluation),
      );
      return;
    }
    program.version = -++this._completionPrograms;
    this._completionProgramSet.add(program);
    await this.drawCompletion(evaluation, { program });
  }

  /** Draw a suggestion's program. The draw is abandoned as soon as another
   *  suggestion, the real document or PLAY is wanted instead, so nothing
   *  drawn for a suggestion that stopped being wanted is finished. */
  async drawCompletion(
    evaluation: CompletionEvaluation,
    result: Omit<ShownCompletion, "evaluation">,
  ) {
    const drawn = await this.updatePreview(
      result.program,
      evaluation.params.textDocument.uri,
      evaluation.params.selectedRange?.start.line ?? 0,
      { speculative: true, current: () => this.isWantedCompletion(evaluation) },
    );
    if (drawn) {
      this._completionShown = { evaluation, ...result };
      this.setCompletionStatus("showing");
    }
    return drawn;
  }

  /** Put the last complete frame back when a draw was abandoned part way
   *  through and nothing newer is going to replace it, so a suggestion that
   *  cannot be shown leaves the screen as it found it. */
  async restoreCompletionFrame(
    shown: ShownCompletion | null,
    current: () => boolean,
  ) {
    if (!this._workerGame || this.playing) {
      return;
    }
    if (shown) {
      if (this.screenProgram !== shown.program) {
        await this.updatePreview(
          shown.program,
          shown.evaluation.params.textDocument.uri,
          shown.evaluation.params.selectedRange?.start.line ?? 0,
          { speculative: true, current },
        );
      }
      return;
    }
    const startFrom = this._options?.startFrom;
    if (this.displayingSpeculative && this._program && startFrom) {
      await this.updatePreview(this._program, startFrom.file, startFrom.line, {
        current,
      });
    }
  }

  /** A real compile arrived while a list is open. When project files changed
   *  since the wanted suggestion was compiled, it names assets as they were:
   *  compile it again against the files as they are. */
  async refreshCompletionFiles() {
    const wanted = this._completionWanted;
    if (!wanted || !workspace || wanted.filesRevision === workspace.filesRevision) {
      return;
    }
    await this.wantCompletion(this.completionEvaluation(wanted.params));
  }

  /** The list closed. Hand the screen back to the real document. */
  async closeCompletionPreview(
    params: Pick<
      PreviewCompletionParams,
      "textDocument" | "request" | "accepted"
    >,
  ) {
    const shown = this._completionShown;
    this._completionSession = null;
    this._completionWanted = null;
    this._completionPending = null;
    this._completionShown = null;
    const accepted = params.accepted;
    if (
      accepted &&
      shown &&
      this.screenProgram === shown.program &&
      shown.evaluation.params.textDocument.uri === params.textDocument.uri &&
      shown.evaluation.params.textDocument.version === accepted.version &&
      JSON.stringify(shown.evaluation.params.contentChanges) ===
        JSON.stringify(accepted.contentChanges)
    ) {
      // The frame on screen is the document the acceptance produced. Keep it
      // until that document's own program arrives, rather than flash back to
      // the document as it was before.
      this._completionAccepted = {
        uri: params.textDocument.uri,
        version: params.textDocument.version,
      };
      this.setCompletionStatus(null);
      return;
    }
    if (
      this.displayingSpeculative ||
      this._canonicalInvalid ||
      (this._program &&
        this.screenProgram &&
        this.screenProgram !== this._program)
    ) {
      // A suggestion is on screen, the real document cannot be previewed, or
      // real programs compiled while the list was open were held back.
      await this.showRealDocument(
        shown,
        () => this._completionRequest === params.request,
      );
      return;
    }
    this.setCompletionStatus(null);
  }

  /** Show the real document's newest program at the author's line, from what
   *  this controller already holds, without waiting for any compile. */
  async showRealDocument(
    shown: ShownCompletion | null,
    current: () => boolean,
  ) {
    const startFrom = this._options?.startFrom;
    if (this._canonicalInvalid || !this._program || !startFrom) {
      // The real document cannot be previewed, so the last complete frame
      // stays, marked as not the document's. A suggestion abandoned part way
      // through drawing is not a complete frame.
      this.setCompletionStatus("stale");
      await this.restoreCompletionFrame(shown, current);
      return;
    }
    this.setCompletionStatus(null);
    if (this.playing) {
      return;
    }
    await this.updatePreview(this._program, startFrom.file, startFrom.line);
  }

  /** Whether the screen belongs to a suggestion rather than to `program`, the
   *  newest real program: while a list is open, and after an accepted
   *  suggestion until the program compiled from the accepted document. */
  completionPreviewHoldsScreen(program?: SparkProgram) {
    if (this._completionSession) {
      return true;
    }
    const accepted = this._completionAccepted;
    if (accepted) {
      const version = program?.scripts?.[accepted.uri];
      if (version == null || version < accepted.version) {
        return true;
      }
      this._completionAccepted = null;
    }
    return false;
  }

  /** End every suggestion preview at once: nothing in flight or waiting may
   *  reach the screen afterwards. */
  endCompletionPreview() {
    this._completionSession = null;
    this._completionWanted = null;
    this._completionPending = null;
    this._completionShown = null;
    this._completionAccepted = null;
    this.setCompletionStatus(null);
  }

  setCompletionStatus(status: CompletionPreviewStatus | null) {
    if (this._completionStatusTimer) {
      clearTimeout(this._completionStatusTimer);
      this._completionStatusTimer = 0;
    }
    const changed = status !== this._completionStatus;
    this._completionStatus = status;
    const element = this.refs.completionStatus;
    if (element) {
      const write = () => {
        const text = this.completionStatusText(status);
        element.textContent = text;
        element.hidden = !text;
        if (status) {
          element.setAttribute("state", status);
        } else {
          element.removeAttribute("state");
        }
      };
      if (status === "preparing" && element.hidden) {
        this._completionStatusTimer = window.setTimeout(() => {
          this._completionStatusTimer = 0;
          write();
        }, COMPLETION_PREPARING_STATUS_DELAY);
      } else {
        write();
      }
    }
    if (changed) {
      this.publishGameState();
    }
  }

  completionStatusText(status: CompletionPreviewStatus | null) {
    const hasFrame = this._workerGame != null || this._workerPlay != null;
    switch (status) {
      case "preparing":
        return "Preparing suggestion preview…";
      case "showing":
        return "Previewing suggestion";
      case "unavailable":
        return hasFrame
          ? "Cannot preview this suggestion yet — showing the last valid preview"
          : "Cannot preview this suggestion yet";
      case "stale":
        return "Cannot preview the current document — showing the last valid preview";
      default:
        return "";
    }
  }

  protected handleCompiledProgram = async (
    message: CompiledProgramMessage.Notification,
  ) => {
    await this.loadProgram(message.params.program);
  };

  protected handleResizeGame = async (message: ResizeGameMessage.Request) => {
    const { height } = message.params;
    this.refs.game.style.height = `${height}px`;
    return ResizeGameMessage.type.response(message.id, {});
  };

  /** Ask the game in the worker the page talks to: PLAY's while it runs
   *  there, and otherwise the one that displays the preview. Answers
   *  undefined with no worker to ask, and rejects with a request the worker
   *  fails. The worker records what the editor asks of the debugger for the
   *  games it builds later, so a request never waits for PLAY to start. */
  protected async askWorkerGame<M extends string, P, R>(
    type: MessageProtocolRequestType<M, P, R>,
    params: P,
  ): Promise<R | undefined> {
    return workspace?.gameLink?.request(type, params);
  }

  protected handleSetGameBreakpoints = async (
    message: SetGameBreakpointsMessage.Request,
  ) => {
    const { breakpoints } = message.params;
    this._options ??= {};
    this._options.breakpoints = breakpoints;
    const actualBreakpoints =
      (
        await this.askWorkerGame(SetGameBreakpointsMessage.type, {
          breakpoints,
        })
      )?.breakpoints ?? [];
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
    const actualFunctionBreakpoints =
      (
        await this.askWorkerGame(SetGameFunctionBreakpointsMessage.type, {
          functionBreakpoints,
        })
      )?.functionBreakpoints ?? [];
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
    const actualDataBreakpoints =
      (
        await this.askWorkerGame(SetGameDataBreakpointsMessage.type, {
          dataBreakpoints,
        })
      )?.dataBreakpoints ?? [];
    return SetGameDataBreakpointsMessage.type.response(message.id, {
      dataBreakpoints: actualDataBreakpoints,
    });
  };

  /** Turn debugging on or off for whichever game shows the preview, and
   *  remember it for the game built next, as the breakpoints are remembered.
   *  Answers the editor either way: a worker that fails is a failure to
   *  report, not a request to leave unanswered. */
  protected setDebugging = async (debugging: boolean): Promise<boolean> => {
    this._options ??= {};
    this._options.debugging = debugging;
    const type = debugging
      ? EnableGameDebugMessage.type
      : DisableGameDebugMessage.type;
    try {
      // The stopped preview the worker's game displays enters the mode too,
      // so its beat is coloured as PLAY's game colours it. A worker with no
      // game yet records it for the one it builds, and answers.
      await this.askWorkerGame(type, {});
      return true;
    } catch (e) {
      // The worker could not be asked. The mode is recorded for the game
      // built next either way, but the editor is told this did not take.
      console.error(e);
      return false;
    }
  };

  protected handleEnableGameDebug = async (
    message: EnableGameDebugMessage.Request,
  ) => {
    const debugging = await this.setDebugging(true);
    this.updateLaunchStateIcon();
    return debugging
      ? EnableGameDebugMessage.type.response(message.id, {})
      : EnableGameDebugMessage.type.error(message.id, {
          code: 1,
          message: "no game loaded",
        });
  };

  protected handleDisableGameDebug = async (
    message: DisableGameDebugMessage.Request,
  ) => {
    const stopped = await this.setDebugging(false);
    this.updateLaunchStateIcon();
    return stopped
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
          message: !isRunnableProgram(this._program)
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

  /** Tell PLAY's game in the worker what its application was just told, so
   *  the worker's clock and the page's managers agree. While PLAY starts,
   *  the worker has no PLAY game yet: the start brings the game to its
   *  application's state as it starts (`startWorkerPlay`), so a pause is
   *  read from the application then and a clock step is added up. Answers
   *  whether it took: a worker that fails is a failure to report to the
   *  editor. */
  protected async tellWorkerPlay<M extends string, P, R>(
    type: MessageProtocolRequestType<M, P, R>,
    params: P,
  ): Promise<boolean> {
    const play = this._workerPlay;
    if (!play) {
      return true;
    }
    if (play.state === "starting") {
      // An application built later starts as the game does, so only what
      // its application heard counts.
      if (this._app && type.method === StepGameClockMessage.method) {
        play.stepped += (params as { seconds: number }).seconds;
      }
      return true;
    }
    try {
      await this.askWorkerGame(type, params);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  protected handlePauseGame = async (message: PauseGameMessage.Request) => {
    if (this._app) {
      this._app.pause();
    }
    const told = await this.tellWorkerPlay(PauseGameMessage.type, {});
    this.updateLaunchStateIcon();
    return this._app && told
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
    const told = await this.tellWorkerPlay(UnpauseGameMessage.type, {});
    this.updateLaunchStateIcon();
    return this._app && told
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
    const told = await this.tellWorkerPlay(StepGameClockMessage.type, {
      seconds,
    });
    this.updateLaunchStateIcon();
    return this._app && told
      ? StepGameClockMessage.type.response(message.id, {})
      : StepGameClockMessage.type.error(message.id, {
          code: 1,
          message: "no game loaded",
        });
  };

  protected handleStepGame = async (message: StepGameMessage.Request) => {
    const { traversal } = message.params;
    // What the worker fails with, a game it does not hold among it, is the
    // editor's answer.
    let answer: { done: boolean } | undefined;
    try {
      answer = await this.askWorkerGame(StepGameMessage.type, { traversal });
    } catch (e) {
      return StepGameMessage.type.error(message.id, toResponseError(e));
    }
    if (answer) {
      return StepGameMessage.type.response(message.id, answer);
    }
    return StepGameMessage.type.error(message.id, {
      code: 1,
      message: "no game loaded",
    });
  };

  protected handleContinueGame = async (
    message: ContinueGameMessage.Request,
  ) => {
    let answer: { done: boolean } | undefined;
    try {
      answer = await this.askWorkerGame(
        ContinueGameMessage.type,
        message.params,
      );
    } catch (e) {
      return ContinueGameMessage.type.error(message.id, toResponseError(e));
    }
    if (answer) {
      return ContinueGameMessage.type.response(message.id, answer);
    }
    return ContinueGameMessage.type.error(message.id, {
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
    const answer = await this.askWorkerGame(
      GetGameThreadsMessage.type,
      message.params,
    );
    if (answer) {
      return GetGameThreadsMessage.type.response(message.id, answer);
    }
    return GetGameThreadsMessage.type.error(message.id, {
      code: 1,
      message: "no game loaded",
    });
  };

  protected handleGetGamePossibleBreakpointLocations = async (
    message: GetGamePossibleBreakpointLocationsMessage.Request,
  ) => {
    const answer = await this.askWorkerGame(
      GetGamePossibleBreakpointLocationsMessage.type,
      message.params,
    );
    if (answer) {
      return GetGamePossibleBreakpointLocationsMessage.type.response(
        message.id,
        answer,
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
    const answer = await this.askWorkerGame(
      GetGameStackTraceMessage.type,
      message.params,
    );
    if (answer) {
      return GetGameStackTraceMessage.type.response(message.id, answer);
    }
    return GetGameStackTraceMessage.type.error(message.id, {
      code: 1,
      message: "no game loaded",
    });
  };

  protected handleGetGameEvaluationContext = async (
    message: GetGameEvaluationContextMessage.Request,
  ) => {
    const answer = await this.askWorkerGame(
      GetGameEvaluationContextMessage.type,
      message.params,
    );
    if (answer) {
      return GetGameEvaluationContextMessage.type.response(message.id, answer);
    }
    return GetGameEvaluationContextMessage.type.error(message.id, {
      code: 1,
      message: "no game loaded",
    });
  };

  protected handleGetGameVariables = async (
    message: GetGameVariablesMessage.Request,
  ) => {
    const answer = await this.askWorkerGame(
      GetGameVariablesMessage.type,
      message.params,
    );
    if (answer) {
      return GetGameVariablesMessage.type.response(message.id, answer);
    }
    return GetGameVariablesMessage.type.error(message.id, {
      code: 1,
      message: "no game loaded",
    });
  };

  loadProgram = conflate(
    async (program: SparkProgram) => {
      if (!isRunnableProgram(program)) {
        console.error("Program not compiled", program);
        this._canonicalInvalid = true;
        if (!this._completionSession && this.displayingSpeculative) {
          this.setCompletionStatus("stale");
        }
        return;
      }
      this._canonicalInvalid = false;
      const isInitialProgram = !this._program;
      this._program = program;
      if (!this._startingPlay && !this._workerAppBuilding) {
        // The worker keeps each real program the page can still name. PLAY
        // that is starting, and a display waiting for the worker's
        // application, can still ask for the one the page held before, and
        // name the program the page holds as they reach the worker. Not
        // awaited: the display below reaches the worker after it on the same
        // connection.
        workspace
          ?.programHeld(programIdentity(program)!)
          .catch((e) => console.error(e));
      }
      if (this.playing) {
        // Stop and restart game if we loaded a new game while the old game
        // was running, or starting in the worker. (GameReloaded is sent when
        // the restart actually executes -- see scheduleRestartGame -- not
        // when it is merely scheduled.)
        this.scheduleRestartGame();
      } else {
        this._options ??= {};
        this._options.startFrom ??= program.startFrom;
        this._options.workspace ??= program.workspace;
        this._options.simulationOptions ??= program.simulationOptions;
        if (this.completionPreviewHoldsScreen(program)) {
          // Not awaited: the next real program must not wait on a suggestion.
          void this.refreshCompletionFiles().catch(console.error);
        } else if (this._options.startFrom) {
          if (this._completionStatus === "stale") {
            this.setCompletionStatus(null);
          }
          await this.updatePreview(
            program,
            this._options.startFrom.file,
            this._options.startFrom.line,
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

  /** Counts PLAYs begun, so a teardown a newer PLAY overtook leaves that
   *  PLAY and its application alone. */
  protected _plays = 0;

  async startGameAndApp(restarted?: boolean) {
    const plays = ++this._plays;
    const stops = this._stops;
    // PLAY runs the real document only, and no suggestion may reach the
    // screen once it has started.
    this.endCompletionPreview();
    if (!this._program) {
      // wait for initial program to be loaded
      await this.loadingInitialProgram;
      // STOP, a newer PLAY or the controller going while it waited ended
      // this PLAY before it asked the worker for anything.
      if (plays !== this._plays || stops !== this._stops || !this._mounted) {
        return false;
      }
    }
    if (!this._program) {
      return false;
    }
    const link = workspace?.gameLink;
    if (!link) {
      return false;
    }
    // The page holds only the program's summary: PLAY runs in the worker,
    // which holds the program itself.
    return this.startWorkerPlay(this._program, link, restarted);
  }

  /**
   * PLAY. The worker builds PLAY's game beside the game that previews, from
   * the program the page names, the last one that compiled and ran, and puts
   * it at the start point along the route it replayed there. The page's
   * application shows it: the game connects to it once it is built, then
   * starts, and ticks on the worker's own frames while the page's managers
   * keep theirs.
   */
  protected async startWorkerPlay(
    program: SparkProgram,
    link: WorkerGameLink,
    restarted?: boolean,
  ): Promise<boolean> {
    const play: WorkerPlay = { program, state: "starting", stepped: 0 };
    this._workerPlay = play;
    // STOP, a restart or the controller going ends this start at whichever
    // step it has reached (`endWorkerPlay`).
    const current = () => this._workerPlay === play;
    /** Stop the run this start built, which nothing else will stop once the
     *  start is no longer current. */
    const abandon = () => {
      if (play.run != null) {
        link
          .request(StopPlayMessage.type, { run: play.run })
          .catch((e) => console.error(e));
      }
      return false;
    };
    this._startingPlay = true;
    try {
      await this.detachWorkerPreview();
      if (!current()) {
        return false;
      }
      const built = await link.request(PlayMessage.type, {
        program: programIdentity(program)!,
        startFrom: this._options?.startFrom ?? undefined,
        restarted,
        simulationOptions: this._options?.simulationOptions,
      });
      play.run = built.run;
      if (!built.built) {
        console.error("The worker no longer holds the program to play");
        if (current()) {
          this._workerPlay = undefined;
        }
        return false;
      }
      if (!current()) {
        return abandon();
      }
      this._stopListeningToPlay = this.listenToWorker(link, () =>
        this._workerPlay !== play
          ? "stopped"
          : play.startSent
            ? "running"
            : play.state,
      );
      // A preview build a detach left under way still holds the application
      // slot until it has disposed of its application.
      await this._workerAppSettling;
      if (!current()) {
        return abandon();
      }
      const app = await this.buildAppFor(
        {
          connect: async (send) => {
            // A start that has ended leaves the link to whatever shows now.
            if (!current()) {
              return;
            }
            play.sink = send;
            const channel = link.attachPlay(send);
            try {
              await link.request(ConnectPlayMessage.type, {
                run: play.run!,
                channel,
              });
            } catch (e) {
              // Ended before it connected; nothing is shown.
              console.error(e);
            }
          },
          receive: (message) => link.receive(message),
        },
        false,
        current,
      );
      if (!current()) {
        if (play.sink) {
          link.detach(play.sink);
        }
        await app.destroy(true);
        return abandon();
      }
      // The game starts in the state the editor made of its application
      // while PLAY started. Whatever the editor does while the worker starts
      // it is brought across once it answers, until the two agree, checking
      // before each request that this start is still the one PLAY runs: a
      // request sent in the same turn as that check reaches the worker before
      // anything that ends this run. Controls from then on go to the game as
      // they come, in order.
      let workerPaused = app.paused;
      const seconds = play.stepped;
      play.stepped = 0;
      play.startSent = true;
      await link.request(StartPlayMessage.type, {
        run: play.run!,
        paused: workerPaused,
        seconds,
      });
      for (;;) {
        if (!current()) {
          return false;
        }
        if (app.paused !== workerPaused) {
          workerPaused = app.paused;
          await this.askWorkerGame(
            workerPaused ? PauseGameMessage.type : UnpauseGameMessage.type,
            {},
          );
          continue;
        }
        if (play.stepped !== 0) {
          const seconds = play.stepped;
          play.stepped = 0;
          await this.askWorkerGame(StepGameClockMessage.type, { seconds });
          continue;
        }
        break;
      }
      play.state = "running";
      if (built.compiled) {
        app.start();
      }
      this.updateLaunchStateIcon();
      return built.compiled === true;
    } catch (e) {
      console.error(e);
      if (current()) {
        await this.destroyGameAndApp();
      }
      return false;
    } finally {
      // A newer PLAY that began after this one ended is starting in its turn.
      if (current() || !this._workerPlay) {
        this._startingPlay = false;
      }
    }
  }

  /** End PLAY's game in the worker, answering where it last executed. */
  protected async endWorkerPlay(): Promise<DocumentLocation | null> {
    const play = this._workerPlay;
    if (!play) {
      return null;
    }
    this._workerPlay = undefined;
    if (play.state === "starting") {
      // The start stops at its next step; the preview may take the screen.
      this._startingPlay = false;
    }
    this._stopListeningToPlay?.();
    this._stopListeningToPlay = undefined;
    const link = workspace?.gameLink;
    if (play.sink) {
      link?.detach(play.sink);
    }
    try {
      // Without a run, the worker has not answered PLAY yet and ends
      // whichever game runs, which is the one it builds next if it builds it
      // before this arrives; the start stops a game built after this itself.
      const stopped = await link?.request(StopPlayMessage.type, {
        run: play.run,
      });
      return stopped?.location ?? null;
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  async destroyGameAndApp() {
    await this.releaseGames();
    this.updateLaunchStateIcon();
  }

  /** End PLAY and the preview in the worker and destroy the application
   *  that showed them, unless a PLAY begun meanwhile owns it. */
  protected async releaseGames() {
    // A teardown supersedes any pending compile-driven restart; without this
    // the timer fires after STOP and silently resurrects the game.
    this.cancelScheduledRestart();
    const plays = this._plays;
    await this.endWorkerPlay();
    await this.detachWorkerPreview();
    // A PLAY begun while this waited owns the application now.
    const app = this._app;
    if (app && plays === this._plays) {
      await app.initializing;
      if (plays === this._plays) {
        app.destroy(true);
        if (this._app === app) {
          this._app = undefined;
        }
      }
    }
  }

  /** Stop showing what the worker's game displays: its application goes, and
   *  whatever it still sends is heard by nothing. */
  async detachWorkerPreview() {
    this._workerDetaches += 1;
    for (const detached of [...this._detachWaiters]) {
      detached();
    }
    // A build under way disposes of its application when it finishes, and the
    // next preview builds its own once that is done, so the two never share
    // the application slot.
    const building = this._workerAppBuilding;
    if (building) {
      const settling = this._workerAppSettling;
      this._workerAppSettling = Promise.all([settling, building]).then(
        () => undefined,
        () => undefined,
      );
      this._workerAppBuilding = undefined;
    }
    this._stopListeningToWorker?.();
    this._stopListeningToWorker = undefined;
    if (!this._workerGame) {
      return;
    }
    this._workerGame = undefined;
    workspace?.gameLink?.detach();
    if (this._app) {
      const app = this._app;
      this._app = undefined;
      // The application of a build under way is that build's to dispose of.
      if (!building) {
        await app.initializing;
        await app.destroy(true);
      }
    }
  }

  async stopGame(
    reason: "finished" | "quit" | "invalidated" | "error" | "restart",
    error?: {
      message: string;
      location: DocumentLocation;
    },
  ) {
    this._stops += 1;
    const plays = this._plays;
    // PLAY's game in the worker answers where it last executed as it stops.
    const lastExecutedLocation = await this.endWorkerPlay();
    // The author can press PLAY again at any step of this STOP: the new run
    // is theirs from then on, and this STOP says nothing more of the old one.
    const overtaken = () => plays !== this._plays;
    if (overtaken()) {
      return;
    }
    await this.destroyGameAndApp();
    if (overtaken()) {
      return;
    }
    this.showPlayButton();
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    if (overtaken()) {
      return;
    }
    sendProtocolMessage(
      GameExitedMessage.type.notification({
        reason,
        error,
      }),
      this.host,
    );
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    if (overtaken()) {
      return;
    }
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

  /** Counts STOPs and the controller going, so a restart under way when
   *  one happens does not start the game again after it. */
  protected _stops = 0;

  /** Restart the game. Answers false when STOP, or the controller going,
   *  came while the old game was torn down or the new one started, and
   *  nothing restarted. */
  async restartGame(): Promise<boolean> {
    const stops = this._stops;
    await this.destroyGameAndApp();
    if (stops !== this._stops || !this._mounted) {
      return false;
    }
    await this.startGameAndApp(true);
    return stops === this._stops && this._mounted && this.playing;
  }

  // Compile-driven restart of a RUNNING game, coalesced: compiles arrive at
  // most once per typing pause (they're debounced upstream), so the old
  // 100ms window never merged anything and the running game was torn down
  // and restarted for every pause. One second batches consecutive pauses
  // into one restart. Owned as an explicit timer (not the bare debounce
  // util) so teardown paths can CANCEL it -- a pending restart firing after
  // the user hit STOP would resurrect the game.
  protected _restartGameTimeout?: ReturnType<typeof setTimeout>;

  protected cancelScheduledRestart() {
    if (this._restartGameTimeout != null) {
      clearTimeout(this._restartGameTimeout);
      this._restartGameTimeout = undefined;
    }
  }

  protected scheduleRestartGame() {
    this.cancelScheduledRestart();
    this._restartGameTimeout = setTimeout(async () => {
      this._restartGameTimeout = undefined;
      // Only restart a game that is still meant to be running; the state can
      // have changed (STOP, finish, error) while the timer was pending.
      if (this.playing && (await this.restartGame())) {
        sendProtocolMessage(
          GameReloadedMessage.type.notification({}),
          this.host,
        );
      }
    }, 1000);
  }

  /** The application that shows the worker's game, which only ever
   *  previews here. It takes the application slot only while `owned`
   *  holds. */
  async buildWorkerApp(link: WorkerGameLink, owned?: () => boolean) {
    return this.buildAppFor(
      {
        connect: async (send) => link.attach(send),
        receive: (message) => link.receive(message),
      },
      true,
      owned,
    );
  }

  /** Build an application for `game` and answer it, whatever the slot holds
   *  by then. A build that is no longer `owned` leaves the slot alone, and
   *  its caller disposes of the application. */
  protected async buildAppFor(
    game: GameEndpoint,
    previewing: boolean,
    owned: () => boolean = () => true,
  ) {
    if (this._app && owned()) {
      profile("start", "app/destroy");
      await this._app.destroy(true);
      this._app = undefined;
      profile("end", "app/destroy");
    }
    this.updateExecutionLabels();
    // Ensure the single shared AudioContext exists (and is resumed if the user
    // has already interacted) so it can be handed to this Application — this is
    // what lets preview reconstructions keep audio without minting a new context.
    await this.ensureAudioContext();
    profile("start", "app/create");
    const app = this.createApp(game, previewing);
    if (owned()) {
      this._app = app;
    }
    profile("end", "app/create");
    profile("start", "app/init");
    await app.init();
    profile("end", "app/init");
    return app;
  }

  protected createApp(game: GameEndpoint, previewing: boolean): Application {
    return new Application(game, this.refs.gameView, this.refs.gameUI, {
      previewing,
      audioContext: this._audioContext,
      // One cache for the page's whole life, so STOP then PLAY, and every
      // preview rebuild, find their assets already resident.
      assetCache: getSharedAssetCache(),
    });
  }

  /** Relay what a game in the worker reports (`listenToWorker`). */
  listen(game: {
    state?: string;
    connection: {
      outgoing: { addListener(method: string, listener: (msg: any) => void): unknown };
    };
  }) {
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
        if (this.displayingSpeculative) {
          // The editor records the executed lines and the route's choices as
          // the author's; a suggestion's are neither.
          return;
        }
        sendProtocolMessage(
          GameExecutedMessage.type.notification(msg.params),
          this.host,
        );
      }
    });
    game.connection.outgoing.addListener(GamePreviewedMessage.method, (msg) => {
      if (GamePreviewedMessage.type.isNotification(msg)) {
        if (this.displayingSpeculative) {
          return;
        }
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

  /** Relay what a game in the worker reports until the returned function is
   *  called. `state` reads the game's state as the page knows it. */
  listenToWorker(
    link: WorkerGameLink,
    state: () => string = () => "previewing",
  ): () => void {
    const stops: (() => void)[] = [];
    this.listen({
      get state() {
        return state();
      },
      connection: {
        outgoing: {
          addListener: (method, listener) =>
            stops.push(link.addListener(method, listener)),
        },
      },
    });
    return () => stops.forEach((stop) => stop());
  }

  /** The application that shows the worker's game, built once and shared by
   *  the preview updates that wait for it. */
  protected _workerAppBuilding?: Promise<Application>;

  /** The application that shows the worker's game has been built since a
   *  display last completed on it, so it holds nothing the game sent before
   *  and the next display must connect in full. */
  protected _workerAppFresh = false;

  /** Moves whenever the worker's preview detaches or the controller goes, so
   *  a preview update or an application build that began before cannot carry
   *  on after it. */
  protected _workerDetaches = 0;

  /** The preview updates waiting for a display's answer, each ended by the
   *  next detach. */
  protected _detachWaiters = new Set<() => void>();

  /** Settles once every build a detach left under way has finished and
   *  disposed of its application. */
  protected _workerAppSettling?: Promise<void>;

  /**
   * Display `program` at `file` and `line`. The page holds a summary of
   * `program`, and the worker's game, holding the program itself, replays the
   * route to the point, displays it (`displayPreviewFrom`) and sends the
   * frame. The overtake token, the sticky position and the published state are
   * the page's.
   */
  updatePreview = async (
    program: SparkProgram,
    file: string,
    line: number,
    options?: {
      speculative?: boolean;
      current?: () => boolean;
    },
  ): Promise<boolean> => {
    const link = workspace?.gameLink;
    if (!link || this._startingPlay || this._workerPlay) {
      return false;
    }
    if (!options?.speculative) {
      // The real document takes the screen back from any suggestion.
      this._completionShown = null;
    }
    const selectionVersion = this._selectionVersion;
    const update = ++this._previewUpdates;
    const detaches = this._workerDetaches;
    const overtaken = () =>
      update !== this._previewUpdates ||
      detaches !== this._workerDetaches ||
      this._startingPlay ||
      this._workerPlay != null ||
      options?.current?.() === false;
    this._workerGame ??= {};
    this._workerGame.program = program;
    // The application attaches to the link at the end of its build; a display
    // asked for before then would send its frame to nothing.
    if (!this._app || this._workerAppBuilding) {
      this._stopListeningToWorker ??= this.listenToWorker(link);
      if (!this._workerAppBuilding) {
        const settling = this._workerAppSettling ?? Promise.resolve();
        const building = settling
          .then(() =>
            this.buildWorkerApp(link, () => detaches === this._workerDetaches),
          )
          .then(async (app) => {
            if (detaches === this._workerDetaches) {
              return app;
            }
            // The preview detached, or the controller went, while this
            // application was built: it shows nothing and goes too, and the
            // link lets go of its sink unless a newer build or application
            // has taken the link since.
            if (this._app === app) {
              this._app = undefined;
            }
            if (!this._app && !this._workerAppBuilding) {
              link.detach();
            }
            await app.initializing;
            await app.destroy(true);
            return app;
          })
          .finally(() => {
            if (this._workerAppBuilding === building) {
              this._workerAppBuilding = undefined;
            }
          });
        this._workerAppBuilding = building;
      }
      this._workerAppFresh = true;
      await this._workerAppBuilding;
      if (overtaken()) {
        return false;
      }
    }
    if (this._workerAppFresh) {
      this.restoreWorkerDebugger(link);
    }
    const shown = this._completionShown;
    let result: { displayed: boolean } | undefined;
    // A detach ends the wait for the answer: the application the display
    // was for is gone, and the worker may never answer a display whose
    // application no longer tells it that fonts and pictures arrived, while
    // the next program to reach this page waits for this update to finish.
    let detached!: () => void;
    const detaching = new Promise<{ displayed: boolean }>((resolve) => {
      detached = () => resolve({ displayed: false });
    });
    this._detachWaiters.add(detached);
    try {
      result = await Promise.race([
        link.request(DisplayPreviewMessage.type, {
          program: programIdentity(program)!,
          file,
          line,
          speculative: Boolean(options?.speculative),
          keep: shown ? programIdentity(shown.program) : undefined,
          real: programIdentity(this._program),
          fresh: this._workerAppFresh,
        }),
        detaching,
      ]);
    } catch (e) {
      console.error(e);
      return false;
    } finally {
      this._detachWaiters.delete(detached);
    }
    if (result.displayed && detaches === this._workerDetaches) {
      // The frame reached the application this display was for. A detach
      // since then built another one, which holds nothing the game sent, so
      // this answer says nothing about it: its own first display connects in
      // full, and without that its adopted nodes keep the observations the
      // old application's teardown removed, leaving a shown button dead.
      this._workerAppFresh = false;
    }
    if (overtaken() || !result.displayed) {
      return false;
    }
    if (selectionVersion === this._selectionVersion) {
      this._previewPosition = { uri: file, line };
      this.publishGameState();
    }
    return true;
  };

  /** Give the worker's game what the editor last asked of the debugger when
   *  a new application shows the preview: a request made while PLAY ran
   *  reached PLAY's game alone. Sent ahead of the display they are for, on
   *  the same connection, so the worker applies them before it displays. */
  protected restoreWorkerDebugger(link: WorkerGameLink) {
    const options = this._options;
    const sent: Promise<unknown>[] = [];
    if (options?.breakpoints) {
      sent.push(
        link.request(SetGameBreakpointsMessage.type, {
          breakpoints: options.breakpoints,
        }),
      );
    }
    if (options?.functionBreakpoints) {
      sent.push(
        link.request(SetGameFunctionBreakpointsMessage.type, {
          functionBreakpoints: options.functionBreakpoints,
        }),
      );
    }
    if (options?.dataBreakpoints) {
      sent.push(
        link.request(SetGameDataBreakpointsMessage.type, {
          dataBreakpoints: options.dataBreakpoints,
        }),
      );
    }
    if (options?.debugging !== undefined) {
      sent.push(
        link.request(
          options.debugging
            ? EnableGameDebugMessage.type
            : DisableGameDebugMessage.type,
          {},
        ),
      );
    }
    for (const request of sent) {
      request.catch((e) => console.error(e));
    }
  }
}
