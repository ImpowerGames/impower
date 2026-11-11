import { isRunnableProgram } from "@impower/sparkdown/src/compiler/utils/programSummary";
import { playRefusalOf } from "@impower/sparkdown/src/compiler/utils/startScene";
import { getSharedAssetCache } from "./main/assets/sharedAssetCache";
import { compiledElsewhere } from "./utils/compiledElsewhere";
import { DisplayPreviewMessage } from "./main/workers/messages/DisplayPreviewMessage";
import type {
  WorkerDisplayWorkspace,
  WorkerHang,
} from "./main/workers/WorkerDisplayWorkspace";
import {
  MessageProtocol,
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
import { GameToggledConsoleMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameToggledConsoleMessage";
import { RuntimeDiagnosticsMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/RuntimeDiagnosticsMessage";
import type { SimulationError } from "@impower/sparkdown/src/compiler/types/SimulationError";
import { RuntimeDiagnosticsRun } from "./utils/RuntimeDiagnosticsRun";
import {
  GameExecutedMessage,
  type GameExecutedParams,
} from "@impower/spark-engine/src/game/core/classes/messages/GameExecutedMessage";
import { GameExitedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameExitedMessage";
import { GameWorkerRestartedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameWorkerRestartedMessage";
import { GameExitedThreadMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameExitedThreadMessage";
import { GameFinishedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameFinishedMessage";
import { GameEndedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameEndedMessage";
import { GameHitBreakpointMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameHitBreakpointMessage";
import { GamePreviewedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GamePreviewedMessage";
import { GameReloadedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameReloadedMessage";
import {
  GameResizedMessage,
  type GameResizedParams,
} from "@impower/spark-engine/src/game/core/classes/messages/GameResizedMessage";
import { GameRolledMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameRolledMessage";
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
import {
  ResizeGameMessage,
  type GameAspectRatio,
  type GameFit,
} from "@impower/spark-engine/src/game/core/classes/messages/ResizeGameMessage";
import { SkipBeatMessage } from "@impower/spark-editor-protocol/src/protocols/preview/SkipBeatMessage";
import {
  clearPlayerBarExecution,
  COMMON_ASPECT_RATIOS,
  initialPlayerBarState,
  matchAspectRatio,
  reducePlayerBar,
  relativeScriptPath,
  type PlayerBarState,
} from "./components/PlayerBar/playerBarState";
import { SetAnimatePortraitsMessage } from "@impower/spark-engine/src/game/core/classes/messages/SetAnimatePortraitsMessage";
import {
  SetStartingDisplayModeMessage,
  type StartingDisplayMode,
} from "@impower/spark-engine/src/game/core/classes/messages/SetStartingDisplayModeMessage";
import { RestartGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/RestartGameMessage";
import { SetGameBreakpointsMessage } from "@impower/spark-engine/src/game/core/classes/messages/SetGameBreakpointsMessage";
import { SetGameDataBreakpointsMessage } from "@impower/spark-engine/src/game/core/classes/messages/SetGameDataBreakpointsMessage";
import { SetGameVariableMessage } from "@impower/spark-engine/src/game/core/classes/messages/SetGameVariableMessage";
import { SetGameFunctionBreakpointsMessage } from "@impower/spark-engine/src/game/core/classes/messages/SetGameFunctionBreakpointsMessage";
import { RollBackGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/RollBackGameMessage";
import { RollForwardGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/RollForwardGameMessage";
import { StartGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/StartGameMessage";
import { StepGameClockMessage } from "@impower/spark-engine/src/game/core/classes/messages/StepGameClockMessage";
import { StepGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/StepGameMessage";
import { StopGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/StopGameMessage";
import { UnpauseGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/UnpauseGameMessage";
import { ErrorType } from "@impower/spark-engine/src/game/core/enums/ErrorType";
import type { DocumentLocation } from "@impower/spark-engine/src/game/core/types/DocumentLocation";
import type { GameEnding } from "@impower/spark-engine/src/game/core/types/GameEnding";
import { CompiledProgramMessage } from "@impower/sparkdown/src/compiler/classes/messages/CompiledProgramMessage";
import { RemovedCompilerFileMessage } from "@impower/sparkdown/src/compiler/classes/messages/RemovedCompilerFileMessage";
import { SelectedCompilerDocumentMessage } from "@impower/sparkdown/src/compiler/classes/messages/SelectedCompilerDocumentMessage";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import {
  CompilerRestartedError,
  SparkdownWorkspace,
} from "@impower/sparkdown/src/workspace/classes/SparkdownWorkspace";
import { Application, type GameEndpoint } from "./app/Application";
import { MorphPlayback } from "./app/morph/MorphPlayback";
import type { WorkerGameLink } from "./main/workers/WorkerGameLink";
import type { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import { toResponseError } from "@impower/jsonrpc/src/common/utils/toResponseError";
import type { Message } from "@impower/jsonrpc/src/common/types/Message";
import { ConnectPlayMessage } from "./main/workers/messages/ConnectPlayMessage";
import { PlayMessage } from "./main/workers/messages/PlayMessage";
import { StartPlayMessage } from "./main/workers/messages/StartPlayMessage";
import { StopPlayMessage } from "./main/workers/messages/StopPlayMessage";
import { LastRunMessage } from "./main/workers/messages/LastRunMessage";
import type { RunMeeting } from "@impower/spark-engine/src/game/core/types/PreviewRoute";
import { conflate } from "./utils/conflate";
import { describeSimulationFailure } from "./utils/describeSimulationFailure";
import { programIdentity, type IdentifiableProgram } from "./utils/programIdentity";
import { workerHangMessage } from "./utils/workerHangMessage";
import { profile } from "./utils/profile";
import { renderRouteViews } from "./route/renderRouteViews";
import {
  DidChangeRouteViewMessage,
  RouteViewActionMessage,
  type HostedValuesEvent,
} from "./route/routeViewMessages";
import {
  changedPins,
  LAST_RUN_CHANGED,
  lastRunChange,
  DEFAULT_ROUTE_TOGGLES,
  PIN_NOT_SAVED,
  routeTogglesFrom,
  type RouteKind,
  type RoutePinChange,
  type RouteViewState,
} from "./route/routeView";
import { SetRouteTogglesMessage } from "@impower/spark-editor-protocol/src/protocols/preview/SetRouteTogglesMessage";
import {
  SetRoutePinsMessage,
  type RoutePin,
} from "@impower/spark-editor-protocol/src/protocols/preview/SetRoutePinsMessage";
import { ChangeRoutePinsMessage } from "@impower/spark-editor-protocol/src/protocols/preview/ChangeRoutePinsMessage";
import { DidChangeRouteTogglesMessage } from "@impower/spark-editor-protocol/src/protocols/preview/DidChangeRouteTogglesMessage";
import { ShowDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/window/ShowDocumentMessage";
import { SetStartingValuesMessage } from "@impower/spark-editor-protocol/src/protocols/preview/SetStartingValuesMessage";
import { ChangeStartingValuesMessage } from "@impower/spark-editor-protocol/src/protocols/preview/ChangeStartingValuesMessage";
import { SetGameStartingValuesMessage } from "@impower/spark-engine/src/game/core/classes/messages/SetGameStartingValuesMessage";
import { GetGameStartingValueListingMessage } from "@impower/spark-engine/src/game/core/classes/messages/GetGameStartingValueListingMessage";
import {
  listingItems,
  ownEntry,
  startingValuesFrom,
  type StartingValueListing,
  type StartingValues,
  type StartingValueSet,
} from "@impower/sparkdown/src/program/startingValueLiterals";
import { START_FLOW_NAME } from "@impower/sparkdown/src/program/ProgramSymbols";
import { GameSavedSceneEntryMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameSavedSceneEntryMessage";
import type { RouteTab } from "./route/startingValuesView";
import {
  answered,
  changed,
  drafted,
  emptyFields,
  fieldsView,
  hostSent,
  resetAll,
  shownValues,
  startChanged,
  type StartingValuesFields,
} from "./route/startingValuesFields";
import type { StartingValuesEvents } from "./route/StartingValuesViews";
import { SavesController } from "./saves/SavesController";
import { renderSavesViews } from "./saves/renderSavesViews";

const MIN_HEIGHT = 100;

const RATIO_REFERENCE_HEIGHT = 720;

const profileMessageHandling =
  (handler: (message: any) => any) => async (message: { method: string }) => {
    profile("start", message.method);
    try {
      return await handler(message);
    } finally {
      profile("end", message.method);
    }
  };

export interface CompletionEvaluation {
  params: PreviewCompletionParams & {
    contentChanges: NonNullable<PreviewCompletionParams["contentChanges"]>;
  };
  key: string;
  filesRevision: number;
}

export interface ShownCompletion {
  evaluation: CompletionEvaluation;
  program: SparkProgram;
}

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

const PROGRAM_AFTER_RESTART_WAIT_MS = 60_000;

let workspace: (SparkdownWorkspace & WorkerDisplayWorkspace) | undefined;

export function setWorkspace(
  ws: SparkdownWorkspace & WorkerDisplayWorkspace,
): void {
  workspace = ws;
}

let markControllerListening: () => void = () => {};

const controllerListening = new Promise<void>((resolve) => {
  markControllerListening = resolve;
});

export function whenControllerListening(): Promise<void> {
  return controllerListening;
}

const reportUnlessRestarted = (e: unknown) => {
  if (!(e instanceof CompilerRestartedError)) {
    console.error(e);
  }
};


interface PlayOutcome {
  started: boolean;
  refusal?: string;
  previewShown?: boolean;
  owned?: boolean;
}

interface WorkerPlay {
  program: SparkProgram;
  state: "starting" | "running";
  run?: number;
  sink?: (message: Message) => void;
  stepped: number;
  startSent?: boolean;
  startFrom?: { file: string; line: number };
  ended?: GameEnding;
  exitClaimed?: boolean;
  save?: string;
}

export interface PlayerBarView {
  routeShown: boolean;
  snapping: boolean;
  workspace?: string;
}

export interface GamePlayerRefs {
  viewport: HTMLElement;
  gameBackground: HTMLElement;
  gameView: HTMLElement;
  gameUI: HTMLElement;
  game: HTMLElement;
  playButton: HTMLElement | null;
  toolbar: HTMLElement | null;
  routeButton?: HTMLElement | null;
  routeList?: HTMLElement | null;
  savesButton?: HTMLElement | null;
  savesMenu?: HTMLElement | null;
  saveNote?: HTMLElement | null;
}

export class GamePlayerController {
  protected host: HTMLElement;
  protected refs: GamePlayerRefs;

  _audioContext?: AudioContext;
  _workerGame?: { program?: SparkProgram };
  _stopListeningToWorker?: () => void;
  _workerPlay?: WorkerPlay;
  _stopListeningToPlay?: () => void;
  _endingPlay?: WorkerPlay;
  _stopHearingHangs?: () => void;
  _programAfterRestart?: { arrived: Promise<void>; arrive: () => void };
  _programAfterRestartWaitMs = PROGRAM_AFTER_RESTART_WAIT_MS;
  _startingPlay = false;
  _app?: Application;
  _debugging = false;
  _program?: SparkProgram;
  _playRefusal?: string;
  protected _lastStartedRun?: WorkerPlay;
  private _mounted = false;
  private _disposed = false;
  private _previewPosition: GameState["position"] = null;
  private _selectionVersion = 0;
  private _launchState: GameState["launchState"] = null;
  protected _routeState: RouteViewState = {
    open: false,
    toggles: { ...DEFAULT_ROUTE_TOGGLES },
    tab: "route",
    pins: [],
  };
  protected _valueFields: StartingValuesFields = emptyFields();

  protected _valuesShownStart?: string;

  protected _valuesSearch = "";
  protected _listing?: { key: string; listing?: StartingValueListing };

  protected _saves = new SavesController({
    requestHost: (type, params) => this.requestHost(type, params),
    askWorker: (type, params) => this.askWorkerGame(type, params),
    playing: () => this._workerPlay?.state === "running",
    canPlace: () => this._program != null,
    run: () => this._workerPlay?.run,
    playFromSave: (data) => this.playFromSave(data),
    changed: () => {
      this.renderSaves();
      this.renderRoute();
    },
  });

  protected _loadSaveOpen = false;

  protected _renderingSaves = false;

  protected _savesRenderDue = false;

  protected _loaded?: {
    start: string;
    name: string;
    before: StartingValueSet;
    after: StartingValueSet;
    failed?: boolean;
  };

  protected _playSave?: string;
  _previewUpdates = 0;

  protected _runtimeRun?: RuntimeDiagnosticsRun;
  protected _runtimeRunPosition?: string;

  protected runtimePosition(
    program: IdentifiableProgram | undefined,
    file: string,
    line: number,
  ) {
    return `${programIdentity(program)} ${file}:${line}`;
  }

  protected beginRuntimeRun(
    program: SparkProgram,
    owner: unknown,
    errors: SimulationError[],
    position?: string,
  ) {
    const run = new RuntimeDiagnosticsRun(program, owner);
    for (const error of errors) {
      run.add(error);
    }
    this._runtimeRun = run;
    this._runtimeRunPosition = position;
    this.reportRuntimeDiagnostics();
  }

  protected beginPreviewRuntimeRun(
    program: SparkProgram,
    owner: unknown,
    file: string,
    line: number,
    errors: SimulationError[],
  ) {
    const position = this.runtimePosition(program, file, line);
    if (this._runtimeRun && position === this._runtimeRunPosition) {
      return;
    }
    this.beginRuntimeRun(program, owner, errors, position);
  }

  protected recordRuntimeError(owner: unknown, error: SimulationError) {
    const run = this._runtimeRun;
    if (!run || run.owner !== owner || this.displayingSpeculative) {
      return;
    }
    if (run.add(error)) {
      this.reportRuntimeDiagnostics();
    }
  }

  protected reportRuntimeDiagnostics() {
    const run = this._runtimeRun;
    if (!run) {
      return;
    }
    sendProtocolMessage(
      RuntimeDiagnosticsMessage.type.notification(run.params()),
      this.host,
    );
  }

  _completionSession: { uri: string; session: number } | null = null;
  _completionRequest = 0;
  _completionWanted: CompletionEvaluation | null = null;
  _completionEvaluating: CompletionEvaluation | null = null;
  _completionPending: CompletionEvaluation | null = null;
  _completionShown: ShownCompletion | null = null;
  _completionStatus: CompletionPreviewStatus | null = null;
  _completionPrograms = 0;
  _completionAccepted: { uri: string; version: number } | null = null;
  _completionProgramSet = new WeakSet<SparkProgram>();
  _canonicalInvalid = false;

  _options?: {
    workspace?: string;
    startFrom?: { file: string; line: number } | null;
    breakpoints?: { file: string; line: number }[];
    routePins?: RoutePin[];
    functionBreakpoints?: { name: string }[];
    dataBreakpoints?: { dataId: string }[];
    debugging?: boolean;
    startingValues?: StartingValues;
    startingDisplayMode?: StartingDisplayMode;
  };

  private _resolveLoadingInitialProgram!: () => void;
  private _loadingInitialProgram?: Promise<void> = new Promise<void>(
    (resolve) => {
      this._resolveLoadingInitialProgram = resolve;
    },
  );
  get screenProgram(): SparkProgram | undefined {
    return this._workerPlay?.program ?? this._workerGame?.program;
  }

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
  _fit: GameFit = "auto";
  _fitRatio: GameAspectRatio | null = null;
  _stepping = false;
  _ending: GameEnding | null = null;
  protected _bar: PlayerBarState = initialPlayerBarState;
  protected _barView: PlayerBarView = { routeShown: false, snapping: false };
  protected _barListeners = new Set<
    (state: PlayerBarState, view: PlayerBarView) => void
  >();

  protected _protocols = new ProtocolObserver(profileMessageHandling);

  protected readonly _resizable: boolean;

  protected readonly _hostsRoute: boolean;

  constructor(
    host: HTMLElement,
    refs: GamePlayerRefs,
    options: { resizable?: boolean; hostsRoute?: boolean } = {},
  ) {
    this.host = host;
    this.refs = refs;
    this._resizable = options.resizable ?? true;
    this._hostsRoute = options.hostsRoute ?? false;
  }

  setup(): void {
    this.registerProtocolHandlers();
    this._stopHearingHangs = workspace?.addWorkerHangListener?.(
      this.handleWorkerHang,
    );
    this._mounted = true;
    this.publishGameState();
    window.addEventListener("contextmenu", this.handleContextMenu, true);
    window.addEventListener("dragstart", this.handleDragStart);
    window.addEventListener("resize", this.handleResize);
    window.addEventListener("pointerdown", this.handleUserInteraction, true);
    window.addEventListener("keydown", this.handleUserInteraction, true);
    this.refs.playButton?.addEventListener("click", this.handleClickPlayButton);
    if (this._resizable) {
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
    }
    this._gameResizeObserver = new ResizeObserver(this.handleResize);
    this._gameResizeObserver.observe(this.refs.game);
    this._gameResizeObserver.observe(this.refs.viewport);
    this.reportSize();
    window.addEventListener("pointerdown", this.handleSavesPointerDown, true);
    window.addEventListener("keydown", this.handleSavesKeyDown, true);
    this.renderSaves();
    void this._saves.load();
    sendProtocolMessage(
      ConnectedPreviewMessage.type.notification({ type: "game" }),
      this.host,
    );
    markControllerListening();
  }

  dispose(): void {
    this._mounted = false;
    this._disposed = true;
    this._stops += 1;
    window.removeEventListener("pointerdown", this.handleSavesPointerDown, true);
    window.removeEventListener("keydown", this.handleSavesKeyDown, true);
    renderRouteViews(this.routeViewTargets(), null);
    renderSavesViews(this.savesTargets(), null);
    this._saves.dispose();
    this._previewPosition = null;
    this._selectionVersion++;
    this._launchState = null;
    this.publishGameState();
    this._protocols.dispose();
    this._stopHearingHangs?.();
    this._stopHearingHangs = undefined;
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
    this._gameResizeObserver?.disconnect();
    this._barListeners.clear();
  }

  subscribeBar(
    listener: (state: PlayerBarState, view: PlayerBarView) => void,
  ): () => void {
    this._barListeners.add(listener);
    listener(this._bar, this._barView);
    return () => {
      this._barListeners.delete(listener);
    };
  }

  protected updateBar(state: PlayerBarState, view = this._barView) {
    if (state === this._bar && view === this._barView) {
      return;
    }
    this._bar = state;
    this._barView = view;
    for (const listener of this._barListeners) {
      listener(state, view);
    }
  }

  protected updateBarView(patch: Partial<PlayerBarView>) {
    const view = this._barView;
    const changed = (Object.keys(patch) as (keyof PlayerBarView)[]).some(
      (key) => patch[key] !== view[key],
    );
    if (changed) {
      this.updateBar(this._bar, { ...view, ...patch });
    }
  }

  protected _playButtonShows = 0;

  protected async hidePlayButton() {
    if (this.refs.playButton) {
      const shows = this._playButtonShows;
      this.refs.playButton.style.pointerEvents = "none";
      this.refs.playButton.style.opacity = "0";
      const animations = this.refs.playButton.getAnimations();
      await Promise.allSettled(
        animations.map((animation) => animation.finished),
      );
      if (shows === this._playButtonShows) {
        this.refs.playButton.style.display = "none";
      }
    }
  }

  protected refusePlay(refusal: string | undefined) {
    this._playRefusal = refusal;
    if (refusal) {
      this._resolveLoadingInitialProgram();
    }
    const button = this.refs.playButton;
    if (!button) {
      return;
    }
    if (refusal) {
      button.title = refusal;
      button.setAttribute("aria-disabled", "true");
    } else {
      button.removeAttribute("title");
      button.removeAttribute("aria-disabled");
    }
  }

  protected async showPlayButton() {
    this._playButtonShows += 1;
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
    return relativeScriptPath(path, this._options?.workspace);
  }

  protected updateLaunchStateIcon() {
    if (this._disposed) {
      return;
    }
    this._launchState = this._workerPlay?.ended
      ? "ended"
      : this._app?.paused
        ? "pause"
        : this._workerPlay?.state === "running"
          ? "play"
          : "preview";
    this.publishGameState();
  }

  getGameState(): GameState {
    return {
      mounted: this._mounted,
      programLoaded: this._mounted && this._program != null && this._launchState != null,
      programVersion: this._program?.version ?? null,
      launchState: this._launchState,
      paused: !!this.controlledApp?.paused,
      stepping: this._stepping,
      run: this._workerPlay?.run ?? null,
      position: this._previewPosition,
      completion: this._completionStatus
        ? { request: this._completionRequest, status: this._completionStatus }
        : null,
      ending: this._ending,
    };
  }

  private publishGameState() {
    const notification = DidChangeGameStateMessage.type.notification(
      this.getGameState(),
    );
    this.updateBar(reducePlayerBar(this._bar, notification));
    sendProtocolMessage(notification, this.host);
  }

  protected updateExecutionLabels(params?: GameExecutedParams, run: number | null = null) {
    this.updateRoute(params);
    if (!params || (!this._workerGame && !this._workerPlay)) {
      this.updateBar(clearPlayerBarExecution(this._bar));
      return;
    }
    this.updateBar(
      reducePlayerBar(this._bar, GameExecutedMessage.type.notification(params), run),
    );
  }

  protected updateRoute(params?: GameExecutedParams): boolean {
    const button = this.refs.routeButton;
    if (params == null && !this.playing) {
      return false;
    }
    const failed = params?.simulation === "fail";
    const shows =
      (button != null || this._hostsRoute) &&
      params != null &&
      !this.playing &&
      this._workerGame != null &&
      (params.route != null || failed);
    if (!shows) {
      this.updateBarView({ routeShown: false });
      this._routeState = {
        ...this._routeState,
        route: undefined,
        failure: undefined,
      };
      this.setRouteOpen(false);
      this.renderRoute();
      return false;
    }
    this.updateBarView({ routeShown: true });
    const flow = params.simulateFlow;
    const target = params.startLocation;
    this._routeState = {
      ...this._routeState,
      route: failed ? undefined : params.route,
      failure: failed
        ? {
            message:
              describeSimulationFailure(
                params.simulation,
                params.simulationFailure,
              ) ?? "",
            scene:
              flow != null && params.simulateLocation
                ? flow
                : undefined,
            start:
              params.simulateLocation ??
              (target
                ? {
                    uri: target.uri,
                    range: {
                      start: { line: 0, character: 0 },
                      end: { line: 0, character: 0 },
                    },
                  }
                : undefined),
            target,
          }
        : undefined,
    };
    this.renderRoute();
    return true;
  }

  protected routeViewTargets() {
    return this._hostsRoute
      ? { button: null, list: null }
      : {
          button: this.refs.routeButton ?? null,
          list: this.refs.routeList ?? null,
        };
  }

  protected renderRoute() {
    if (this._disposed || (!this.refs.routeButton && !this._hostsRoute)) {
      return;
    }
    const open = this._routeState.open;
    if (!this._hostsRoute) {
      this.refs.viewport.classList.toggle("route-open", open);
      if (this.refs.routeList) {
        this.refs.routeList.hidden = !open;
      }
    }
    const start = this.valuesStart();
    if (this._valuesShownStart !== start) {
      this._valuesShownStart = start;
      this._valueFields = startChanged(this._valueFields, start);
      this._loaded = undefined;
      this._loadSaveOpen = false;
    }
    const loaded = this._loaded;
    const values =
      this._valueFields.kept && start !== undefined
        ? {
            ...fieldsView(this._valueFields, start, this.firstValueOf),
            start,
            listing:
              this._listing?.listing?.start === start
                ? this._listing.listing
                : undefined,
            search: this._valuesSearch,
            ...(loaded
              ? {
                  loaded: {
                    count: Object.keys(loaded.after).length,
                    name: loaded.name,
                    ...(loaded.failed ? { failed: true } : {}),
                  },
                }
              : {}),
          }
        : undefined;
    this._routeState = { ...this._routeState, values };
    if (open && values && start !== undefined) {
      void this.fetchListing(start);
    }
    renderRouteViews(this.routeViewTargets(), {
      state: this._routeState,
      nameOf: (uri) => this.getRelativeFilePath(uri) ?? uri,
      onOpen: () => this.setRouteOpen(true),
      onClose: () => this.setRouteOpen(false),
      onToggle: this.handleRouteToggle,
      onShowLine: this.handleRouteShowLine,
      onTab: this.handleRouteTab,
      values: values
        ? {
            ...this.valuesEvents,
            onUndoLoad: this.undoLoad,
            load: {
              saves: this._saves.rows(),
              open: this._loadSaveOpen,
              onOpen: (open) => {
                this._loadSaveOpen = open;
                this.renderRoute();
              },
              onPick: (id) => void this.loadSave(id),
            },
          }
        : undefined,
      onChangePins: this.handleRouteChangePins,
      onPinLastRun: this.handleRoutePinLastRun,
    });
    if (this._hostsRoute) {
      sendProtocolMessage(
        DidChangeRouteViewMessage.type.notification({
          view: this._barView.routeShown
            ? {
                ...this._routeState,
                ...(values
                  ? {
                      load: {
                        saves: this._saves.rows(),
                        open: this._loadSaveOpen,
                      },
                    }
                  : {}),
              }
            : null,
        }),
        this.host,
      );
    }
  }

  protected handleRouteViewAction = (
    message: RouteViewActionMessage.Notification,
  ) => {
    const { action } = message.params;
    switch (action.kind) {
      case "open":
      case "close":
        this.setRouteOpen(action.kind === "open");
        return;
      case "toggle":
        this.handleRouteToggle(action.routeKind, action.shown);
        return;
      case "changePins":
        void this.handleRouteChangePins(action.change);
        return;
      case "pinLastRun":
        void this.handleRoutePinLastRun();
        return;
      case "tab":
        this.handleRouteTab(action.tab);
        return;
      case "values":
        this.handleHostedValues(action.event);
        return;
    }
  };

  protected handleHostedValues(event: HostedValuesEvent) {
    switch (event.kind) {
      case "set":
        this.valuesEvents.onSet(event.key, event.value);
        return;
      case "clear":
        this.valuesEvents.onClear(event.key);
        return;
      case "draft":
        this.valuesEvents.onDraft(event.key, event.text);
        return;
      case "resetAll":
        this.valuesEvents.onResetAll();
        return;
      case "search":
        this.valuesEvents.onSearch(event.search);
        return;
      case "undoLoad":
        this.undoLoad();
        return;
      case "loadOpen":
        this._loadSaveOpen = event.open;
        this.renderRoute();
        return;
      case "loadPick":
        void this.loadSave(event.id);
        return;
    }
  }

  protected valuesStart(): string | undefined {
    const { route, failure } = this._routeState;
    if (route) {
      return route.valuesStart ?? route.start.scene ?? START_FLOW_NAME;
    }
    if (failure) {
      return failure.scene ?? START_FLOW_NAME;
    }
    return undefined;
  }

  protected async fetchListing(start: string) {
    const key = `${programIdentity(this._program) ?? ""}:${start}`;
    if (this._listing?.key === key) {
      return;
    }
    this._listing = { key, listing: this._listing?.listing };
    try {
      const result = await this.askWorkerGame(
        GetGameStartingValueListingMessage.type,
        { start },
      );
      if (this._listing?.key === key && result?.listing) {
        this._listing = { key, listing: result.listing };
        this.renderRoute();
      }
    } catch {
      if (this._listing?.key === key) {
        this._listing = undefined;
      }
    }
  }

  protected valuesEvents: StartingValuesEvents = {
    onSet: (key, value) => {
      this._loaded = undefined;
      void this.changeValues({ [key]: value });
    },
    onClear: (key) => {
      this._loaded = undefined;
      void this.changeValues({ [key]: null });
    },
    onDraft: (key, text) => {
      const start = this.valuesStart();
      if (start !== undefined) {
        this._valueFields = drafted(this._valueFields, start, key, text);
        this.renderRoute();
      }
    },
    onResetAll: () => {
      const start = this.valuesStart();
      if (start === undefined) {
        return;
      }
      const reset = resetAll(this._valueFields, start);
      this._valueFields = reset.state;
      this._loaded = undefined;
      this.renderRoute();
      if (Object.keys(reset.changes).length > 0) {
        void this.changeValues(reset.changes);
      }
    },
    onSearch: (search) => {
      this._valuesSearch = search;
      this.renderRoute();
    },
  };

  protected firstValueOf = (key: string) =>
    listingItems(this._listing?.listing).find((item) => item.key === key)
      ?.first;

  protected async changeValues(
    changes: Record<string, string | null>,
  ): Promise<boolean> {
    const start = this.valuesStart();
    if (start === undefined || !this._valueFields.kept) {
      return false;
    }
    const change = changed(this._valueFields, start, changes);
    this._valueFields = change.state;
    this.renderRoute();
    let saved = true;
    try {
      await this.requestHost(ChangeStartingValuesMessage.type, {
        start,
        changes,
      });
    } catch {
      saved = false;
    }
    this._valueFields = answered(this._valueFields, start, change, saved);
    this.renderRoute();
    if (saved && this._valueFields.kept) {
      await this.applyStartingValues(this._valueFields.kept);
    }
    return saved;
  }

  protected async loadSave(id: string) {
    this._loadSaveOpen = false;
    const start = this.valuesStart();
    const record = this._saves.record(id);
    const after =
      start !== undefined && record ? await this._saves.startingValuesOf(id, start) : undefined;
    if (
      start === undefined ||
      !record ||
      !after ||
      !this._valueFields.kept ||
      this.valuesStart() !== start
    ) {
      this.renderRoute();
      return;
    }
    const before = {
      ...ownEntry(shownValues(this._valueFields), start),
    };
    const changes: Record<string, string | null> = {
      ...Object.fromEntries(Object.keys(before).map((key) => [key, null])),
      ...after,
    };
    this._loaded = { start, name: record.name, before, after };
    const loaded = this._loaded;
    const saved = await this.changeValues(changes);
    if (this._loaded === loaded && !saved) {
      this._loaded = { ...loaded, failed: true };
      this.renderRoute();
    }
  }

  protected undoLoad = () => {
    const loaded = this._loaded;
    this._loaded = undefined;
    if (!loaded || loaded.failed || this.valuesStart() !== loaded.start) {
      this.renderRoute();
      return;
    }
    void this.changeValues({
      ...Object.fromEntries(Object.keys(loaded.after).map((key) => [key, null])),
      ...loaded.before,
    });
  };

  protected savesTargets() {
    return {
      button: this.refs.savesButton ?? null,
      menu: this.refs.savesMenu ?? null,
      note: this.refs.saveNote ?? null,
    };
  }

  protected renderSaves() {
    if (this._disposed) {
      return;
    }
    if (this._renderingSaves) {
      this._savesRenderDue = true;
      return;
    }
    this._renderingSaves = true;
    try {
      do {
        this._savesRenderDue = false;
        renderSavesViews(this.savesTargets(), {
          state: this._saves.viewState(),
          note: this._saves.note(),
          events: this._saves.events,
        });
      } while (this._savesRenderDue && !this._disposed);
    } finally {
      this._renderingSaves = false;
    }
  }

  protected handleSavesPointerDown = (e: PointerEvent) => {
    const target = e.target as Node | null;
    const inside = (element: HTMLElement | null | undefined) =>
      !!element && !!target && element.contains(target);
    if (
      this._saves.open &&
      !inside(this.refs.savesMenu) &&
      !inside(this.refs.savesButton)
    ) {
      this._saves.events.onOpen(false);
    }
  };

  protected handleSavesKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Escape") {
      return;
    }
    if (this._saves.open) {
      const view = this._saves.viewState();
      const key = (e.target as Element | null)
        ?.closest?.(".saves-value-row")
        ?.getAttribute("data-key");
      if (view.renaming || (key && view.values?.drafts[key] !== undefined)) {
        return;
      }
      e.stopImmediatePropagation();
      if (view.values) {
        this._saves.events.onBack();
      } else {
        this._saves.events.onOpen(false);
      }
    }
  };

  protected async playFromSave(data: string) {
    await this.ensureAudioContext();
    if (this._disposed) {
      return;
    }
    if (this.playing) {
      await this.destroyGameAndApp();
    }
    this._playSave = data;
    const plays = this._plays + 1;
    await this.startPlay();
    if (plays !== this._plays || !this._mounted || !this.playing) {
      return;
    }
    this.hidePlayButton();
    sendProtocolMessage(GameStartedMessage.type.notification({}), this.host);
  }

  protected handleRouteTab = (tab: RouteTab) => {
    this._routeState = { ...this._routeState, tab };
    this.renderRoute();
    sendProtocolMessage(
      DidChangeRouteTogglesMessage.type.notification({
        toggles: this._routeState.toggles,
        tab,
      }),
      this.host,
    );
  };

  protected setRouteOpen(open: boolean) {
    if (this._routeState.open === open) {
      return;
    }
    this._routeState = { ...this._routeState, open };
    this.renderRoute();
  }

  protected handleRouteToggle = (kind: RouteKind, shown: boolean) => {
    const toggles = { ...this._routeState.toggles, [kind]: shown };
    this._routeState = { ...this._routeState, toggles };
    this.renderRoute();
    sendProtocolMessage(
      DidChangeRouteTogglesMessage.type.notification({
        toggles,
        tab: this._routeState.tab,
      }),
      this.host,
    );
  };

  protected handleRouteShowLine = (location: DocumentLocation) => {
    sendProtocolMessage(
      ShowDocumentMessage.type.request({
        uri: location.uri,
        selection: {
          start: location.range.start,
          end: location.range.start,
        },
        takeFocus: true,
      }),
      this.host,
    );
  };

  protected _lastSizeReport?: GameResizedParams;

  reportSize() {
    this.fitToRatio();
    const rect = this.refs.game.getBoundingClientRect();
    const params: GameResizedParams = {
      width: rect.width,
      height: rect.height,
      aspectRatio: matchAspectRatio(rect.width, rect.height),
      fit: this._fit,
    };
    const last = this._lastSizeReport;
    if (
      last &&
      last.width === params.width &&
      last.height === params.height &&
      last.aspectRatio === params.aspectRatio &&
      last.fit === params.fit
    ) {
      return;
    }
    this._lastSizeReport = params;
    const notification = GameResizedMessage.type.notification(params);
    this.updateBar(reducePlayerBar(this._bar, notification));
    sendProtocolMessage(notification, this.host);
  }

  protected setGameSize(
    fit: GameFit,
    size?: { width?: number; height: number; minHeight?: boolean; scale?: number },
  ) {
    this._fit = fit;
    if (fit !== "ratio") {
      this._fitRatio = null;
    }
    const style = this.refs.game.style;
    style.width = size?.width != null ? `${size.width}px` : "";
    style.height = size ? `${size.height}px` : "";
    style.minHeight = size?.minHeight ? `${size.height}px` : "";
    style.alignSelf = size?.width != null ? "center" : "";
    const scale = size?.scale ?? 1;
    const scaled = scale < 1 && size?.width != null;
    style.transform = scaled ? `scale(${scale})` : "";
    style.transformOrigin = scaled ? "0 0" : "";
    style.marginRight = scaled ? `${size!.width! * (scale - 1)}px` : "";
    style.marginBottom = scaled ? `${size!.height * (scale - 1)}px` : "";
  }

  protected fitToRatio() {
    const ratio = this._fitRatio;
    if (this._fit !== "ratio" || !ratio) {
      return;
    }
    const [w, h] = ratio.split(":").map(Number) as [number, number];
    const availableWidth = this.refs.viewport.clientWidth;
    const availableHeight =
      this.refs.viewport.clientHeight - (this.refs.toolbar?.offsetHeight ?? 0);
    const width = Math.max(0, Math.min(availableWidth, (availableHeight * w) / h));
    const height = (width * h) / w;
    const scale =
      height > 0 ? Math.min(1, height / RATIO_REFERENCE_HEIGHT) : 1;
    const layoutWidth = width / scale;
    const layoutHeight = height / scale;
    const transform = scale < 1 ? `scale(${scale})` : "";
    const style = this.refs.game.style;
    if (
      style.width === `${layoutWidth}px` &&
      style.height === `${layoutHeight}px` &&
      style.transform === transform &&
      style.alignSelf === "center"
    ) {
      return;
    }
    this.setGameSize("ratio", {
      width: layoutWidth,
      height: layoutHeight,
      minHeight: true,
      scale,
    });
  }

  protected dragWidth() {
    return this._fit === "ratio"
      ? this.refs.viewport.clientWidth
      : this.refs.game.offsetWidth;
  }

  protected handleResize = () => {
    this.reportSize();
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
    this._resizeStartHeight = this.refs.game.getBoundingClientRect().height;

    document.body.style.cursor = "ns-resize";

    const width = this.dragWidth();
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

    this.updateBarView({ snapping: snapped });

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

    const width = this.dragWidth();
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
      this.setGameSize("auto");
    } else {
      this.setGameSize("height", { height: closestMatch, minHeight: true });
    }

    this.updateBarView({ snapping: snapped });

    this.reportSize();
  };

  protected handlePointerUpToolbar = (e: PointerEvent) => {
    this._isResizing = false;
    document.body.style.cursor = "";
    this.updateBarView({ snapping: false });
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  ensureAudioContext = async (): Promise<void> => {
    if (!this._audioContext) {
      this._audioContext = new AudioContext();
    }
    if (this._audioContext.state !== "running") {
      const context = this._audioContext;
      // workaround(chromium): AudioContext.resume() stays pending in a webview until the first user gesture, so rendering must not await it (seen with Chrome 157.0.8103.39)
      void context.resume().then(() => {
        if (!this._disposed && this._audioContext === context && context.state === "running") {
          this._app?.setAudioContext(context);
        }
      }).catch(() => {});
    }
    if (this._audioContext.state === "running") {
      this._app?.setAudioContext(this._audioContext);
    }
  };

  protected handleUserInteraction = () => {
    void this.ensureAudioContext();
  };

  protected handleClickPlayButton = async () => {
    const stops = this._stops;
    const clicked = this._plays;
    await this.ensureAudioContext();
    if (stops !== this._stops || clicked !== this._plays || this._disposed) {
      return;
    }
    const plays = this._plays + 1;
    if (this._workerPlay?.ended) {
      this.hidePlayButton();
      await this.restartGame();
      return;
    }
    await this.startGameAndApp();
    if (plays !== this._plays || !this._mounted || !this.playing) {
      return;
    }
    if (!this._workerPlay?.ended) {
      this.hidePlayButton();
    }
    sendProtocolMessage(GameStartedMessage.type.notification({}), this.host);
  };

  toggleFullscreen = () => {
    sendProtocolMessage(
      GameToggledFullscreenModeMessage.type.notification({}),
      this.host,
    );
  };

  protected registerProtocolHandlers(): void {
    const p = this._protocols;

    p.onNotification(
      SelectedCompilerDocumentMessage.type,
      this.handleSelectedCompilerDocument,
    );
    p.onNotification(
      RemovedCompilerFileMessage.type,
      this.handleRemovedCompilerFile,
    );
    p.onNotification(CompiledProgramMessage.type, this.handleCompiledProgram);
    p.onNotification(RouteViewActionMessage.type, this.handleRouteViewAction);
    p.onNotification(
      PreviewCompletionMessage.type,
      this.handlePreviewCompletion,
    );

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
    p.onRequest(
      SetAnimatePortraitsMessage.type,
      this.handleSetAnimatePortraits,
      this.host,
    );
    p.onRequest(
      SetStartingDisplayModeMessage.type,
      this.handleSetStartingDisplayMode,
      this.host,
    );
    p.onRequest(
      SetRouteTogglesMessage.type,
      this.handleSetRouteToggles,
      this.host,
    );
    p.onRequest(
      SetStartingValuesMessage.type,
      this.handleSetStartingValues,
      this.host,
    );
    p.onRequest(SetRoutePinsMessage.type, this.handleSetRoutePins, this.host);
    p.onRequest(PauseGameMessage.type, this.handlePauseGame, this.host);
    p.onRequest(UnpauseGameMessage.type, this.handleUnpauseGame, this.host);
    p.onRequest(StepGameClockMessage.type, this.handleStepGameClock, this.host);
    p.onRequest(StepGameMessage.type, this.handleStepGame, this.host);
    p.onRequest(RollBackGameMessage.type, this.handleRollBackGame, this.host);
    p.onRequest(
      RollForwardGameMessage.type,
      this.handleRollForwardGame,
      this.host,
    );
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
      SetGameVariableMessage.type,
      this.handleSetGameVariable,
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
            await workspace.compileTextDocument({ textDocument });
          }
        } else if (!programOutdated && !this.completionPreviewHoldsScreen()) {
          await this.updatePreview(
            this._program,
            startFrom.file,
            startFrom.line,
          );
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
      return;
    }
    this._completionSession = {
      uri: params.textDocument.uri,
      session: params.session,
    };
    this._completionAccepted = null;
    if (!params.contentChanges) {
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

  async wantCompletion(evaluation: CompletionEvaluation) {
    this._completionWanted = evaluation;
    const shown = this._completionShown;
    if (shown && shown.evaluation.key === evaluation.key) {
      this._completionPending = null;
      if (this.screenProgram === shown.program) {
        this.setCompletionStatus("showing");
        return;
      }
      this.setCompletionStatus("preparing");
      await this.drawCompletion(shown.evaluation, shown);
      return;
    }
    if (evaluation.key === this._completionEvaluating?.key) {
      this._completionPending = null;
      return;
    }
    this._completionPending = evaluation;
    this.setCompletionStatus("preparing");
    await this.evaluateCompletionPreviews();
  }

  get displayingSpeculative() {
    const program = this.screenProgram;
    return program != null && this._completionProgramSet.has(program);
  }

  completionPreviewEligible() {
    if (!this._mounted || this.playing) {
      return false;
    }
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return false;
    }
    const game = this.refs.game;
    return !game || !(game.clientWidth === 0 && game.clientHeight === 0);
  }

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
      reportUnlessRestarted(e);
    } finally {
      this._completionEvaluating = null;
    }
    void this.evaluateCompletionPreviews();
    if (
      !this.isWantedCompletion(evaluation) ||
      !this.completionPreviewEligible()
    ) {
      return;
    }
    if (evaluation.filesRevision !== (workspace.filesRevision ?? 0)) {
      await this.wantCompletion(this.completionEvaluation(params));
      return;
    }
    if (result?.outdated) {
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

  async refreshCompletionFiles() {
    const wanted = this._completionWanted;
    if (!wanted || !workspace || wanted.filesRevision === workspace.filesRevision) {
      return;
    }
    await this.wantCompletion(this.completionEvaluation(wanted.params));
  }

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
      await this.showRealDocument(
        shown,
        () => this._completionRequest === params.request,
      );
      return;
    }
    this.setCompletionStatus(null);
  }

  async showRealDocument(
    shown: ShownCompletion | null,
    current: () => boolean,
  ) {
    const startFrom = this._options?.startFrom;
    if (this._canonicalInvalid || !this._program || !startFrom) {
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

  endCompletionPreview() {
    this._completionSession = null;
    this._completionWanted = null;
    this._completionPending = null;
    this._completionShown = null;
    this._completionAccepted = null;
    this.setCompletionStatus(null);
  }

  setCompletionStatus(status: CompletionPreviewStatus | null) {
    if (status !== this._completionStatus) {
      this._completionStatus = status;
      this.publishGameState();
    }
  }


  protected handleCompiledProgram = async (
    message: CompiledProgramMessage.Notification,
  ) => {
    await this.loadProgram(message.params.program);
  };

  protected handleResizeGame = async (message: ResizeGameMessage.Request) => {
    const { params } = message;
    if (params.aspectRatio === undefined) {
      this.setGameSize("height", { height: params.height });
    } else if (params.aspectRatio === "auto") {
      this.setGameSize("auto");
    } else {
      this._fitRatio = params.aspectRatio;
      this._fit = "ratio";
    }
    this.reportSize();
    return ResizeGameMessage.type.response(message.id, {});
  };

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

  protected setDebugging = async (debugging: boolean): Promise<boolean> => {
    this._options ??= {};
    this._options.debugging = debugging;
    const type = debugging
      ? EnableGameDebugMessage.type
      : DisableGameDebugMessage.type;
    try {
      await this.askWorkerGame(type, {});
      return true;
    } catch (e) {
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
    if (this._workerPlay?.save !== undefined) {
      return StartGameMessage.type.response(message.id, { success: true });
    }
    const hid = !this._playRefusal;
    if (hid) {
      this.hidePlayButton();
    }
    const { started: success, refusal, owned } = await this.startPlay();
    if (!success && refusal && hid && owned) {
      this.showPlayButton();
    }
    this.updateLaunchStateIcon();
    return success
      ? StartGameMessage.type.response(message.id, { success })
      : StartGameMessage.type.error(message.id, {
          code: 1,
          message:
            refusal ??
            (!isRunnableProgram(this._program)
              ? "The program contains errors that prevent it from being compiled"
              : `The game could not be started`),
        });
  };

  protected handleStopGame = async (message: StopGameMessage.Request) => {
    const ended = this._workerPlay?.ended;
    await this.stopGame(
      !ended ? "quit" : ended.kind === "error" ? "error" : "finished",
    );
    return StopGameMessage.type.response(message.id, {});
  };

  protected handleRestartGame = async (message: RestartGameMessage.Request) => {
    const { started, refusal } = await this.restartPlay(true);
    return started || !refusal
      ? RestartGameMessage.type.response(message.id, {})
      : RestartGameMessage.type.error(message.id, {
          code: 1,
          message: refusal,
        });
  };

  protected async tellWorkerPlay<M extends string, P, R>(
    type: MessageProtocolRequestType<M, P, R>,
    params: P,
  ): Promise<boolean> {
    const play = this._workerPlay;
    if (!play) {
      return true;
    }
    if (this.startPending(play)) {
      if (type.method === StepGameClockMessage.method) {
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

  protected startPending(play: WorkerPlay | undefined): boolean {
    return play?.state === "starting" && !play.startSent;
  }

  protected _appPlay?: WorkerPlay;

  protected get controlledApp() {
    const play = this._workerPlay;
    return play && this._appPlay === play ? this._app : undefined;
  }

  protected get morphs() {
    const overlay = this.refs.gameUI;
    return overlay ? MorphPlayback.for(overlay) : undefined;
  }

  protected handleSetAnimatePortraits = async (
    message: SetAnimatePortraitsMessage.Request,
  ) => {
    this.morphs?.setEnabled(message.params.enabled);
    return SetAnimatePortraitsMessage.type.response(message.id, {});
  };

  protected handleSetRouteToggles = async (
    message: SetRouteTogglesMessage.Request,
  ) => {
    const tab = message.params.tab;
    this._routeState = {
      ...this._routeState,
      toggles: routeTogglesFrom(message.params.toggles),
      tab: tab === "values" || tab === "route" ? tab : this._routeState.tab,
    };
    this.renderRoute();
    return SetRouteTogglesMessage.type.response(message.id, {});
  };

  protected handleSetStartingValues = async (
    message: SetStartingValuesMessage.Request,
  ) => {
    const values = startingValuesFrom(message.params.values);
    this._valueFields = hostSent(this._valueFields, values);
    this.renderRoute();
    await this.applyStartingValues(values);
    return SetStartingValuesMessage.type.response(message.id, {});
  };

  protected async applyStartingValues(values: StartingValues) {
    if (
      JSON.stringify(values) ===
      JSON.stringify(this._options?.startingValues ?? null)
    ) {
      return;
    }
    if (this._options) {
      this._options.startingValues = values;
    } else {
      this._options = { startingValues: values };
    }
    try {
      await this.askWorkerGame(SetGameStartingValuesMessage.type, { values });
    } catch (e) {
      reportUnlessRestarted(e);
    }
    await this.redrawIdlePreview();
  }

  protected handleSetStartingDisplayMode = async (
    message: SetStartingDisplayModeMessage.Request,
  ) => {
    const { mode } = message.params;
    if ((this._options?.startingDisplayMode ?? "textbox") !== mode) {
      this._options ??= {};
      this._options.startingDisplayMode = mode;
      try {
        await this.askWorkerGame(SetStartingDisplayModeMessage.type, { mode });
      } catch (e) {
        reportUnlessRestarted(e);
      }
      await this.redrawIdlePreview();
    }
    return SetStartingDisplayModeMessage.type.response(message.id, {});
  };

  protected async redrawIdlePreview() {
    if (this.playing) {
      return;
    }
    if (this.completionPreviewHoldsScreen()) {
      const shown = this._completionShown;
      if (shown) {
        const { evaluation, ...result } = shown;
        await this.drawCompletion(evaluation, result);
      }
      return;
    }
    const startFrom = this._options?.startFrom;
    if (this._program && startFrom) {
      void this.updatePreview(this._program, startFrom.file, startFrom.line);
    }
  }

  protected handleSetRoutePins = async (message: SetRoutePinsMessage.Request) => {
    await this.applyRoutePins(message.params.pins);
    return SetRoutePinsMessage.type.response(message.id, {});
  };

  protected async applyRoutePins(pins: RoutePin[]) {
    this._savedRoutePins = pins;
    this.showRoutePins();
    this.renderRoute();
    const held = this._options?.routePins ?? [];
    if (JSON.stringify(pins) === JSON.stringify(held)) {
      return;
    }
    this._options ??= {};
    this._options.routePins = pins;
    const link = workspace?.gameLink;
    if (!link) {
      return;
    }
    try {
      await link.request(SetRoutePinsMessage.type, { pins });
    } catch (e) {
      reportUnlessRestarted(e);
      return;
    }
    if (this.playing) {
      return;
    }
    const shown = this._completionShown;
    if (this.completionPreviewHoldsScreen()) {
      if (shown) {
        const { evaluation, ...result } = shown;
        await this.drawCompletion(evaluation, result);
      }
      return;
    }
    const startFrom = this._options.startFrom;
    if (this._program && startFrom && startFrom.file in this._program.scripts) {
      await this.updatePreview(this._program, startFrom.file, startFrom.line);
    }
  }

  static readonly PIN_SAVE_TIMEOUT_MS = 5_000;

  protected _savedRoutePins: RoutePin[] = [];

  protected _pendingPinChanges: RoutePinChange[] = [];

  protected showRoutePins() {
    this._routeState = {
      ...this._routeState,
      pins: this._pendingPinChanges.reduce(changedPins, this._savedRoutePins),
    };
  }

  protected handleRoutePinLastRun = async () => {
    let run: RunMeeting[] | null = null;
    try {
      run =
        (await workspace?.gameLink?.request(LastRunMessage.type, {}))?.run ??
        null;
    } catch (e) {
      reportUnlessRestarted(e);
    }
    if (!run) {
      this._routeState = {
        ...this._routeState,
        lastRun: undefined,
        pinNote: LAST_RUN_CHANGED,
      };
      this.renderRoute();
      return;
    }
    const change = lastRunChange(
      this._pendingPinChanges.reduce(changedPins, this._savedRoutePins),
      run,
    );
    if (change) {
      await this.handleRouteChangePins(change);
    }
  };

  protected handleRouteChangePins = async (change: RoutePinChange) => {
    this._pendingPinChanges = [...this._pendingPinChanges, change];
    this._routeState = { ...this._routeState, pinNote: undefined };
    this.showRoutePins();
    this.renderRoute();
    let saved: RoutePin[] | undefined;
    try {
      saved = (await this.requestHost(ChangeRoutePinsMessage.type, change))
        .pins;
    } catch {
      saved = undefined;
    }
    this._pendingPinChanges = this._pendingPinChanges.filter(
      (pending) => pending !== change,
    );
    if (saved) {
      await this.applyRoutePins(saved);
      return;
    }
    this._routeState = { ...this._routeState, pinNote: PIN_NOT_SAVED };
    this.showRoutePins();
    this.renderRoute();
  };

  protected requestHost<M extends string, P, R>(
    type: MessageProtocolRequestType<M, P, R>,
    params: P,
    timeoutMs = GamePlayerController.PIN_SAVE_TIMEOUT_MS,
  ): Promise<R> {
    const request = type.request(params);
    return new Promise<R>((resolve, reject) => {
      const done = () => {
        clearTimeout(timer);
        window.removeEventListener(MessageProtocol.event, onProtocol);
      };
      const onProtocol = (e: Event) => {
        const message = e instanceof CustomEvent ? e.detail : undefined;
        if (!type.isResponse(message, request.id)) {
          return;
        }
        done();
        if ("error" in message && message.error !== undefined) {
          reject(message.error);
        } else {
          resolve(message.result as R);
        }
      };
      const timer = setTimeout(() => {
        done();
        reject(new Error(`The host did not answer ${type.method}.`));
      }, timeoutMs);
      window.addEventListener(MessageProtocol.event, onProtocol);
      sendProtocolMessage(request, this.host);
    });
  }

  protected handlePauseGame = async (message: PauseGameMessage.Request) => {
    const run = this._workerPlay?.run ?? null;
    const app = this.controlledApp;
    if (app && this._workerPlay?.ended) {
      return PauseGameMessage.type.response(message.id, { run });
    }
    const wasPaused = app?.paused;
    app?.pause();
    const told = app && (await this.tellWorkerPlay(PauseGameMessage.type, {}));
    if (!told && !wasPaused) {
      app?.unpause();
    }
    this.updateLaunchStateIcon();
    return told
      ? PauseGameMessage.type.response(message.id, { run })
      : PauseGameMessage.type.error(message.id, {
          code: 1,
          message: "no game loaded",
        });
  };

  protected handleUnpauseGame = async (message: UnpauseGameMessage.Request) => {
    const app = this.controlledApp;
    const wasPaused = app?.paused;
    app?.unpause();
    const told =
      app && (await this.tellWorkerPlay(UnpauseGameMessage.type, {}));
    if (!told && wasPaused) {
      app?.pause();
    }
    this.updateLaunchStateIcon();
    return told
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
    const app = this.controlledApp;
    const told =
      app &&
      (await this.tellWorkerPlay(StepGameClockMessage.type, {
        seconds,
      }));
    if (told) {
      app.skip(seconds);
    }
    this.updateLaunchStateIcon();
    return told
      ? StepGameClockMessage.type.response(message.id, {})
      : StepGameClockMessage.type.error(message.id, {
          code: 1,
          message: "no game loaded",
        });
  };

  protected handleStepGame = async (message: StepGameMessage.Request) => {
    const { traversal } = message.params;
    const run = this._workerPlay?.run ?? null;
    let answer: { done: boolean } | undefined;
    this.setStepping(true);
    try {
      answer = await this.askWorkerGame(StepGameMessage.type, { traversal });
    } catch (e) {
      return StepGameMessage.type.error(message.id, toResponseError(e));
    } finally {
      this.setStepping(false);
    }
    if (answer) {
      return StepGameMessage.type.response(message.id, { ...answer, run });
    }
    return StepGameMessage.type.error(message.id, {
      code: 1,
      message: "no game loaded",
    });
  };

  protected handleRollBackGame = (message: RollBackGameMessage.Request) =>
    this.rollGame(RollBackGameMessage.type, message);

  protected handleRollForwardGame = (message: RollForwardGameMessage.Request) =>
    this.rollGame(RollForwardGameMessage.type, message);

  protected async rollGame(
    type: typeof RollBackGameMessage.type | typeof RollForwardGameMessage.type,
    message: RollBackGameMessage.Request | RollForwardGameMessage.Request,
  ) {
    const play = this._workerPlay;
    const run = play?.run ?? null;
    let answer: RollBackGameMessage.Response["result"] | undefined;
    try {
      answer = await this.askWorkerGame(type, message.params);
    } catch (e) {
      return type.error(message.id, toResponseError(e));
    }
    if (answer?.held && this._workerPlay === play) {
      this.controlledApp?.pause();
      this.updateLaunchStateIcon();
    }
    if (answer) {
      return type.response(message.id, { ...answer, run });
    }
    return type.error(message.id, {
      code: 1,
      message: "no game loaded",
    });
  }

  protected setStepping(stepping: boolean) {
    if (stepping !== this._stepping && !this._disposed) {
      this._stepping = stepping;
      this.publishGameState();
    }
  }

  pauseGame() {
    return this.handlePauseGame(PauseGameMessage.type.request({}));
  }

  resumeGame() {
    return this.handleContinueGame(ContinueGameMessage.type.request({}));
  }

  stepGame(traversal: "in" | "out") {
    return this.handleStepGame(StepGameMessage.type.request({ traversal }));
  }

  skipBeat(direction: -1 | 1) {
    return this.requestHost(SkipBeatMessage.type, { direction }).catch(
      (e: unknown) => {
        console.error(e);
        return { moved: false };
      },
    );
  }

  protected handleContinueGame = async (
    message: ContinueGameMessage.Request,
  ) => {
    const run = this._workerPlay?.run ?? null;
    const app = this.controlledApp;
    const wasPaused = app?.paused;
    app?.unpause();
    if (this.startPending(this._workerPlay)) {
      this.updateLaunchStateIcon();
      return ContinueGameMessage.type.response(message.id, { done: false, run });
    }
    let answer: { done: boolean } | undefined;
    try {
      answer = await this.askWorkerGame(
        ContinueGameMessage.type,
        message.params,
      );
    } catch (e) {
      return ContinueGameMessage.type.error(message.id, toResponseError(e));
    } finally {
      if (!answer && wasPaused) {
        app?.pause();
      }
      this.updateLaunchStateIcon();
    }
    if (answer) {
      return ContinueGameMessage.type.response(message.id, { ...answer, run });
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
    const run = this._workerPlay?.run ?? null;
    const answer = await this.askWorkerGame(
      GetGameThreadsMessage.type,
      message.params,
    );
    if (answer) {
      return GetGameThreadsMessage.type.response(message.id, { ...answer, run });
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

  protected handleSetGameVariable = async (
    message: SetGameVariableMessage.Request,
  ) => {
    let answer;
    try {
      answer = await this.askWorkerGame(
        SetGameVariableMessage.type,
        message.params,
      );
    } catch (e) {
      return SetGameVariableMessage.type.error(message.id, {
        code: 1,
        message: (e as { message?: string })?.message ?? String(e),
      });
    }
    if (answer) {
      return SetGameVariableMessage.type.response(message.id, answer);
    }
    return SetGameVariableMessage.type.error(message.id, {
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

  loadProgram = async (program: SparkProgram) => {
    if (
      compiledElsewhere(program, this._options?.startFrom ?? program.startFrom)
    ) {
      return;
    }
    this.refusePlay(playRefusalOf(program));
    for (const arrived of [...this._programWaiters]) {
      arrived();
    }
    this._programAfterRestart?.arrive();
    this._programAfterRestart = undefined;
    return this.loadNewestProgram(program);
  };

  protected loadNewestProgram = conflate(
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
        workspace
          ?.programHeld(programIdentity(program)!)
          .catch((e) => reportUnlessRestarted(e));
      }
      if (this.playing) {
        this.scheduleRestartGame();
      } else {
        this._options ??= {};
        this._options.startFrom ??= program.startFrom;
        this._options.workspace ??= program.workspace;
        this.updateBarView({ workspace: this._options.workspace });
        if (this.completionPreviewHoldsScreen(program)) {
          void this.refreshCompletionFiles().catch(console.error);
        } else if (this._options.startFrom) {
          if (this._completionStatus === "stale") {
            this.setCompletionStatus(null);
          }
          const updating = this.updatePreview(
            program,
            this._options.startFrom.file,
            this._options.startFrom.line,
          );
          let arrived!: () => void;
          const arriving = new Promise<boolean>((resolve) => {
            arrived = () => resolve(true);
          });
          this._programWaiters.add(arrived);
          try {
            const superseded = await Promise.race([
              updating.then(() => false),
              arriving,
            ]);
            if (superseded) {
              updating.catch(console.error);
            }
          } finally {
            this._programWaiters.delete(arrived);
          }
        }
      }
      void this._saves.programChanged();
      this.updateLaunchStateIcon();
      if (isInitialProgram) {
        this._resolveLoadingInitialProgram();
      }
    },
    true,
  );

  protected _plays = 0;

  async startGameAndApp(
    restarted?: boolean,
    startFrom?: { file: string; line: number },
  ) {
    return (await this.startPlay(restarted, startFrom)).started;
  }

  protected async startPlay(
    restarted?: boolean,
    startFrom?: { file: string; line: number },
  ): Promise<PlayOutcome> {
    if (this._disposed) {
      return { started: false };
    }
    if (this._playRefusal) {
      return {
        started: false,
        refusal: this._playRefusal,
        owned: this._mounted && !this.playing,
      };
    }
    const plays = ++this._plays;
    const owned = () => plays === this._plays && this._mounted && !this.playing;
    const stops = this._stops;
    this.endCompletionPreview();
    if (!this._program) {
      await this.loadingInitialProgram;
      if (plays !== this._plays || stops !== this._stops || !this._mounted) {
        return { started: false };
      }
    }
    const afterRestart = this._programAfterRestart;
    if (afterRestart) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        afterRestart.arrived,
        new Promise((resolve) => {
          timer = setTimeout(resolve, this._programAfterRestartWaitMs);
        }),
      ]);
      clearTimeout(timer);
      if (this._programAfterRestart === afterRestart) {
        this._programAfterRestart = undefined;
      }
      if (plays !== this._plays || stops !== this._stops || !this._mounted) {
        return { started: false };
      }
    }
    if (this._playRefusal) {
      return { started: false, refusal: this._playRefusal, owned: owned() };
    }
    const link = workspace?.gameLink;
    if (!this._program || !link) {
      return { started: false };
    }
    const refused: { refusal?: string } = {};
    const started = await this.startWorkerPlay(
      this._program,
      link,
      restarted,
      refused,
      startFrom,
    );
    if (refused.refusal) {
      if (plays === this._plays) {
        await this.showPreviewAfterRefusal();
      }
      return {
        started: false,
        refusal: refused.refusal,
        previewShown: true,
        owned: owned(),
      };
    }
    return { started };
  }

  protected async showPreviewAfterRefusal() {
    const startFrom = this._options?.startFrom;
    if (this.playing || !this._mounted || !this._program || !startFrom) {
      return;
    }
    await this.updatePreview(this._program, startFrom.file, startFrom.line);
  }

  protected async startWorkerPlay(
    program: SparkProgram,
    link: WorkerGameLink,
    restarted?: boolean,
    refused?: { refusal?: string },
    startFrom: { file: string; line: number } | undefined = this._options
      ?.startFrom ?? undefined,
  ): Promise<boolean> {
    const save = this._playSave;
    this._playSave = undefined;
    const play: WorkerPlay = {
      program,
      state: "starting",
      stepped: 0,
      ...(startFrom ? { startFrom } : {}),
      ...(save !== undefined ? { save } : {}),
    };
    this._workerPlay = play;
    this.setEndingStatus(null);
    this._routeState = { ...this._routeState, lastRun: undefined };
    const current = () => this._workerPlay === play;
    let stopListening: (() => void) | undefined;
    const release = () => {
      stopListening?.();
      if (this._stopListeningToPlay === stopListening) {
        this._stopListeningToPlay = undefined;
      }
      stopListening = undefined;
    };
    const abandon = () => {
      release();
      if (play.run != null) {
        link
          .request(StopPlayMessage.type, { run: play.run })
          .catch((e) => reportUnlessRestarted(e));
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
        startFrom,
        restarted,
        ...(save !== undefined ? { save } : {}),
      });
      play.run = built.run;
      if (built.refusal) {
        if (current()) {
          this._workerPlay = undefined;
          if (refused) {
            refused.refusal = built.refusal;
          }
        }
        return false;
      }
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
      this.publishGameState();
      void this._saves.playStarted();
      link.detach();
      this.beginRuntimeRun(program, play, built.errors ?? []);
      stopListening = this.listenToWorker(link, play);
      this._stopListeningToPlay?.();
      this._stopListeningToPlay = stopListening;
      await this._workerAppSettling;
      if (!current()) {
        return abandon();
      }
      const app = await this.buildAppFor(
        {
          connect: async (send) => {
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
              reportUnlessRestarted(e);
            }
          },
          receive: (message) => link.receive(message),
        },
        false,
        current,
        play,
      );
      const refusal = this._playRefusal;
      if (!current() || refusal) {
        if (refusal && current()) {
          this._workerPlay = undefined;
          if (refused) {
            refused.refusal = refusal;
          }
        }
        if (play.sink) {
          link.detach(play.sink);
        }
        if (this._app === app) {
          this._app = undefined;
        }
        if (!app.destroyed) {
          await app.destroy(true);
        }
        return abandon();
      }
      let workerPaused = app.paused;
      const seconds = play.stepped;
      play.stepped = 0;
      play.startSent = true;
      this._lastStartedRun = play;
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
      this.renderSaves();
      return built.compiled === true;
    } catch (e) {
      reportUnlessRestarted(e);
      if (current()) {
        await this.destroyGameAndApp();
      } else {
        release();
      }
      return false;
    } finally {
      if (current() || !this._workerPlay) {
        this._startingPlay = false;
      }
    }
  }

  protected async endWorkerPlay(): Promise<DocumentLocation | null> {
    const play = this._workerPlay;
    if (!play) {
      return null;
    }
    this._workerPlay = undefined;
    this._endingPlay = play;
    if (play.state === "starting") {
      this._startingPlay = false;
    }
    this.renderSaves();
    this._stopListeningToPlay?.();
    this._stopListeningToPlay = undefined;
    const link = workspace?.gameLink;
    if (play.sink) {
      link?.detach(play.sink);
    }
    try {
      const stopped = await link?.request(StopPlayMessage.type, {
        run: play.run,
      });
      if (stopped?.choices && !this._workerPlay) {
        this._routeState = { ...this._routeState, lastRun: stopped.choices };
        this.renderRoute();
      }
      return stopped?.location ?? null;
    } catch (e) {
      reportUnlessRestarted(e);
      return null;
    } finally {
      if (this._endingPlay === play) {
        this._endingPlay = undefined;
      }
    }
  }

  async destroyGameAndApp() {
    await this.releaseGames();
    if (this._mounted) {
      this.updateLaunchStateIcon();
    }
  }

  protected async releaseGames() {
    this.cancelScheduledRestart();
    const plays = this._plays;
    const ending = this.endWorkerPlay();
    const detaching = this.detachWorkerPreview();
    await ending;
    await detaching;
    const app = this._app;
    if (app && plays === this._plays) {
      await app.initializing;
      if (plays === this._plays) {
        if (!app.destroyed) {
          app.destroy(true);
        }
        if (this._app === app) {
          this._app = undefined;
        }
      }
    }
  }

  async detachWorkerPreview() {
    this._workerDetaches += 1;
    for (const ended of [...this._displayWaiters]) {
      ended();
    }
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
      if (!building) {
        await app.initializing;
        await app.destroy(true);
      }
    }
  }

  protected holdEndedPlay(owner: unknown, params: GameEnding) {
    const play = this._workerPlay;
    if (!play || play !== owner || play.ended) {
      return;
    }
    const ending: GameEnding = {
      kind: params.kind,
      location: params.location,
      ...(params.error ? { error: params.error } : {}),
    };
    play.ended = ending;
    const app = this.controlledApp;
    if (app?.paused) {
      app.unpause();
      void this.tellWorkerPlay(UnpauseGameMessage.type, {});
    }
    this.updateLaunchStateIcon();
    this.setEndingStatus(ending);
    sendProtocolMessage(
      GameEndedMessage.type.notification({ ...ending, run: play.run }),
      this.host,
    );
    if (!this.refs.toolbar) {
      this.showPlayButton();
    }
  }

  protected releaseEndedPlay(owner: unknown) {
    const play = this._workerPlay;
    if (!play || play !== owner || !play.ended) {
      return;
    }
    play.ended = undefined;
    this.updateLaunchStateIcon();
    this.setEndingStatus(null);
    if (!this.refs.toolbar) {
      this.hidePlayButton();
    }
  }

  protected setEndingStatus(ending: GameEnding | null) {
    if (ending !== this._ending) {
      this._ending = ending;
      this.publishGameState();
    }
  }

  async stopGame(
    reason: "finished" | "quit" | "invalidated" | "error" | "restart",
    error?: {
      message: string;
      location: DocumentLocation;
    },
    options?: {
      select?: boolean;
      at?: DocumentLocation | null;
    },
  ) {
    this._stops += 1;
    const plays = this._plays;
    const stoppedRun = this._workerPlay?.run;
    const ended = this._workerPlay?.ended;
    const endedAt =
      options?.at ?? ended?.error?.location ?? ended?.location ?? null;
    this.setEndingStatus(null);
    const lastExecutedLocation = await this.endWorkerPlay();
    const overtaken = () => plays !== this._plays || !this._mounted;
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
    if (this._lastStartedRun) {
      this._lastStartedRun.exitClaimed = true;
    }
    sendProtocolMessage(
      GameExitedMessage.type.notification({
        reason,
        error,
        run: stoppedRun,
      }),
      this.host,
    );
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    if (overtaken()) {
      return;
    }
    const selected = error?.location ?? endedAt ?? lastExecutedLocation;
    const run = this._runtimeRun;
    this._runtimeRunPosition =
      selected && run
        ? this.runtimePosition(
            run.program,
            selected.uri,
            selected.range.start.line,
          )
        : undefined;
    if (selected && workspace && options?.select !== false) {
      await workspace.selectTextDocument({
        textDocument: { uri: selected.uri },
        selectedRange: selected.range,
        userEvent: true,
        docChanged: false,
      });
      if (ended && this._program && !overtaken()) {
        await this.updatePreview(
          this._program,
          selected.uri,
          selected.range.start.line,
        );
      }
    }
  }

  protected handleWorkerHang = (hang: WorkerHang) => {
    if (!this._programAfterRestart) {
      let arrive!: () => void;
      const arrived = new Promise<void>((resolve) => (arrive = resolve));
      this._programAfterRestart = { arrived, arrive };
    }
    const during =
      this._workerPlay || this._endingPlay || this._startingPlay
        ? "play"
        : "preview";
    const message = workerHangMessage(hang, during);
    const location = hang.location;
    if (this._runtimeRun && location) {
      this.recordRuntimeError(this._runtimeRun.owner, {
        message,
        type: ErrorType.Error,
        location,
      });
    }
    sendProtocolMessage(
      GameWorkerRestartedMessage.type.notification({
        message,
        location,
        during,
      }),
      this.host,
    );
    if (this._workerPlay) {
      this.stopGame("error", location ? { message, location } : undefined, {
        select: false,
      }).catch((e) => console.error(e));
    } else if (during === "preview") {
      this._previewPosition = null;
      this.publishGameState();
      this.detachWorkerPreview().catch((e) => console.error(e));
    }
  };

  protected _stops = 0;

  async restartGame(fromRunStart = false): Promise<boolean> {
    return (await this.restartPlay(fromRunStart)).started;
  }

  protected async restartPlay(fromRunStart = false): Promise<PlayOutcome> {
    const stops = this._stops;
    const plays = this._plays;
    const startFrom = fromRunStart ? this._workerPlay?.startFrom : undefined;
    const ended = this._workerPlay?.ended;
    const save = this._workerPlay?.save;
    this.setEndingStatus(null);
    await this.destroyGameAndApp();
    if (stops !== this._stops || plays !== this._plays || !this._mounted) {
      return { started: false };
    }
    this._playSave = save;
    const restarted = plays + 1;
    const outcome = await this.startPlay(true, startFrom);
    if (
      stops === this._stops &&
      restarted === this._plays &&
      this._mounted &&
      this.playing
    ) {
      return { started: true };
    }
    if (outcome.refusal && outcome.owned && stops === this._stops) {
      const ended = this._lastStartedRun;
      if (ended && !ended.exitClaimed) {
        ended.exitClaimed = true;
        sendProtocolMessage(
          GameExitedMessage.type.notification({
            reason: "invalidated",
            run: ended.run,
          }),
          this.host,
        );
      }
      this.showPlayButton();
      if (!outcome.previewShown) {
        await this.showPreviewAfterRefusal();
      }
    } else if (
      !outcome.refusal &&
      ended &&
      stops === this._stops &&
      restarted === this._plays &&
      this._mounted &&
      !this.playing
    ) {
      await this.stopGame("invalidated", undefined, {
        at: ended.error?.location ?? ended.location,
      });
    }
    return { started: false, refusal: outcome.refusal };
  }

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
      if (this.playing && (await this.restartGame())) {
        sendProtocolMessage(
          GameReloadedMessage.type.notification({}),
          this.host,
        );
      }
    }, 1000);
  }

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

  protected async buildAppFor(
    game: GameEndpoint,
    previewing: boolean,
    owned: () => boolean = () => true,
    play?: WorkerPlay,
  ) {
    const old = this._app;
    if (old && owned()) {
      profile("start", "app/destroy");
      await old.destroy(true);
      if (this._app === old) {
        this._app = undefined;
      }
      profile("end", "app/destroy");
    }
    this.updateExecutionLabels();
    await this.ensureAudioContext();
    profile("start", "app/create");
    const app = this.createApp(game, previewing);
    if (owned()) {
      this._app = app;
      this._appPlay = play;
    }
    profile("end", "app/create");
    profile("start", "app/init");
    try {
      await app.init();
    } catch (e) {
      if (this._app !== app) {
        await app.destroy(true);
      }
      throw e;
    }
    profile("end", "app/init");
    return app;
  }

  protected createApp(game: GameEndpoint, previewing: boolean): Application {
    return new Application(game, this.refs.gameView, this.refs.gameUI, {
      previewing,
      audioContext: this._audioContext,
      assetCache: getSharedAssetCache(),
    });
  }

  listen(
    game: {
      connection: {
        outgoing: { addListener(method: string, listener: (msg: any) => void): unknown };
      };
    },
    owner: unknown = game,
  ) {
    game.connection.outgoing.addListener(
      GameEncounteredRuntimeErrorMessage.method,
      async (msg) => {
        if (GameEncounteredRuntimeErrorMessage.type.isNotification(msg)) {
          const type = msg.params.type;
          const message = msg.params.message;
          const location = msg.params.location;
          this.recordRuntimeError(owner, { message, type, location });
          if (!this.displayingSpeculative) {
            sendProtocolMessage(
              GameEncounteredRuntimeErrorMessage.type.notification(msg.params),
              this.host,
            );
          }
          if (type === ErrorType.Error) {
            console.error(message, location);
          } else if (type === ErrorType.Warning) {
            console.warn(message, location);
          } else {
            console.log(message, location);
          }
        }
      },
    );
    game.connection.outgoing.addListener(
      GameToggledConsoleMessage.method,
      (msg) => {
        if (
          GameToggledConsoleMessage.type.isNotification(msg) &&
          !this.displayingSpeculative
        ) {
          sendProtocolMessage(
            GameToggledConsoleMessage.type.notification(msg.params),
            this.host,
          );
        }
      },
    );
    game.connection.outgoing.addListener(
      GameFinishedMessage.method,
      (msg) => {
        if (GameFinishedMessage.type.isNotification(msg)) {
          this.holdEndedPlay(owner, msg.params);
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
        this.updateExecutionLabels(msg.params, this.runOf(owner) ?? null);
        if (this.displayingSpeculative) {
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
        this.updateBar(reducePlayerBar(this._bar, msg, this.runOf(owner) ?? null));
        sendProtocolMessage(
          GameSteppedMessage.type.notification({
            ...msg.params,
            run: this.runOf(owner),
          }),
          this.host,
        );
      }
    });
    game.connection.outgoing.addListener(GameRolledMessage.method, (msg) => {
      if (GameRolledMessage.type.isNotification(msg)) {
        this.releaseEndedPlay(owner);
        this.updateBar(reducePlayerBar(this._bar, msg, this.runOf(owner) ?? null));
        sendProtocolMessage(
          GameRolledMessage.type.notification({
            ...msg.params,
            run: this.runOf(owner),
          }),
          this.host,
        );
      }
    });
    game.connection.outgoing.addListener(
      GameHitBreakpointMessage.method,
      (msg) => {
        if (GameHitBreakpointMessage.type.isNotification(msg)) {
          sendProtocolMessage(
            GameHitBreakpointMessage.type.notification({
              ...msg.params,
              run: this.runOf(owner),
            }),
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
            GameAwaitingInteractionMessage.type.notification({
              ...msg.params,
              run: this.runOf(owner),
            }),
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
            GameAutoAdvancedToContinueMessage.type.notification({
              ...msg.params,
              run: this.runOf(owner),
            }),
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
            GameClickedToContinueMessage.type.notification({
              ...msg.params,
              run: this.runOf(owner),
            }),
            this.host,
          );
        }
      },
    );
    game.connection.outgoing.addListener(
      GameSavedSceneEntryMessage.method,
      (msg) => {
        if (
          GameSavedSceneEntryMessage.type.isNotification(msg) &&
          owner === this._workerPlay
        ) {
          this._saves.sceneEntered(msg.params.save).catch(() => {});
        }
      },
    );
    game.connection.outgoing.addListener(
      GameChosePathToContinueMessage.method,
      (msg) => {
        if (GameChosePathToContinueMessage.type.isNotification(msg)) {
          sendProtocolMessage(
            GameChosePathToContinueMessage.type.notification({
              ...msg.params,
              run: this.runOf(owner),
            }),
            this.host,
          );
        }
      },
    );
  }

  protected runOf(owner: unknown): number | undefined {
    const run = (owner as { run?: unknown } | null)?.run;
    return typeof run === "number" ? run : undefined;
  }

  listenToWorker(
    link: WorkerGameLink,
    owner: unknown = link,
  ): () => void {
    const stops: (() => void)[] = [];
    this.listen(
      {
        connection: {
          outgoing: {
            addListener: (method, listener) =>
              stops.push(link.addListener(method, listener)),
          },
        },
      },
      owner,
    );
    return () => stops.forEach((stop) => stop());
  }

  protected _workerAppBuilding?: Promise<Application>;

  protected _workerAppFresh = false;

  protected _workerDetaches = 0;

  protected _displayWaiters = new Set<() => void>();

  protected _programWaiters = new Set<() => void>();

  protected _workerAppSettling?: Promise<void>;

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
    if (workspace?.isSetAside?.({ file, line })) {
      return false;
    }
    if (!options?.speculative) {
      this._completionShown = null;
    }
    this.morphs?.setSession(`preview:${file}:${line}`);
    const selectionVersion = this._selectionVersion;
    const update = ++this._previewUpdates;
    for (const ended of [...this._displayWaiters]) {
      ended();
    }
    const detaches = this._workerDetaches;
    const overtaken = () =>
      update !== this._previewUpdates ||
      detaches !== this._workerDetaches ||
      this._startingPlay ||
      this._workerPlay != null ||
      options?.current?.() === false;
    this._workerGame ??= {};
    this._workerGame.program = program;
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
    let result:
      | {
          displayed: boolean;
          errors?: SimulationError[];
          path?: string;
          refused?: string;
          ending?: GameEnding;
        }
      | undefined;
    let ended!: () => void;
    const ending = new Promise<{ displayed: boolean }>((resolve) => {
      ended = () => resolve({ displayed: false });
    });
    this._displayWaiters.add(ended);
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
        ending,
      ]);
    } catch (e) {
      reportUnlessRestarted(e);
      return false;
    } finally {
      this._displayWaiters.delete(ended);
    }
    if (result.displayed && result.path) {
      const name = `player displayPreview path ${result.path}${result.refused ? ` ${result.refused}` : ""}`;
      profile("start", name);
      profile("end", name);
    }
    if (result.displayed && detaches === this._workerDetaches) {
      this._workerAppFresh = false;
    }
    if (overtaken() || !result.displayed) {
      return false;
    }
    this.setEndingStatus(result.ending ?? null);
    if (!options?.speculative) {
      this.beginPreviewRuntimeRun(program, link, file, line, result.errors ?? []);
    }
    if (selectionVersion === this._selectionVersion) {
      this._previewPosition = { uri: file, line };
      this.publishGameState();
    }
    return true;
  };

  protected restoreWorkerDebugger(link: WorkerGameLink) {
    const options = this._options;
    const sent: Promise<unknown>[] = [];
    if (options?.startingValues) {
      sent.push(
        link.request(SetGameStartingValuesMessage.type, {
          values: options.startingValues,
        }),
      );
    }
    if (options?.startingDisplayMode) {
      sent.push(
        link.request(SetStartingDisplayModeMessage.type, {
          mode: options.startingDisplayMode,
        }),
      );
    }
    if (options?.breakpoints) {
      sent.push(
        link.request(SetGameBreakpointsMessage.type, {
          breakpoints: options.breakpoints,
        }),
      );
    }
    if (options?.routePins?.length) {
      sent.push(
        link.request(SetRoutePinsMessage.type, { pins: options.routePins }),
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
      request.catch((e) => reportUnlessRestarted(e));
    }
  }
}
