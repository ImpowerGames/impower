import { hasCompiledProgram } from "@impower/sparkdown/src/binary/programBinary";
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
import { possibleBreakpointLines } from "@impower/spark-engine/src/game/core/utils/possibleBreakpointLines";
import { CompiledProgramMessage } from "@impower/sparkdown/src/compiler/classes/messages/CompiledProgramMessage";
import { RemovedCompilerFileMessage } from "@impower/sparkdown/src/compiler/classes/messages/RemovedCompilerFileMessage";
import { SelectedCompilerDocumentMessage } from "@impower/sparkdown/src/compiler/classes/messages/SelectedCompilerDocumentMessage";
import type { SimulationFailure } from "@impower/sparkdown/src/compiler/types/SimulationFailure";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { SparkdownWorkspace } from "@impower/sparkdown/src/workspace/classes/SparkdownWorkspace";
import {
  Application,
  pageGameEndpoint,
  type GameEndpoint,
} from "./app/Application";
import type { WorkerGameLink } from "./main/workers/WorkerGameLink";
import type { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import { toResponseError } from "@impower/jsonrpc/src/common/utils/toResponseError";
import type { Message } from "@impower/jsonrpc/src/common/types/Message";
import { ConnectPlayMessage } from "./main/workers/messages/ConnectPlayMessage";
import { PlayMessage } from "./main/workers/messages/PlayMessage";
import { StartPlayMessage } from "./main/workers/messages/StartPlayMessage";
import { StopPlayMessage } from "./main/workers/messages/StopPlayMessage";
import { putAtStartPoint } from "./utils/putAtStartPoint";
import { conflate } from "./utils/conflate";
import { describeSimulationFailure } from "./utils/describeSimulationFailure";
import { programIdentity } from "./utils/programIdentity";
import { resolvePreviewPoint } from "./utils/resolvePreviewPoint";
import { profile } from "./utils/profile";
import { sharedNow } from "@impower/spark-engine/src/game/core/utils/sharedClock";

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

/** A suggestion that was drawn, with the result it was drawn from, so a
 *  return to it can draw it again without compiling. */
export interface ShownCompletion {
  evaluation: CompletionEvaluation;
  program: SparkProgram;
  checkpoint?: string;
  simulationFailure?: SimulationFailure;
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
// constructed. Replaces SparkWebPlayer.workspace (the static field on the
// legacy spec-component class).
let workspace:
  | (SparkdownWorkspace & Partial<WorkerDisplayWorkspace>)
  | undefined;

export function setWorkspace(
  ws: SparkdownWorkspace & Partial<WorkerDisplayWorkspace>,
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
  /** The game on this page, with the switch off: the preview's and PLAY's. */
  _game?: Game;
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
  _checkpoint?: string;
  // The story path the compiler worker planned and replayed a route TO when it
  // produced `_checkpoint`. Set whether or not that search succeeded, so PLAY
  // can tell "the worker already searched for this exact start point" from "no
  // search has been attempted" — see `simulate`.
  _simulatedPath?: string | null;
  // Identity of the program that search ran against. The path alone does not
  // establish that the worker and this controller are talking about the same
  // script — a path string survives edits that change what the story does at
  // it — and a compile landing while a play is being set up can leave the two
  // an edit apart.
  _simulatedProgramId?: string;
  // Why that search did not get to the start point, when it did not. Remembered
  // beside the answer itself because PLAY reports a failed start point through
  // the same status row the preview does, and would otherwise have nothing to
  // say there (#379).
  _simulationFailure?: SimulationFailure;

  // ---- Autocomplete suggestion previews -----------------------------------
  //
  // A highlighted suggestion is compiled as a hypothetical edit and shown in
  // place of the real document until the list closes. Everything below keeps
  // that hypothetical program out of the real state above: `_program`,
  // `_checkpoint` and the rest always describe the real document, which is
  // what PLAY and the next real preview start from.
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
  /** The last suggestion drawn completely, with the result it was drawn
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
    previewFrom?: { file: string; line: number };
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
  /** The stopped preview is displayed from the worker's game, over the
   *  compiler's own story, and the page holds only each program's summary. */
  get workerDisplays(): boolean {
    return workspace?.workerDisplaysPreview === true && !!workspace.gameLink;
  }

  /** The program whose frame the screen shows, or is being drawn. */
  get screenProgram(): SparkProgram | undefined {
    return this._game
      ? this._game.program
      : (this._workerPlay?.program ?? this._workerGame?.program);
  }

  /** PLAY runs, or is starting in the worker: nothing previews, and a new
   *  program restarts the run. */
  get playing(): boolean {
    return this._game?.state === "running" || this._workerPlay != null;
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
    // the preview detaches or PLAY stops.
    this.endWorkerPlay().catch(console.error);
    this.detachWorkerPreview().catch(console.error);
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
      : this._game?.state === "running" ||
          this._workerPlay?.state === "running"
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
    if (!params || (!this._game && !this._workerGame && !this._workerPlay)) {
      this.refs.leftItems.hidden = true;
      return;
    }
    this.refs.leftItems.hidden = false;
    // A summary has no locations to look paths up in; the worker that holds
    // the program sends them with the report.
    const locationOf = (path: string) =>
      this._program && !this._program.summary
        ? Game.pathToDocumentLocation(this._program, path)
        : null;
    if (
      (this._program || params.simulateLocation) &&
      params.simulatePath &&
      params.simulation === "fail"
    ) {
      const simulateFromLocation =
        params.simulateLocation ?? locationOf(params.simulatePath);
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
      const startFromLocation =
        params.startLocation ?? locationOf(params.startPath);
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
  // gesture. It is reused for every Application built afterward (including the
  // preview reconstructions that happen on every edit), so no new context is
  // minted per edit. Applied to the live app immediately once running, so
  // preview audio (character voices, sfx) starts on the first interaction.
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
    const {
      textDocument,
      selectedRange,
      checkpoint,
      simulationFailure,
      simulatedPath,
      simulatedProgramId,
      userEvent,
      programOutdated,
    } = message.params;
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
      this._checkpoint = checkpoint;
      this._simulationFailure = simulationFailure;
      this._simulatedPath = simulatedPath;
      this._simulatedProgramId = simulatedProgramId;
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
            checkpoint,
            simulationFailure,
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
    await this.drawCompletion(evaluation, {
      program,
      checkpoint: result.checkpoint,
      simulationFailure: result.simulationFailure,
    });
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
      result.checkpoint,
      result.simulationFailure,
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
    if ((!this._game && !this._workerGame) || this.playing) {
      return;
    }
    if (shown) {
      if (this.screenProgram !== shown.program) {
        await this.updatePreview(
          shown.program,
          shown.evaluation.params.textDocument.uri,
          shown.evaluation.params.selectedRange?.start.line ?? 0,
          shown.checkpoint,
          shown.simulationFailure,
          { speculative: true, current },
        );
      }
      return;
    }
    const startFrom = this._options?.startFrom;
    if (this.displayingSpeculative && this._program && startFrom) {
      await this.updatePreview(
        this._program,
        startFrom.file,
        startFrom.line,
        this._checkpoint,
        this._simulationFailure,
        { current },
      );
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
    await this.updatePreview(
      this._program,
      startFrom.file,
      startFrom.line,
      this._checkpoint,
      this._simulationFailure,
    );
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
    const hasFrame =
      this._game != null || this._workerGame != null || this._workerPlay != null;
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
    const {
      program,
      checkpoint,
      simulationFailure,
      simulatedPath,
      simulatedProgramId,
    } = message.params;
    await this.loadProgram(
      program,
      checkpoint,
      simulationFailure,
      simulatedPath,
      simulatedProgramId,
    );
  };

  protected handleResizeGame = async (message: ResizeGameMessage.Request) => {
    const { height } = message.params;
    this.refs.game.style.height = `${height}px`;
    return ResizeGameMessage.type.response(message.id, {});
  };

  /** Ask the game in the worker the page talks to, PLAY's while it runs
   *  there and otherwise the one that displays the preview, when the switch
   *  is on; answers undefined otherwise. A request the worker fails rejects,
   *  as a failing call to a game on this page throws. The worker records
   *  what the editor asks of the debugger for the games it builds later, so
   *  a request never waits for PLAY to start. */
  protected async askWorkerGame<M extends string, P, R>(
    type: MessageProtocolRequestType<M, P, R>,
    params: P,
  ): Promise<R | undefined> {
    if (this._game || !this.workerDisplays || !workspace?.gameLink) {
      return undefined;
    }
    return workspace.gameLink.request(type, params);
  }

  protected handleSetGameBreakpoints = async (
    message: SetGameBreakpointsMessage.Request,
  ) => {
    const { breakpoints } = message.params;
    this._options ??= {};
    this._options.breakpoints = breakpoints;
    const actualBreakpoints = this._game
      ? this._game.setBreakpoints(breakpoints)
      : ((
          await this.askWorkerGame(SetGameBreakpointsMessage.type, {
            breakpoints,
          })
        )?.breakpoints ?? []);
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
      : ((
          await this.askWorkerGame(SetGameFunctionBreakpointsMessage.type, {
            functionBreakpoints,
          })
        )?.functionBreakpoints ?? []);
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
      : ((
          await this.askWorkerGame(SetGameDataBreakpointsMessage.type, {
            dataBreakpoints,
          })
        )?.dataBreakpoints ?? []);
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
    if (this._game) {
      if (debugging) {
        this._game.startDebugging();
      } else {
        this._game.stopDebugging();
      }
      return true;
    }
    const type = debugging
      ? EnableGameDebugMessage.type
      : DisableGameDebugMessage.type;
    try {
      // The stopped preview the worker's game displays enters the mode too,
      // so its beat is coloured as the page's own game colours it. A worker
      // with no game yet records it for the one it builds, as the option
      // above does for a game built here, and answers.
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
    if (this._game) {
      this._game.pause();
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
    if (this._game) {
      this._game.unpause();
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
    if (this._game) {
      this._game.skip(seconds);
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
    if (this._game) {
      return StepGameMessage.type.response(message.id, {
        done: this._game.step(traversal),
      });
    }
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
    if (this._game) {
      return ContinueGameMessage.type.response(message.id, {
        done: this._game.continue(),
      });
    }
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
    if (this._game) {
      const threads = this._game.getThreads();
      return GetGameThreadsMessage.type.response(message.id, { threads });
    }
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
    const { search } = message.params;
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
    const program = this._game?.program || this._program;
    if (program && !program.summary) {
      const lines = possibleBreakpointLines(
        program.pathLocations,
        Object.keys(program.scripts),
        search,
      );
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
    if (this._game) {
      const context = this._game.getEvaluationContext();
      return GetGameEvaluationContextMessage.type.response(message.id, {
        context,
      });
    }
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
    async (
      program: SparkProgram,
      checkpoint: string | undefined,
      simulationFailure?: SimulationFailure,
      simulatedPath?: string | null,
      simulatedProgramId?: string,
    ) => {
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
      if (program.summary && !this._startingPlay && !this._workerAppBuilding) {
        // The worker keeps each real program the page can still name. PLAY
        // that is starting, and a display waiting for the worker's
        // application, can still ask for the one the page held before, and
        // name the program the page holds as they reach the worker. Not
        // awaited: the display below reaches the worker after it on the same
        // connection.
        workspace
          ?.programHeld?.(programIdentity(program)!)
          .catch((e) => console.error(e));
      }
      this._checkpoint = checkpoint;
      this._simulationFailure = simulationFailure;
      this._simulatedPath = simulatedPath;
      this._simulatedProgramId = simulatedProgramId;
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
            checkpoint,
            simulationFailure,
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
    this._plays += 1;
    // PLAY runs the real document only, and no suggestion may reach the
    // screen once it has started.
    this.endCompletionPreview();
    if (!this._program) {
      // wait for initial program to be loaded
      await this.loadingInitialProgram;
    }
    if (!this._program) {
      return false;
    }
    this._options ??= {};
    this._options.previewFrom = undefined;
    const program = this._program;
    if (program.summary && workspace?.gameLink) {
      // The page holds only the program's summary: PLAY runs in the worker,
      // which holds the program itself.
      return this.startWorkerPlay(program, workspace.gameLink, restarted);
    }
    this._game = await this.buildGame(program, restarted);
    putAtStartPoint(this._game, this._options?.simulationOptions, {
      checkpoint: this._checkpoint,
      path: this._simulatedPath,
      programId: this._simulatedProgramId,
      failure: this._simulationFailure,
    });
    this.listen(this._game);
    this._app = await this.buildApp(this._game);
    const programCompiled = hasCompiledProgram(program);
    this._game?.start();
    if (programCompiled) {
      this._app?.start();
    }
    this.updateLaunchStateIcon();
    return programCompiled;
  }

  /**
   * PLAY with the switch on. The worker builds PLAY's game beside the game
   * that previews, from the program the page names, the last one that
   * compiled and ran, and puts it at the start point along the route it
   * replayed there. The page's application shows it, as it shows a game on
   * this page: the game connects to it once it is built, then starts, and
   * ticks on the worker's own frames while the page's managers keep theirs.
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
            link.attach(send);
            try {
              await link.request(ConnectPlayMessage.type, { run: play.run! });
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
    // A teardown supersedes any pending compile-driven restart; without this
    // the timer fires after STOP and silently resurrects the game.
    this.cancelScheduledRestart();
    const plays = this._plays;
    if (this._game) {
      this._game.destroy();
      this._game = undefined;
    }
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
    this.updateLaunchStateIcon();
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
    // Read before the game goes; PLAY in the worker answers it as it stops.
    const lastExecutedLocation = this._game
      ? this._game.getLastExecutedDocumentLocation()
      : await this.endWorkerPlay();
    if (plays !== this._plays) {
      // The author pressed PLAY again while the worker stopped the old run:
      // the new run is theirs, and this STOP is over.
      return;
    }
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

  /** Counts STOPs and the controller going, so a restart under way when
   *  one happens does not start the game again after it. */
  protected _stops = 0;

  /** Restart the game. Answers false when STOP, or the controller going,
   *  came while the old game was torn down, and nothing restarted. */
  async restartGame(): Promise<boolean> {
    const stops = this._stops;
    await this.destroyGameAndApp();
    if (stops !== this._stops || !this._mounted) {
      return false;
    }
    await this.startGameAndApp(true);
    return true;
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

  /** Build the game and publish it as `this._game` before yielding. No
   *  await belongs in this body: `updatePreview` relies on the game being
   *  published in the same task that asked for it, so that an update
   *  awaiting the build cannot be overtaken during it; an await here would
   *  reopen that window with nothing to catch it. */
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
      now: sharedNow,
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
    if (options?.debugging) {
      // What the editor asked of the preview's debug toggle holds for the
      // game built after it, as the breakpoints above do.
      this._game.startDebugging();
    }
    profile("end", "game/create");
    return this._game;
  }

  async buildApp(game: Game) {
    // A worker preview build a detach left under way still holds the
    // application slot until it has disposed of its application.
    await this._workerAppSettling;
    return this.buildAppFor(
      pageGameEndpoint(game),
      Boolean(game.context.system.previewing),
    );
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

  /** Relay what a game reports: a game on this page, or the worker's
   *  (`listenToWorker`). */
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

  /** Relay what a game in the worker reports, as `listen` does for a game on
   *  this page, until the returned function is called. `state` reads the
   *  game's state as the page knows it. */
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
   * `updatePreview` with the worker displaying: the page holds a summary of
   * `program`, and the worker's game, holding the program itself, performs
   * the steps the page's game would (`displayPreviewFrom`) and sends the
   * frame. The overtake token, the sticky position and the published state are
   * the page's, as they are for a game on this page; the checkpoint is the
   * worker's.
   */
  protected updateWorkerPreview = async (
    program: SparkProgram,
    file: string,
    line: number,
    options?: {
      speculative?: boolean;
      current?: () => boolean;
    },
  ): Promise<boolean> => {
    const link = workspace?.gameLink;
    if (!link || this._game || this._startingPlay || this._workerPlay) {
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
      this._game != null ||
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
   *  a new application shows the preview. A request made while PLAY ran
   *  reached PLAY's game alone, and one made before the page knew the worker
   *  displays was recorded here and not passed on. Sent ahead of the display
   *  they are for, on the same connection, so the worker applies them before
   *  it displays. */
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

  updatePreview = async (
    program: SparkProgram,
    file: string,
    line: number,
    checkpoint: string | undefined,
    simulationFailure?: SimulationFailure,
    options?: {
      speculative?: boolean;
      /** Abandon the update once this stops holding. */
      current?: () => boolean;
    },
  ): Promise<boolean> => {
    if (this.playing) {
      return false;
    }
    if (program?.summary) {
      return this.updateWorkerPreview(program, file, line, options);
    }

    if (!program) {
      return false;
    }
    if (!options?.speculative) {
      // The real document takes the screen back from any suggestion.
      this._completionShown = null;
    }

    const previewFrom = { file, line };
    const selectionVersion = this._selectionVersion;
    const publishAppliedPosition = () => {
      if (selectionVersion !== this._selectionVersion) return;
      this._previewPosition = { uri: file, line };
      this.publishGameState();
    };
    const programChanged =
      this._game?.program.uri !== program?.uri ||
      this._game.program.version !== program?.version;

    const point = resolvePreviewPoint(
      program,
      previewFrom,
      programChanged,
      this._game,
    );
    const validPreviewFrom = point.from;
    const resolvedPreviewPath = point.path;
    const validPreviewPath = point.validPath;

    if (point.repeat && this._game) {
      // The engine records previewedPath before its image gate settles.
      // Repeating that path returns the same pending promise; await it too.
      const game = this._game;
      const update = this._previewUpdates;
      await game.preview(validPreviewFrom.file, validPreviewFrom.line);
      if (
        game === this._game &&
        update === this._previewUpdates &&
        options?.current?.() !== false
      ) {
        publishAppliedPosition();
        return true;
      }
      return false;
    }

    this._options ??= {};
    this._options.previewFrom = validPreviewFrom;

    // Reuse the Game + Application across edits instead of rebuilding them.
    // `updateProgram` swaps the recompiled program + a fresh Story IN PLACE (the
    // intended live-edit path), keeping the SAME Game object — so the Application
    // (bound to that object) stays valid and we never destroy/recreate the
    // Application or its pixi canvas (the old `buildApp`-every-edit was the
    // game-view blink + per-edit object churn).
    // This update's place among the preview updates. One that another
    // overtakes while it waits (for the app to build, the game to connect,
    // or the preview to settle) neither previews nor sweeps: from its
    // reconcile pass on, the newer update owns the screen, and a sweep by
    // the older one would take the newer beat's content off it. A game the
    // play path replaced or stopped meanwhile is left to that path too. The
    // game's build performs no await, so `this._game` is published before
    // the await on it yields and that yield is one microtask, which no other
    // update's task can enter: an update cannot be overtaken during the
    // build, and `buildGame` must stay free of awaits for that to hold. From
    // here to the connect, which takes over a waiting preview as its first
    // act, an update with a game and an app runs without yielding, so an
    // older update cannot interleave inside that stretch either.
    const update = ++this._previewUpdates;

    if (!this._game) {
      this._game = await this.buildGame(program);
      this.listen(this._game);
    } else if (programChanged) {
      profile("start", "game/updateProgram");
      this._game.updateProgram(program);
      profile("end", "game/updateProgram");
    }

    if (!this._game) {
      console.error("No game to preview");
      return false;
    }
    // A suggestion's report is not relayed (see `listen`), so the game leaves
    // out what only the editors would read.
    this._game.reportsExecutedLines = !this.displayingSpeculative;
    const game = this._game;
    const overtaken = () =>
      update !== this._previewUpdates ||
      this._game !== game ||
      options?.current?.() === false;

    // Everything below — the checkpoint load, and the connect that restores
    // every module — happens before `game.preview()` picks the preview point,
    // and the audio module decides whether to resume the route's music during
    // that restore. Tell the game it is previewing first, or a preview click
    // starts playing the scene's music as if PLAY had been pressed.
    //
    // Only ever the preview game. `startGameAndApp` publishes its game (state
    // `initial`) and awaits `buildApp` before calling `start()`, so a compile
    // landing in that window arrives here holding the game PLAY is about to
    // run — and `Application.init` skips the renderer for anything flagged as
    // previewing, which would leave that run with nothing to draw on.
    if (this._game.state === "previewing") {
      this._game.markPreviewing(resolvedPreviewPath ?? undefined);
      // Drop what the LAST preview left displayed. The restore below re-applies
      // whatever the new point genuinely has, and the replay writes the rest;
      // carrying the old record forward is what put the previous preview's
      // backdrop behind a line that sets none. (Loading a checkpoint replaces
      // the record wholesale, so this only matters when there is none.)
      this._game.module.ui.forgetDisplayedImages();
    }

    if (checkpoint) {
      this._game.load(checkpoint);
    } else {
      if (validPreviewPath) {
        const simulateFromPath = Game.getSimulateFromPath(validPreviewPath);
        this._game.simulatePath = simulateFromPath;
      }
      this._game.simulation = "fail";
      // The route to this preview point is planned in the compile worker, not
      // in this game, so the verdict arrives alongside the (absent) checkpoint
      // rather than being reachable from here. Hand it to the game so the
      // executed notification carries the failure and its reason together.
      this._game.simulationFailure = simulationFailure;
    }

    if (!this._app) {
      // First render: build the Application (renderer/canvas + managers) and
      // connect the game (its onConnected renders the screen tree).
      this._app = await this.buildApp(this._game);
    } else {
      // Re-render in place: re-run the game's onConnected + restore via
      // connectGame. The connect opens a reconcile pass on the page, so the
      // re-emitted create stream reconciles against the existing DOM. No app /
      // canvas / manager teardown.
      profile("start", "app/connectGame");
      await this._app.connectGame();
      profile("end", "app/connectGame");
    }
    if (overtaken()) {
      return false;
    }

    if (validPreviewFrom) {
      // The preview waits for the beat's pictures before it writes the
      // beat, so the sweep below waits for the preview: a write that landed
      // after the sweep would be swept with the elements that disappeared.
      profile("start", "game/preview");
      await game.preview(validPreviewFrom.file, validPreviewFrom.line);
      profile("end", "game/preview");
      if (overtaken()) {
        return false;
      }
    }

    // DOM reconcile tail: the full create/write stream for this preview point
    // has now been dispatched, so the game closes the pass in the same
    // stream, and the page sweeps whatever wasn't re-emitted — elements that
    // disappeared since the last edit.
    game.module.ui.sweepReconcile();
    publishAppliedPosition();
    return true;
  };
}
