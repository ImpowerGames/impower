import type { Message } from "@impower/jsonrpc/src/common/types/Message";
import type { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { ResponseError } from "@impower/jsonrpc/src/common/types/ResponseError";
import {
  TOP_LEVEL_START,
  type ProgramAddress,
  type ProgramLocator,
} from "@impower/sparkdown/src/compiler/types/ProgramAddress";
import { type SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import {
  type CarriedDeclarations,
  ProgramStory,
} from "@impower/sparkdown/src/program/ProgramStory";
import type { ProgramImage } from "@impower/sparkdown/src/program/ProgramImages";
import type { ProgramRoot } from "@impower/sparkdown/src/program/ProgramRoot";
import type { ProgramStoryState } from "@impower/sparkdown/src/program/ProgramStoryState";
import {
  durableAddress,
  placeDurableAddress,
} from "@impower/sparkdown/src/program/ProgramSave";
import { chunkOfAddress } from "@impower/sparkdown/src/program/ProgramChunk";
import { START_FLOW_NAME } from "@impower/sparkdown/src/program/ProgramSymbols";
import {
  buildRouteSimulator,
  lastSearchStats,
  planRoute,
  showsBeatAhead,
  routeChargeAt,
  stepsBeforeDeparture,
  stepsBeforePinMet,
  stepsBeforeTargetDecision,
  type LevelZeroStore,
  type LevelZeroWork,
  type SearchOptions,
  type RoutePlan,
  type RouteResumePoint,
  type RouteSimulator,
} from "@impower/sparkdown/src/compiler/utils/planRoute";
import {
  routeDecisions,
  type ScriptStructure,
} from "@impower/sparkdown/src/compiler/utils/routeDecisions";
import {
  applyStartValues,
  bindStartArguments,
  carryStoreListing,
  planSetsParameters,
  startPlanKey,
  startPlanOf,
  startStoryAt,
  startingValueListing,
  type StartPlan,
  type StartingValueSource,
} from "@impower/sparkdown/src/program/startingValues";
import {
  ownEntry,
  type StartingValueListing,
  type StartingValues,
} from "@impower/sparkdown/src/program/startingValueLiterals";
import {
  pinnedNotOffered,
  pinnedOptionsOf,
  type PinnedOptions,
  type RoutePin,
} from "@impower/sparkdown/src/compiler/utils/routePins";
import type { SimulationError } from "@impower/sparkdown/src/compiler/types/SimulationError";
import { uuid } from "@impower/sparkdown/src/compiler/utils/uuid";
import { ErrorType as InkErrorType } from "@impower/sparkdown/src/runtime/Error";
import { ambientReads } from "@impower/sparkdown/src/runtime/AmbientReads";
import { storyDraws } from "@impower/sparkdown/src/runtime/StoryRandom";
import type { CallStack } from "@impower/sparkdown/src/runtime/CallStack";
import { InkObject } from "@impower/sparkdown/src/runtime/Object";
import { PushPopType } from "@impower/sparkdown/src/runtime/PushPop";
import { StepLimitExceeded } from "@impower/sparkdown/src/runtime/StoryException";
import {
  ObjectValue,
  VariablePointerValue,
} from "@impower/sparkdown/src/runtime/Value";
import type {
  VariableBinding,
  WriteWatch,
} from "@impower/sparkdown/src/runtime/VariablesState";
import { DEFAULT_MODULES } from "../../modules/DEFAULT_MODULES";
import { beatIndexIn } from "../../modules/assets/utils/previewWindow";
import { ErrorType } from "../enums/ErrorType";
import type { Breakpoint } from "../types/Breakpoint";
import type { DocumentLocation } from "../types/DocumentLocation";
import type {
  PreviewRoute,
  PreviewRouteDecision,
  PreviewRouteOption,
  RunMeeting,
  RunMenu,
  ScriptSource,
} from "../types/PreviewRoute";
import { conditionText } from "../utils/conditionText";
import type { ExecutedLines } from "../types/ExecutedLines";
import type { GameConfiguration } from "../types/GameConfiguration";
import type { GameContext } from "../types/GameContext";
import type { GameState } from "../types/GameState";
import type { InstanceMap } from "../types/InstanceMap";
import type { Instructions } from "../types/Instructions";
import type { RouteResumption } from "../types/RouteResumption";
import { SceneTracker } from "./SceneTracker";
import type { SaveData } from "../types/SaveData";
import type { ScriptLocation } from "../types/ScriptLocation";
import type { StackFrame } from "../types/StackFrame";
import type { SystemConfiguration } from "../types/SystemConfiguration";
import type { Thread } from "../types/Thread";
import type { Variable,VariablePresentationHint } from "../types/Variable";
import { buildDefinesContext } from "../utils/buildContextFromStory";
import { lineRanges } from "../utils/executedLineRanges";
import {
  programAssignmentAddresses,
  programBreakpointLines,
  programEntryCode,
  programFunctionAddress,
  runsAfterReset,
} from "../utils/programBreakpoints";
import {
  levelZeroHolds,
  validAddressPrefixLength,
} from "../utils/routeResume";
import { storyPositions, type StoryPositions } from "../utils/storyPositions";
import { CheckpointStore, type StoredCheckpoint } from "./CheckpointStore";
import { Clock } from "./Clock";
import { Connection } from "./Connection";
import { Coordinator } from "./Coordinator";
import { GameAutoAdvancedToContinueMessage } from "./messages/GameAutoAdvancedToContinueMessage";
import { GameAwaitingInteractionMessage } from "./messages/GameAwaitingInteractionMessage";
import { GameChosePathToContinueMessage } from "./messages/GameChosePathToContinueMessage";
import { GameClickedToContinueMessage } from "./messages/GameClickedToContinueMessage";
import { GameEncounteredRuntimeErrorMessage } from "./messages/GameEncounteredRuntimeError";
import {
  GameExecutedMessage,
  type GameExecutedParams,
  type SimulationFailure,
} from "./messages/GameExecutedMessage";
import { GameExitedThreadMessage } from "./messages/GameExitedThreadMessage";
import { GameFinishedMessage } from "./messages/GameFinishedMessage";
import { GameHitBreakpointMessage } from "./messages/GameHitBreakpointMessage";
import { GamePreviewedMessage } from "./messages/GamePreviewedMessage";
import { GameStartedMessage } from "./messages/GameStartedMessage";
import { GameStartedThreadMessage } from "./messages/GameStartedThreadMessage";
import { GameSteppedMessage } from "./messages/GameSteppedMessage";
import { Module } from "./Module";
import { RecencySet, type RecencyEntry } from "./RecencySet";
import { RuntimeState } from "./RuntimeState";

export type DefaultModuleConstructors = typeof DEFAULT_MODULES;

export type GameModules = InstanceMap<DefaultModuleConstructors>;

export type M = { [name: string]: Module };

export interface RouteStarts {
  startPlans?: (from: string) => StartPlan | undefined;
}

const restsAfter = (
  state: unknown,
  address: ProgramAddress | undefined,
): boolean => {
  const position = (state as Partial<ProgramImage> | undefined)?.positional
    ?.position;
  return (
    address !== undefined &&
    position != null &&
    position.offset === 0 &&
    position.after === chunkOfAddress(address)
  );
};

const isEvaluable =(value: unknown, depth = 0): boolean => {
  if (value === undefined || typeof value === "function") {
    return false;
  }
  if (value === null || typeof value !== "object") {
    return true;
  }
  if (value instanceof Map || value instanceof Set || depth > 8) {
    return false;
  }
  return Object.values(value).every(
    (item) => item === undefined || isEvaluable(item, depth + 1),
  );
};

const sameLocation = (
  a: ScriptLocation | null | undefined,
  b: ScriptLocation | null | undefined,
): boolean => {
  if (!a || !b) {
    return !a && !b;
  }
  return a.length === b.length && a.every((value, i) => value === b[i]);
};

export class Game<T extends M = {}> {
  protected _clock?: Clock;
  get clock() {
    return this._clock;
  }

  protected _context: GameContext = {} as GameContext;
  get context() {
    return this._context;
  }

  protected _stored: string[] = [];
  public get stored() {
    return this._stored;
  }

  protected _modules: Record<string, Module> = {};
  get module() {
    return this._modules as GameModules & T;
  }

  protected _moduleNames: string[];

  protected _connection: Connection;
  get connection() {
    return this._connection;
  }

  protected _story!: ProgramStory;
  get story() {
    return this._story;
  }

  protected _scripts: string[] = [];
  get scripts() {
    return this._scripts;
  }

  protected _coordinator: Coordinator<typeof this> | null = null;

  protected _holdingFlush = false;

  protected _held: { instructions: Instructions | null } | null = null;

  protected _previewGeneration = 0;

  protected _pendingPreview: {
    address: ProgramAddress;
    generation: number;
    promise: Promise<ProgramAddress | null>;
    abandon: () => void;
    cancel: () => void;
  } | null = null;

  protected _shownChoices: string[] = [];

  protected _executionStepLimit = 2_000_000;

  protected _executionStepsRemaining = 2_000_000;

  protected _callDepthLimit = 5_000;

  protected _executionBudgetExhausted = false;

  protected _executingAddress: ProgramAddress | null = null;
  get executingAddress() {
    return this._executingAddress;
  }

  protected _positions!: StoryPositions;
  get locator(): ProgramLocator {
    return this._positions.locator;
  }

  protected _sceneTracker = new SceneTracker((flow) =>
    this.isFunctionFlow(flow),
  );
  get sceneTracker() {
    return this._sceneTracker;
  }

  protected _sceneProgram?: SparkProgram;

  protected _declarationsRun = 0;
  get declarationsRun() {
    return this._declarationsRun;
  }

  protected _changesSince?: {
    program: SparkProgram;
    beat?: { uri: string; line: number };
    route?: RoutePlan;
    targetWrote?: boolean;
    targetVisits?: string;
    unrepeatable?: boolean;
    scenes: Set<string>;
    unmeasured: boolean;
  };

  protected _routeTargetWrote?: boolean;
  protected _routeTargetVisits?: string;
  protected _routeUnrepeatable?: boolean;
  protected _targetWatch?: {
    changes: { globals: Set<string>; tables: Set<object> };
    unmarked: string;
    state: ProgramStoryState;
  };

  protected _executingLocation: ScriptLocation | null = null;

  protected _awaiting: ScriptLocation | null = null;

  protected _runtimeErrorsReported = 0;
  get runtimeErrorsReported() {
    return this._runtimeErrorsReported;
  }

  protected _runtimeState: RuntimeState = new RuntimeState();
  get runtimeState() {
    return this._runtimeState;
  }

  protected _announcedStop = false;

  protected _nextObjectVariableRef = 2000;

  protected _objectVariableRefMap = new Map<number, object>();

  protected _tableRecords = new WeakMap<object, string[]>();

  protected _startFrom?: {
    file: string;
    line: number;
  };
  get startFrom() {
    return this._startFrom;
  }

  protected _startBeat: "first" | "last" = "first";

  protected _previewFrom?: {
    file: string;
    line: number;
    address?: ProgramAddress;
  };
  get previewFrom() {
    return this._previewFrom;
  }

  protected _previewAddress?: ProgramAddress;
  get previewAddress() {
    return this._previewAddress;
  }

  protected _previewedAddress?: ProgramAddress;
  get previewedAddress() {
    return this._previewedAddress;
  }

  protected _simulateFlow?: string | null;
  get simulateFlow() {
    return this._simulateFlow;
  }
  set simulateFlow(value) {
    this._simulateFlow = value;
  }

  protected _playedMenus: { sources: string[]; taken: string }[] = [];

  protected _startAddress?: ProgramAddress | null;
  get startAddress() {
    return this._startAddress;
  }

  protected _lineBreakAddresses = new Set<number>();
  protected _functionBreakAddresses = new Set<number>();
  protected _breakAddresses = new Set<number>();
  protected _steppingInThroughEntry = false;
  protected _entryCode: { root: unknown; addresses: Set<number> } | null =
    null;

  protected entryCode(): Set<number> {
    const root = this.programStory.root;
    if (this._entryCode?.root !== root) {
      this._entryCode = { root, addresses: programEntryCode(root) };
    }
    return this._entryCode.addresses;
  }

  protected _executedLog: number[] = [];
  protected _beatLog: number[] = [];

  protected _dataWatches: {
    dataId: string;
    scope?: string;
    name: string;
    blockScope: Map<string, InkObject> | null;
    pointer: VariablePointerValue | null;
    pointerState: object | null;
    binding: VariableBinding | undefined;
    bindingName: string;
    last: unknown;
    written: boolean;
  }[] = [];

  protected _cellTags = new WeakMap<VariablePointerValue, string>();

  protected cellTag(cell: VariablePointerValue): string {
    let tag = this._cellTags.get(cell);
    if (tag === undefined) {
      tag = uuid(16);
      this._cellTags.set(cell, tag);
    }
    return tag;
  }

  protected _noteWrite: WriteWatch = (binding, name) => {
    for (const watch of this._dataWatches) {
      if (watch.binding === binding && watch.bindingName === name) {
        watch.written = true;
      }
    }
  };

  protected _simulation?: "none" | "simulating" | "success" | "fail";
  get simulation() {
    return this._simulation;
  }
  set simulation(value) {
    this._simulation = value;
  }

  protected _replaying = false;
  get replaying() {
    return this._replaying;
  }

  protected _routeErrors: { at: number; error: SimulationError }[] = [];

  protected _searchErrors?: SimulationError[];

  get routeErrors(): SimulationError[] {
    return this._searchErrors ?? this._routeErrors.map((e) => e.error);
  }

  searchErrors(): SimulationError[] {
    return lastSearchStats.errors.map(({ message, address }) => ({
      message,
      type: ErrorType.Error,
      location: this.getDocumentLocation(this.scriptLocationOf(address)),
    }));
  }

  protected _simulationFailure?: SimulationFailure;
  get simulationFailure() {
    return this._simulationFailure;
  }
  set simulationFailure(value) {
    this._simulationFailure = value;
  }

  reportsExecutedLines = true;

  protected _restarted = false;
  get restarted() {
    return this._restarted;
  }

  protected _state: GameState = "initial";
  get state() {
    return this._state;
  }

  protected _program: SparkProgram;
  get program() {
    return this._program;
  }

  protected _definesContextRevision?: string;
  protected _definesContextBuilds = 0;
  protected _definesContextBuilt = false;
  get definesContextBuilds() {
    return this._definesContextBuilds;
  }

  protected _destroyed = false;
  get destroyed() {
    return this._destroyed;
  }

  protected _paused = false;
  get paused() {
    return this._paused;
  }

  protected _plannedRoute: RoutePlan | null = null;
  get plannedRoute(): RoutePlan | null {
    return this._plannedRoute;
  }

  protected _previewRoute?: PreviewRoute;
  get previewRoute(): PreviewRoute | undefined {
    return this._previewRoute;
  }
  set previewRoute(value: PreviewRoute | undefined) {
    this._previewRoute = value;
  }

  protected _routePins: readonly RoutePin[] = [];
  protected _pinnedOptions?: {
    root: ProgramRoot;
    pins: readonly RoutePin[];
    value: PinnedOptions;
  };

  get routePins(): readonly RoutePin[] {
    return this._routePins;
  }
  setRoutePins(pins: readonly RoutePin[]) {
    this._routePins = pins;
  }

  get pinnedOptions(): PinnedOptions {
    const root = this._story.root;
    const held = this._pinnedOptions;
    if (held && held.root === root && held.pins === this._routePins) {
      return held.value;
    }
    const value = pinnedOptionsOf(this._routePins, (uri, line) =>
      root.optionAt(uri, line),
    );
    this._pinnedOptions = { root, pins: this._routePins, value };
    return value;
  }

  protected _plannedRouteChangeId?: number;

  protected _plannedRouteRoot?: ProgramRoot;

  protected _plannedRouteStepCursor: number = 0;

  protected _levelZeroWorks = new Map<string, LevelZeroWork>();

  protected _levelZeroRoot?: ProgramRoot;

  protected _levelZeroChangeId?: number;

  protected _startingValues: StartingValues = {};

  protected _scriptLineText?: (uri: string, line: number) => string | undefined;

  protected _plannedRouteStart?: string;

  protected _play = false;

  protected _startPlans = new Map<string, { plan: StartPlan; json: string }>();

  protected _startPlansRoot?: ProgramRoot | null;

  protected _plannedRouteStepMap: Map<string, number> | null = null;

  protected _checkpointStepCursors: (number | undefined)[] = [];

  protected _shownBeat?: Instructions;

  protected _checkpointShownBeats: (Instructions | undefined)[] = [];

  protected _checkpointDecisionsTaken: (number | undefined)[] = [];

  protected _routeSimulator: RouteSimulator | null = null;

  protected _routeTargetShows?: boolean;
  get routeTargetShows() {
    return this._routeTargetShows;
  }

  protected _checkpoints!: CheckpointStore;
  get checkpoints() {
    return this._checkpoints;
  }

  protected _version = "";
  protected _saveHistory = 16;
  protected _rewindBeats = 128;

  get programStory(): ProgramStory {
    return this._story;
  }

  constructor(
    options: { program: SparkProgram } & GameConfiguration &
      SystemConfiguration & {
        modules?: {
          [name in keyof T]: abstract new (...args: any) => T[name];
        };
      },
  ) {
    this._version = options.version ?? "";
    this._saveHistory = options.saveHistory ?? 16;
    this._rewindBeats = options.rewindBeats ?? 128;
    this._program = this.updateProgram(options.program);

    this._connection = new Connection({
      onReceive: (msg) => this.onReceive(msg),
    });

    this._restarted = options?.restarted ?? false;
    const modules = options?.modules;
    const previewing = options?.previewFrom ? true : undefined;
    this._state = previewing ? "previewing" : "initial";
    const startFrom = options?.previewFrom ??
      options?.startFrom ?? {
        file: options.program.uri,
        line: 0,
      };
    this.setStartFrom(startFrom, previewing ? "last" : "first");

    this._executingAddress = null;
    this._executingLocation = null;

    this.updateBreakpointsMap(options?.breakpoints ?? []);
    this._startingValues = options?.startingValues ?? {};
    this._play = options?.play ?? false;
    this.updateFunctionBreakpointsMap(options?.functionBreakpoints ?? []);
    this.updateDataBreakpointsMap(options?.dataBreakpoints ?? []);

    if (options?.executionStepLimit != null) {
      this._executionStepLimit = options.executionStepLimit;
    }
    this._executionStepsRemaining = this._executionStepLimit;

    this._checkpoints = new CheckpointStore(
      {
        captureImage: (keyframe) => this._story.captureBeat(keyframe),
        saveWithoutStory: () => this.buildSave(true, false),
        storyOfImage: (image) =>
          this._story.saveOfImage(image as ProgramImage, this._version),
        durableExecuted: (executed) => this.durableExecuted(executed),
        snapshotRuntime: () => this._runtimeState.snapshotFull(),
        drainRuntime: () => this._runtimeState.drainDeltas(),
      },
      { baseInterval: options?.checkpointBaseInterval ?? 50 },
    );

    this._context = {
      system: {
        previewing,
        transitions: true,
        checkpoint: () => this.checkpoint(),
        uuid: () => uuid(),
        supports: (module: string) => this.supports(module),
        now:
          options?.now ??
          (() => {
            return 0;
          }),
        setTimeout:
          options?.setTimeout ??
          (() => {
            throw new Error("setTimeout not configured");
          }),
        log: options?.log,
        fetch: options?.fetch,
        resolve: options?.resolve,
        requestFrame: options?.requestFrame,
        composeBeats: options?.composeBeats,
      },
    };

    this.assignContextChannels();

    const allModules = {
      ...modules,
      ...DEFAULT_MODULES,
      ...modules,
    };
    const moduleNames = Object.keys(allModules);
    for (const key of moduleNames) {
      const name = key as keyof typeof allModules;
      const ctr = allModules[name];
      if (ctr) {
        this._modules[name] = new ctr(this);
      }
    }
    for (const key of moduleNames) {
      const name = key as keyof typeof allModules;
      const module = this._modules[name];
      if (module) {
        const moduleStored = module.getStored();
        if (moduleStored) {
          this._stored.push(...moduleStored);
        }
      }
    }
    this._moduleNames = moduleNames;

    for (const moduleName of this._moduleNames) {
      this._modules[moduleName]?.onInit();
    }

    const system = this._context.system;

    if (system.requestFrame) {
      this._clock = new Clock(
        {
          get currentTime() {
            return system.now() / 1000;
          },
        },
        (callback: () => void) => system.requestFrame?.(callback) ?? 0,
      );
    }
  }

  updateProgram(program: SparkProgram) {
    this.cancelPreview();
    this._awaiting = null;
    const before = this._program;
    this._program = program;
    const chunks = program.chunks;
    if (!chunks) {
      throw new Error(
        "Program must be successfully compiled before it can be run",
      );
    }
    this._scripts = Object.keys(this._program.scripts);
    const previous = this.programStory;
    const engine = new ProgramStory(chunks, {
      images: previous?.images,
      history: previous?.history,
      saveHistory: this._saveHistory,
      rewindBeats: this._rewindBeats,
      declarations: this.carriedDeclarations(previous, before, program),
    });
    engine.keepBeatImages = true;
    if (!engine.declarationsCarried) {
      this._declarationsRun += 1;
    } else if (previous?.root && engine.root) {
      carryStoreListing(
        previous.root,
        engine.root,
        before?.storeTypes,
        program.storeTypes,
      );
    }
    this.noteChangedFlows(before, program);
    this._story = engine;
    this._positions = storyPositions(this._story, this._program);
    this.setupStory(this._story);
    this.restoreReactiveTracking();
    this.resolveBreakpoints();
    if (this._moduleNames && this._moduleNames.length > 0) {
      this.assignContextChannels();
      for (const moduleName of this._moduleNames) {
        this._modules[moduleName]?.onProgramUpdate();
      }
      this._previewedAddress = undefined;
    }
    return this._program;
  }

  protected beginChangesSince(): void {
    const previewing = this._context.system.previewing;
    this._changesSince = {
      program: this._program,
      beat:
        typeof previewing === "number" ? this.beatStart(previewing) : undefined,
      route: this.routeOfProgram(),
      targetWrote: this._routeTargetWrote,
      targetVisits: this._routeTargetVisits,
      unrepeatable: this._routeUnrepeatable,
      scenes: new Set(),
      unmeasured: false,
    };
  }

  protected watchTargetWrites(): void {
    const vs = this._story.variablesState;
    if (this._targetWatch || vs.trackWrites) {
      return;
    }
    this._targetWatch = {
      changes: vs.takeReactiveChanges(),
      unmarked: this.unmarkedState(),
      state: this._story.state,
    };
    this._story.state.visitLog = [];
    vs.TakeWrites();
    vs.trackWrites = true;
  }

  protected unmarkedState(): string {
    const state = this._story.state;
    return `${state.storySeed}:${state.previousRandom}`;
  }

  protected endTargetWatch(): void {
    const prior = this._targetWatch;
    if (!prior) {
      return;
    }
    this._targetWatch = undefined;
    const vs = this._story.variablesState;
    const changes = vs.takeReactiveChanges();
    const writes = vs.TakeWrites();
    vs.trackWrites = false;
    const log = prior.state === this._story.state ? prior.state.visitLog : null;
    prior.state.visitLog = null;
    this._routeTargetVisits = log ? log.join(",") : undefined;
    this._routeTargetWrote = !log
      ? undefined
      : changes.globals.size > 0 ||
        changes.tables.size > 0 ||
        writes.tables.size > 0 ||
        writes.cells.size > 0 ||
        this.unmarkedState() !== prior.unmarked;
    vs.restoreReactiveChanges(prior.changes);
    vs.restoreReactiveChanges(changes);
  }

  protected routeOfProgram(): RoutePlan | undefined {
    const route = this._plannedRoute;
    return route &&
      this._plannedRouteRoot === this._story.root &&
      this._simulation === "success"
      ? route
      : undefined;
  }

  protected static sameRouteToBeat(before: RoutePlan, route: RoutePlan): boolean {
    const a = before.steps;
    const b = route.steps;
    if (before.from !== route.from || a.length !== b.length || b.length === 0) {
      return false;
    }
    for (let i = 0; i < b.length - 1; i += 1) {
      if (a[i]!.address !== b[i]!.address || a[i]!.decision !== b[i]!.decision) {
        return false;
      }
    }
    return true;
  }

  protected beatStart(
    address: ProgramAddress,
  ): { uri: string; line: number } | undefined {
    const at = this.locator.locationOf(address);
    return at ? { uri: at.uri, line: at.startLine } : undefined;
  }

  protected noteChangedFlows(
    before: SparkProgram | undefined,
    program: SparkProgram,
  ): void {
    const since = this._changesSince;
    if (!since) {
      return;
    }
    const changes = program.changes;
    const chunks = changes?.chunks;
    if (
      !before ||
      !chunks ||
      changes.since === undefined ||
      changes.since !== before.changes?.id ||
      !program.chunks ||
      !before.chunks
    ) {
      since.unmeasured = true;
      return;
    }
    const sceneIn = (root: ProgramRoot, id: number) => {
      const at = root.position(id);
      return at ? (root.sceneOf(at.sequence) ?? "") : "";
    };
    for (const id of chunks.emitted) {
      since.scenes.add(sceneIn(program.chunks, id));
    }
    for (const id of chunks.dropped) {
      since.scenes.add(sceneIn(before.chunks, id));
    }
  }

  protected settleSceneMap(cursor: ProgramAddress | null | undefined): void {
    const before = this._sceneProgram;
    if (before === this._program) {
      return;
    }
    this._sceneProgram = this._program;
    if (before && this.sceneMapChanged(before, cursor)) {
      this._sceneTracker.reset();
      this.module.assets?.onSceneMapChanged();
    }
  }

  protected sceneMapChanged(
    before: SparkProgram,
    cursor: ProgramAddress | null | undefined,
  ): boolean {
    const a = before.sceneAssets ?? {};
    const b = this._program.sceneAssets ?? {};
    if (a === b) {
      return false;
    }
    const same = (x: readonly string[] = [], y: readonly string[] = []) =>
      x === y || (x.length === y.length && x.every((v, i) => v === y[i]));
    const flows = Object.keys(b);
    if (flows.length !== Object.keys(a).length) {
      return true;
    }
    const cursorFlow = cursor != null ? this.sceneOf(cursor) : null;
    for (const flow of flows) {
      const x = a[flow];
      const y = b[flow];
      if (!x || !y) {
        return true;
      }
      if (x === y) {
        continue;
      }
      if (
        x.kind !== y.kind ||
        !same(x.successors, y.successors) ||
        !same(x.calls, y.calls) ||
        Boolean(x.dynamic) !== Boolean(y.dynamic) ||
        !same(x.dynamicBases, y.dynamicBases) ||
        x.beats.length !== y.beats.length
      ) {
        return true;
      }
      const skip =
        flow === cursorFlow && cursor != null
          ? beatIndexIn(y.beats, this.locator, cursor)
          : -1;
      for (let i = 0; i < y.beats.length; i += 1) {
        const p = x.beats[i]!;
        const q = y.beats[i]!;
        if (i === skip || p === q) {
          continue;
        }
        if (
          !same(p.image, q.image) ||
          !same(p.audio, q.audio) ||
          !same(p.layouts, q.layouts) ||
          !same(p.loads, q.loads)
        ) {
          return true;
        }
      }
    }
    return false;
  }

  protected assignContextChannels() {
    const assignChannel = (src?: { [type: string]: any }) => {
      if (src) {
        for (const [type, structs] of Object.entries(src)) {
          this._context[type] = structs;
        }
      }
    };
    this.assignRuntimeDefines();
    assignChannel(this._program.assets);
    if (this._program.layouts) {
      this._context["layout"] = this._program.layouts;
    }
    if (this._program.screens) {
      this._context["screen"] = this._program.screens;
    }
    if (this._program.components) {
      this._context["component"] = this._program.components;
    }
    if (this._program.styles) {
      this._context["style"] = this._program.styles;
    }
  }

  protected assignRuntimeDefines() {
    const globals = this._story?.state?.variablesState?.["_globalVariables"];
    if (!globals || globals.size === 0) {
      return;
    }
    const revision = this._program?.contextRevision;
    if (revision !== undefined && revision === this._definesContextRevision) {
      return;
    }
    if (this._story.declarationsCarried && this._definesContextBuilt) {
      this._definesContextRevision = revision;
      return;
    }
    const runtime = buildDefinesContext(this._story);
    if (!runtime["synth"] && !runtime["character"] && !runtime["color"]) {
      console.warn(
        "spark-engine: the runtime story carries no builtin defines — was the program compiled without `seedBuiltinsIntoStory`? Builtin types (colors, synths, typewriters, …) will be missing from the game context.",
      );
    }
    for (const [type, structs] of Object.entries(runtime)) {
      this._context[type] = structs;
    }
    this._definesContextRevision = revision;
    this._definesContextBuilds++;
    this._definesContextBuilt = true;
  }

  protected carriedDeclarations(
    previous: ProgramStory | undefined,
    before: SparkProgram | undefined,
    program: SparkProgram,
  ): CarriedDeclarations | undefined {
    const changes = program.changes;
    const root = program.chunks;
    if (
      !previous ||
      !before ||
      !root ||
      before.chunks !== previous.root ||
      !changes?.chunks ||
      changes.chunks.initializers ||
      changes.since === undefined ||
      changes.since !== before.changes?.id
    ) {
      return undefined;
    }
    return previous.declarationsFor(root) ?? undefined;
  }

  setupStory(story: ProgramStory) {
    story.collapseWhitespace = false;
    story.processEscapes = false;
    story.onError = (message, type, _source, raised) => {
      this.Error(
        raised?.message ?? message,
        type === InkErrorType.Warning ? ErrorType.Warning : ErrorType.Error,
        this.scriptLocationOf(raised?.address ?? this._positions.previous()) ??
          this._executingLocation,
      );
    };
    story.onExecute = null;
    story.onMakeChoice = (choice) => {
      this._runtimeState.recordChoice(story, choice);
      if (this._simulation !== "simulating") {
        this._playedMenus.push({
          sources: story.currentChoices.map((c) => c.sourcePath),
          taken: choice.sourcePath,
        });
      }
    };
    story.onEvaluateCondition = (value) => {
      this._runtimeState.recordCondition(value);
    };
  }

  simulate() {
    this._simulation = "simulating";
    this._simulationFailure = undefined;
    if (this._startAddress != null) {
      const to = this._startAddress;
      const from = this.routeStartOf(to);
      const budget = {
        callerResetsStory: true,
        startPlans: this.startPlans,
        pins: this.pinnedOptions,
      };
      let route;
      if (this.routesFromStartFirst(to)) {
        route = Game.planRouteFromStart(this._story, this._program, to, budget);
        if (!route && lastSearchStats.endReason === "exhausted") {
          route = Game.planRouteInFlow(
            this._story,
            this._program,
            from,
            to,
            budget,
          );
        }
      } else {
        route = Game.planRoute(this._story, this._program, from, to, budget);
      }
      if (route) {
        this.simulateRoute(route, 0);
      } else {
        this._simulationFailure = this.describeFailedRouteSearch(to);
        this._searchErrors = this.searchErrors();
      }
    } else {
      this._simulationFailure = this.describeFailedRouteSearch(
        this._startAddress,
      );
    }
  }

  describeFailedRouteSearch(
    to: ProgramAddress | null | undefined,
  ): SimulationFailure {
    if (to == null || this._positions.locator.locationOf(to) === undefined) {
      return "unroutable";
    }
    if (lastSearchStats.endReason === "exhausted") {
      return "exhausted";
    }
    if (lastSearchStats.endReason === "errored") {
      return "errored";
    }
    return "timeout";
  }

  supports(name: string): boolean {
    return Boolean(this._modules[name]);
  }

  isFunctionFlow(flow: string): boolean {
    const kind = this._program?.sceneAssets?.[flow]?.kind;
    if (kind) {
      return kind === "function";
    }
    return (
      Boolean(this._program?.functionLocations?.[flow]) ||
      flow.startsWith("__")
    );
  }

  sceneOf(address: ProgramAddress | null | undefined): string | null {
    return address == null
      ? null
      : (this._positions.locator.sceneAt(address) ?? null);
  }

  routeStartOf(address: ProgramAddress): string {
    return this.sceneOf(address) ?? START_FLOW_NAME;
  }

  routesFromStartFirst(address: ProgramAddress): boolean {
    const scene = this.sceneOf(address);
    return (
      scene !== null &&
      this._story.takesParameters(scene) &&
      !planSetsParameters(this.startPlan(scene))
    );
  }

  get startingValues(): StartingValues {
    return this._startingValues;
  }

  setStartingValues(values: StartingValues): boolean {
    if (JSON.stringify(values) === JSON.stringify(this._startingValues)) {
      return false;
    }
    this._startingValues = values;
    this._startPlans.clear();
    return true;
  }

  set scriptLineText(lineText: (uri: string, line: number) => string | undefined) {
    this._scriptLineText = lineText;
  }

  protected startingValueSource(): StartingValueSource {
    const uris = Object.keys(this._program.scripts ?? {});
    const flows: { name: string; uri: string; line: number }[] = [];
    for (const locations of [
      this._program.sceneLocations,
      this._program.branchLocations,
      this._program.labelLocations,
    ]) {
      for (const [name, location] of Object.entries(locations ?? {})) {
        const uri = uris[location[0]];
        if (uri !== undefined) {
          flows.push({ name, uri, line: location[1] });
        }
      }
    }
    return {
      uris,
      flows,
      lineText: (uri, line) => this._scriptLineText?.(uri, line),
      storeTypes: this._program.storeTypes,
    };
  }

  startPlan(from: string): StartPlan {
    return this.keptStartPlan(from).plan;
  }

  protected keptStartPlan(from: string): { plan: StartPlan; json: string } {
    const root = this._story.root;
    if (this._startPlansRoot !== root) {
      this._startPlans.clear();
      this._startPlansRoot = root;
    }
    let kept = this._startPlans.get(from);
    if (!kept) {
      const plan = startPlanOf(
        this._story,
        from,
        this.startingValueSource(),
        ownEntry(this._startingValues, from),
      );
      kept = { plan, json: startPlanKey(plan) };
      this._startPlans.set(from, kept);
    }
    return kept;
  }

  readonly startPlans = (from: string): StartPlan => this.startPlan(from);

  startingValueListing(from: string): StartingValueListing {
    return startingValueListing(this._story, from, this.startingValueSource());
  }

  protected callStackScenes(): string[] {
    const scenes: string[] = [];
    for (const address of this._positions.stack()) {
      const scene = this.sceneOf(address);
      if (scene) {
        scenes.push(scene);
      }
    }
    return scenes;
  }

  observeScene(address: ProgramAddress | null | undefined): void {
    if (this._destroyed || this._simulation === "simulating") {
      return;
    }
    this.settleSceneMap(address);
    const scene = this.sceneOf(address);
    if (
      scene === this._sceneTracker.current ||
      (scene && this.isFunctionFlow(scene))
    ) {
      return;
    }
    const transition = this._sceneTracker.observe(
      scene,
      this.callStackScenes(),
    );
    if (transition) {
      for (const k of this._moduleNames) {
        this._modules[k]?.onEnterScene(
          transition.scene,
          transition.previous,
          transition.stack,
        );
      }
    }
  }

  async connect(send: (message: Message, transfer?: ArrayBuffer[]) => void) {
    this.cancelPreview();
    this._shownChoices = [];
    this.beginChangesSince();
    this._connection.connectOutput(send);
    const epoch = this._connection.beginEpoch();
    const previewing = this._context.system.previewing;
    this.observeScene(
      typeof previewing === "number" ? previewing : this._positions.current(),
    );
    await Promise.all(
      this._moduleNames.map((moduleName) =>
        this._modules[moduleName]?.onConnected(),
      ),
    );
    if (this._connection.epoch !== epoch) {
      return;
    }
    await this.restore();
    this.module.ui.markRestored();
  }

  async redisplay(send: (message: Message, transfer?: ArrayBuffer[]) => void) {
    this.cancelPreview();
    this.beginChangesSince();
    this._connection.connectOutput(send);
    const epoch = this._connection.beginEpoch();
    const previewing = this._context.system.previewing;
    this.observeScene(
      typeof previewing === "number" ? previewing : this._positions.current(),
    );
    const shown = this.module.ui.standing?.pictures ?? [];
    await Promise.all([
      this.module.ui.onRedisplay(),
      this.module.assets.onRedisplay(shown),
    ]);
    if (this._connection.epoch !== epoch) {
      return;
    }
    await Promise.all([
      this.module.ui.onRestore(),
      this.module.assets.onRestore(),
    ]);
    this.module.ui.markRestored();
  }

  beatOnlyRefusal(cursor: ProgramAddress | null | undefined): string | null {
    const ui = this.module.ui;
    const refused = ui.beatOnlyRefusal();
    if (refused) {
      return refused;
    }
    const since = this._changesSince;
    const beat = cursor != null ? this.beatStart(cursor) : undefined;
    const route = this.routeOfProgram();
    if (
      !since ||
      since.program !== ui.standing?.program ||
      !beat ||
      !since.beat ||
      since.beat.uri !== beat.uri ||
      since.beat.line !== beat.line ||
      !since.route ||
      !route ||
      !Game.sameRouteToBeat(since.route, route)
    ) {
      return "checkpoint";
    }
    if (
      since.unrepeatable !== false ||
      this._routeUnrepeatable !== false ||
      since.targetWrote !== false ||
      this._routeTargetWrote !== false ||
      since.targetVisits === undefined ||
      since.targetVisits !== this._routeTargetVisits
    ) {
      return "checkpoint";
    }
    const cursorScene = this.sceneOf(cursor) ?? "";
    if (
      since.unmeasured ||
      [...since.scenes].some((scene) => scene !== cursorScene)
    ) {
      return "flows";
    }
    const before = this._sceneProgram;
    if (!before || this.sceneMapChanged(before, cursor)) {
      return "scenes";
    }
    return null;
  }

  setStartFrom(
    startFrom: { file: string; line: number; address?: ProgramAddress },
    beat: "first" | "last" = "first",
  ) {
    this._startFrom = startFrom;
    this._startBeat = beat;
    this._startAddress =
      startFrom.address ??
      this.locator.addressAt(startFrom.file, startFrom.line, { beat }) ??
      TOP_LEVEL_START;
    const trueLocation = this.locator.locationOf(this._startAddress);
    if (trueLocation) {
      this._startFrom = { file: trueLocation.uri, line: trueLocation.startLine };
      return this._startFrom;
    }
    return null;
  }

  possibleBreakpointLines(search: {
    uri: string;
    range: { start: { line: number }; end: { line: number } };
  }): number[] {
    return programBreakpointLines(this._story.root, search);
  }

  setBreakpoints(breakpoints: { file: string; line: number }[]) {
    return this.updateBreakpointsMap(breakpoints);
  }

  setFunctionBreakpoints(functionBreakpoints: { name: string }[]) {
    return this.updateFunctionBreakpointsMap(functionBreakpoints);
  }

  setDataBreakpoints(dataBreakpoints: { dataId: string }[]) {
    return this.updateDataBreakpointsMap(dataBreakpoints);
  }

  protected _requestedBreakpoints: {
    lines: { file: string; line: number }[];
    functions: { name: string }[];
    data: { dataId: string }[];
  } = { lines: [], functions: [], data: [] };

  protected resolveBreakpoints() {
    this.updateBreakpointsMap(this._requestedBreakpoints.lines);
    this.updateFunctionBreakpointsMap(this._requestedBreakpoints.functions);
    this.updateDataBreakpointsMap(this._requestedBreakpoints.data);
  }

  protected joinBreakAddresses() {
    this._breakAddresses = new Set([
      ...this._lineBreakAddresses,
      ...this._functionBreakAddresses,
    ]);
  }

  protected locateWatch(
    program: ProgramStory,
    watch: (typeof this._dataWatches)[number],
  ) {
    const variablesState = program.state.variablesState;
    watch.written = false;
    if (watch.scope === undefined) {
      watch.binding = null;
      watch.bindingName = watch.name;
      watch.last =
        variablesState.GetGlobalVariableValue(watch.name) ?? undefined;
      return;
    }
    const callStack = program.state.callStack;
    const frames =
      program.debugFrames(callStack.currentThread.threadIndex) ?? [];
    const named = frames.filter((frame) => frame.scope === watch.scope);
    const held = watch.blockScope;
    let scope: Map<string, InkObject> | null = null;
    if (
      held &&
      held.has(watch.name) &&
      named.some((frame) => frame.element.temporaryScopes.includes(held))
    ) {
      scope = held;
    } else {
      const scopes = named.at(-1)?.element.temporaryScopes ?? [];
      for (let s = scopes.length - 1; s >= 0 && !scope; s -= 1) {
        if (scopes[s]!.has(watch.name)) {
          scope = scopes[s]!;
        }
      }
    }
    watch.blockScope = scope;
    if (scope) {
      const bound = scope.get(watch.name);
      watch.pointer = bound instanceof VariablePointerValue ? bound : null;
      watch.pointerState = variablesState;
    } else if (!watch.pointer || watch.pointerState !== variablesState) {
      watch.pointer = null;
      watch.binding = undefined;
      watch.bindingName = watch.name;
      watch.last = undefined;
      return;
    }
    const { binding, name } = scope
      ? variablesState.BindingOf(scope, watch.name)
      : variablesState.BindingThrough(watch.pointer!);
    watch.binding = binding;
    watch.bindingName = name;
    watch.last = this.valueAtBinding(program, binding, name);
  }

  protected valueAtBinding(
    program: ProgramStory,
    binding: VariableBinding,
    name: string,
  ): unknown {
    if (binding === null) {
      return (
        program.state.variablesState.GetGlobalVariableValue(name) ?? undefined
      );
    }
    if (binding instanceof VariablePointerValue) {
      return binding.closedValue ?? undefined;
    }
    return binding.get(name);
  }

  protected refreshDataWatches() {
    const program = this.programStory;
    for (const watch of this._dataWatches) {
      this.locateWatch(program, watch);
    }
  }

  protected dataWatchesChanged(): boolean {
    const program = this.programStory;
    let changed = false;
    for (const watch of this._dataWatches) {
      if (
        watch.written &&
        watch.binding !== undefined &&
        this.valueAtBinding(program, watch.binding, watch.bindingName) !==
          watch.last
      ) {
        changed = true;
      }
      this.locateWatch(program, watch);
    }
    return changed;
  }

  protected programBreakpoint(
    address: number | undefined,
    message: string,
  ): Breakpoint {
    const location =
      address === undefined ? undefined : this.locator.locationOf(address);
    if (!location) {
      return { verified: false, reason: "failed", message };
    }
    return {
      verified: true,
      location: {
        uri: location.uri,
        range: {
          start: { line: location.startLine, character: 0 },
          end: { line: location.startLine, character: 0 },
        },
      },
    };
  }

  protected firstInSource(addresses: number[]): number | undefined {
    let first: number | undefined;
    let key: [number, number, number] | undefined;
    for (const address of addresses) {
      const location = this.locator.locationOf(address);
      if (!location) {
        continue;
      }
      const at: [number, number, number] = [
        this._scripts.indexOf(location.uri),
        location.startLine,
        location.startColumn,
      ];
      if (
        !key ||
        at[0] < key[0] ||
        (at[0] === key[0] &&
          (at[1] < key[1] || (at[1] === key[1] && at[2] < key[2])))
      ) {
        first = address;
        key = at;
      }
    }
    return first;
  }

  protected updateBreakpointsMap(
    breakpoints: { file: string; line: number }[],
  ) {
    this._requestedBreakpoints.lines = breakpoints;
    const program = this.programStory;
    this._lineBreakAddresses = new Set();
    const actual = breakpoints.map((b) => {
      const address = program.root.addressAt(b.file, b.line, {
        functions: true,
      });
      const at =
        address === undefined
          ? undefined
          : program.root.position(chunkOfAddress(address));
      if (at && !runsAfterReset(program.root, at.sequence)) {
        return this.programBreakpoint(
          undefined,
          "A declaration runs before the story starts",
        );
      }
      if (address !== undefined) {
        this._lineBreakAddresses.add(address);
      }
      return this.programBreakpoint(
        address,
        "No instruction found at the breakpoint",
      );
    });
    this.joinBreakAddresses();
    return actual;
  }

  protected updateFunctionBreakpointsMap(
    functionBreakpoints: { name: string }[],
  ) {
    this._requestedBreakpoints.functions = functionBreakpoints;
    const program = this.programStory;
    this._functionBreakAddresses = new Set();
    const actual = functionBreakpoints.map((b) => {
      const declared = this._program.functionLocations?.[b.name];
      const address = programFunctionAddress(
        program.root,
        b.name,
        declared && this._scripts[declared[0]] !== undefined
          ? {
              uri: this._scripts[declared[0]]!,
              line: declared[1],
              column: declared[2],
            }
          : undefined,
      );
      if (address !== undefined) {
        this._functionBreakAddresses.add(address);
      }
      return this.programBreakpoint(
        address,
        "No instruction found at the breakpoint",
      );
    });
    this.joinBreakAddresses();
    return actual;
  }

  protected updateDataBreakpointsMap(dataBreakpoints: { dataId: string }[]) {
    this._requestedBreakpoints.data = dataBreakpoints;
    const program = this.programStory;
    const watches: typeof this._dataWatches = [];
    const actual = dataBreakpoints.map((b) => {
      const dot = b.dataId.lastIndexOf(".");
      const scope = dot < 0 ? undefined : b.dataId.slice(0, dot);
      const name = dot < 0 ? b.dataId : b.dataId.slice(dot + 1);
      const { assignments, declarations } = programAssignmentAddresses(
        program.root,
        b.dataId,
        (symbol, isFunction) =>
          isFunction
            ? program.root.labelOf(symbol)
            : program.flowName(symbol),
      );
      const exists =
        scope === undefined
          ? program.state.variablesState.globalEntries.has(name)
          : assignments.length > 0 || declarations.length > 0;
      if (!exists) {
        return this.programBreakpoint(
          undefined,
          "No variable found at the breakpoint",
        );
      }
      watches.push({
        dataId: b.dataId,
        scope,
        name,
        blockScope: null,
        pointer: null,
        pointerState: null,
        binding: undefined,
        bindingName: name,
        last: undefined,
        written: false,
      });
      const first =
        scope === undefined
          ? (this.firstInSource(declarations) ??
            this.firstInSource(assignments))
          : (this.firstInSource(assignments) ??
            this.firstInSource(declarations));
      return first === undefined
        ? { verified: true }
        : this.programBreakpoint(first, "No variable found at the breakpoint");
    });
    this._dataWatches = watches;
    this.refreshDataWatches();
    this.joinBreakAddresses();
    return actual;
  }

  static planRoute(
    story: ProgramStory,
    program: SparkProgram,
    from: string,
    to: ProgramAddress,
    budget?: Pick<
      SearchOptions,
      | "maxSteps"
      | "maxNodes"
      | "searchTimeout"
      | "callerResetsStory"
      | "resumeFrom"
      | "levelZeroStore"
      | "pins"
    > & RouteStarts,
  ) {
    const route = Game.planRouteInFlow(story, program, from, to, budget);
    if (
      route ||
      budget?.resumeFrom ||
      lastSearchStats.endReason !== "exhausted"
    ) {
      return route;
    }
    return Game.planRouteFromStart(story, program, to, budget);
  }

  static planRouteInFlow(
    story: ProgramStory,
    program: SparkProgram,
    from: string,
    to: ProgramAddress,
    budget?: Pick<
      SearchOptions,
      | "maxSteps"
      | "maxNodes"
      | "searchTimeout"
      | "callerResetsStory"
      | "resumeFrom"
      | "levelZeroStore"
      | "pins"
    > & RouteStarts,
  ) {
    const { startPlans, ...rest } = budget ?? {};
    return planRoute(story, from, to, {
      ...rest,
      start: startPlans?.(from),
      functions: Object.keys(program.functionLocations || {}),
      stayWithinKnot: true,
    });
  }

  static planRouteFromStart(
    story: ProgramStory,
    program: SparkProgram,
    to: ProgramAddress,
    budget?: Pick<
      SearchOptions,
      | "maxSteps"
      | "maxNodes"
      | "searchTimeout"
      | "callerResetsStory"
      | "resumeFrom"
      | "levelZeroStore"
      | "pins"
    > & RouteStarts,
  ) {
    const { startPlans, ...rest } = budget ?? {};
    return planRoute(story, START_FLOW_NAME, to, {
      ...rest,
      start: startPlans?.(START_FLOW_NAME),
      functions: Object.keys(program.functionLocations || {}),
      stayWithinKnot: false,
    });
  }

  getCheckpoint(
    seq: string,
    expected?: {
      address?: ProgramAddress;
      index?: number;
      maxCheckpoint?: number;
    },
  ) {
    const index = this.stepCheckpoint(seq, expected);
    return index === null ? null : this._checkpoints.getJson(index);
  }

  protected stepCheckpoint(
    seq: string,
    expected?: {
      address?: ProgramAddress;
      index?: number;
      maxCheckpoint?: number;
    },
  ): number | null {
    if (this._plannedRoute) {
      const steps = this._plannedRoute.steps;
      let stepIndex: number | undefined;
      if (expected?.index != null) {
        stepIndex =
          steps[expected.index]?.seq === seq ? expected.index : undefined;
      } else {
        if (!this._plannedRouteStepMap) {
          this._plannedRouteStepMap = new Map();
          for (let i = 0; i < steps.length; i++) {
            this._plannedRouteStepMap.set(steps[i]!.seq, i);
          }
        }
        stepIndex = this._plannedRouteStepMap.get(seq);
      }
      if (stepIndex != null) {
        const step = this._plannedRoute.steps[stepIndex];
        if (step) {
          if (expected?.address != null && step.address !== expected.address) {
            return null;
          }
          if (step.checkpoint != null) {
            if (
              expected?.maxCheckpoint != null &&
              step.checkpoint > expected.maxCheckpoint
            ) {
              return null;
            }
            const image = this._checkpoints.imageOf(step.checkpoint);
            return image !== undefined && this.writesImage(image)
              ? step.checkpoint
              : null;
          }
        }
      }
    }
    return null;
  }

  protected writesImage(image: unknown): boolean {
    const taken = image as ProgramImage;
    return this._story.canRestore(taken.afterChoice?.menu ?? taken);
  }

  protected simulateRoute(
    route: RoutePlan,
    fromStep = 0,
    fromCheckpointOverride?: number,
  ): void {
    this._simulationFailure = undefined;
    this._searchErrors = undefined;
    const startStep = route.steps[fromStep];
    const fromCheckpoint = fromCheckpointOverride ?? startStep?.checkpoint ?? -1;
    const fromDecision =
      this._checkpointDecisionsTaken[fromCheckpoint] ?? startStep?.decision ?? 0;
    this._checkpoints.truncate(fromCheckpoint + 1);
    this._checkpointStepCursors.length = fromCheckpoint + 1;
    this._checkpointShownBeats.length = fromCheckpoint + 1;
    this._checkpointDecisionsTaken.length = fromCheckpoint + 1;
    this._routeTargetShows = undefined;
    this._routeErrors = this._routeErrors.filter(
      (e) => e.at <= fromCheckpoint,
    );
    this._plannedRoute = route;
    this._plannedRouteChangeId = this._program.changes?.id;
    this._plannedRouteRoot = this._story.root;
    this._plannedRouteStart = this.keptStartPlan(route.from).json;
    this._simulateFlow = route.from;
    this._startAddress = route.to;
    this._routeSimulator = buildRouteSimulator(route.decisions, fromDecision);
    this._story.simulator = this._routeSimulator;
    this._plannedRouteStepMap = null;
    this._plannedRouteStepCursor = fromStep;
    this._routeTargetWrote = undefined;
    this._routeTargetVisits = undefined;
    this._routeUnrepeatable = undefined;
    const drawn = storyDraws.count;
    const read = ambientReads.count;

    const previewing = this._context.system.previewing;
    this._context.system.previewing = undefined;
    this._replaying = true;
    for (const k of this._moduleNames) {
      this._modules[k]?.onReplay();
    }
    let unrepeatable: boolean | undefined;
    try {
      this.replayRoute(route, fromCheckpoint);
      unrepeatable = storyDraws.count !== drawn || ambientReads.count !== read;
      this.noteRouteTarget();
    } finally {
      if (this._targetWatch) {
        this.endTargetWatch();
        this._routeTargetWrote = undefined;
        this._routeTargetVisits = undefined;
      }
      this._routeUnrepeatable =
        unrepeatable ??
        (storyDraws.count !== drawn || ambientReads.count !== read);
      this._replaying = false;
      this._context.system.previewing = previewing;
      for (const k of this._moduleNames) {
        this._modules[k]?.onReplayEnd();
      }
    }
  }

  protected noteRouteTarget(): void {
    if (this._simulation !== "success") {
      return;
    }
    if (this.module.interpreter.hasQueuedBeats) {
      this._routeTargetShows = true;
      return;
    }
    const last = this._checkpoints.length - 1;
    const shows = showsBeatAhead(this._story);
    this.restoreCheckpoint(last);
    if (shows || !this._shownBeat) {
      this._routeTargetShows = shows;
      return;
    }
    this.module.interpreter.requeue({ ...this._shownBeat, hold: true });
    const cursor = this._checkpointStepCursors[last];
    const decisionsTaken = this._checkpointDecisionsTaken[last];
    this._checkpoints.truncate(last);
    this.checkpoint();
    this._checkpointStepCursors[last] = cursor;
    this._checkpointShownBeats[last] = this._shownBeat;
    this._checkpointDecisionsTaken[last] = decisionsTaken;
    this._routeTargetShows = true;
  }

  jumpShowsBeat(address: ProgramAddress): boolean {
    this.jumpTo(address, true);
    return showsBeatAhead(this._story);
  }

  protected replayRoute(route: RoutePlan, startCheckpoint: number) {
    const resumed =
      startCheckpoint >= 0 && this.restoreCheckpoint(startCheckpoint);
    this._shownBeat = resumed
      ? this._checkpointShownBeats[startCheckpoint]
      : undefined;
    if (!resumed && startCheckpoint >= 0) {
      this._checkpoints.truncate(0);
      this._checkpointStepCursors.length = 0;
      this._checkpointShownBeats.length = 0;
      this._checkpointDecisionsTaken.length = 0;
      this._plannedRouteStepCursor = 0;
      this._routeErrors = [];
      this._routeSimulator = buildRouteSimulator(route.decisions);
      this._story.simulator = this._routeSimulator;
    }
    if (!resumed) {
      for (const k of this._moduleNames) {
        this._modules[k]?.load({});
      }
      this._runtimeState = new RuntimeState();
      this.jumpToFlow(route.from);
    }

    this._simulation = "simulating";
    this._context.system.simulating = route.from;

    this._executingAddress = null;
    this._executingLocation = null;

    if (this._plannedRouteStepCursor >= route.steps.length - 1) {
      this.watchTargetWrites();
    }
    this.continue(true);

    if (this._simulation === "simulating") {
      this._simulation = "fail";
      this._simulationFailure = "diverged";
    }

    this._story.simulator = null;
    this._routeSimulator = null;
  }

  protected plannedRouteStartsAs(from: string): boolean {
    return (
      this._plannedRoute?.from === from &&
      this.keptStartPlan(from).json === this._plannedRouteStart
    );
  }

  routeResumption(from: string, to: ProgramAddress): RouteResumption {
    const route = this._plannedRoute;
    if (!route || !this.plannedRouteStartsAs(from)) {
      return { replayOnly: false };
    }
    if ((route.pins ?? "") !== this.pinnedOptions.key) {
      return { replayOnly: false };
    }
    if (!this._program.changes) {
      return { replayOnly: false };
    }
    const validSteps = validAddressPrefixLength(
      route.steps,
      this._plannedRouteRoot,
      this._story.root,
      this._program.changes,
      this._plannedRouteChangeId,
    );
    const replayOnly = route.to === to && validSteps === route.steps.length;
    const pinned = this.pinnedOptions;
    const chunks = this._program.changes.chunks;
    const sameLine =
      route.to === to ||
      (chunks != null &&
        this._program.changes.since === this._plannedRouteChangeId &&
        chunks.dropped.length === 1 &&
        chunks.emitted.length === 1 &&
        chunks.dropped[0] === chunkOfAddress(route.to) &&
        chunks.emitted[0] === chunkOfAddress(to));
    const searchSteps = replayOnly
      ? validSteps
      : Math.min(
          validSteps,
          !sameLine
            ? stepsBeforeTargetDecision(route, pinned)
            : route.fallback
              ? stepsBeforePinMet(route, pinned)
              : stepsBeforeDeparture(route, pinned),
        );
    if (route.fallback) {
      const resume = this.findResumePoint(searchSteps);
      if (!resume) {
        return { validSteps, replayOnly: false };
      }
      return {
        validSteps,
        stepIndex: resume.stepIndex,
        resumeFrom: resume.point,
        checkpointIndex: resume.checkpointIndex,
        replayOnly,
      };
    }
    const replayCheckpointIndex =
      searchSteps < validSteps
        ? this.findReplayCheckpoint(validSteps)
        : undefined;
    const resume = this.findResumePoint(searchSteps);
    if (!resume) {
      return {
        validSteps,
        ...(replayCheckpointIndex != null ? { replayCheckpointIndex } : {}),
        replayOnly: false,
      };
    }
    return {
      validSteps,
      stepIndex: resume.stepIndex,
      resumeFrom: resume.point,
      checkpointIndex: resume.checkpointIndex,
      replayCheckpointIndex: Math.max(
        resume.checkpointIndex,
        replayCheckpointIndex ?? -1,
      ),
      replayOnly,
    };
  }

  protected static readonly LEVEL_ZERO_WORKS = 2;

  get levelZeroStore(): LevelZeroStore {
    return {
      find: (key) => this.heldLevelZeroWorks().get(key),
      keep: (work) => {
        const works = this.heldLevelZeroWorks();
        works.delete(work.key);
        works.set(work.key, work);
        for (const key of works.keys()) {
          if (works.size <= Game.LEVEL_ZERO_WORKS) {
            break;
          }
          works.delete(key);
        }
      },
    };
  }

  searchesFromLevelZeroWork(from: string, to: ProgramAddress): boolean {
    const chunk = chunkOfAddress(to);
    const pins = this.pinnedOptions.key;
    for (const work of this.heldLevelZeroWorks().values()) {
      if (work.from === from && work.pins === pins && !work.chunks.has(chunk)) {
        return true;
      }
    }
    return false;
  }

  protected heldLevelZeroWorks(): Map<string, LevelZeroWork> {
    const root = this._story.root;
    const changeId = this._program.changes?.id;
    if (this._levelZeroRoot !== root || this._levelZeroChangeId !== changeId) {
      const before = this._levelZeroRoot;
      for (const [key, work] of this._levelZeroWorks) {
        if (
          !before ||
          !levelZeroHolds(
            work,
            before,
            root,
            this._program.changes,
            this._levelZeroChangeId,
          )
        ) {
          this._levelZeroWorks.delete(key);
        }
      }
      this._levelZeroRoot = root;
      this._levelZeroChangeId = changeId;
    }
    return this._levelZeroWorks;
  }

  protected static readonly RESUME_CANDIDATES = 8;

  protected findResumePoint(validSteps: number): {
    stepIndex: number;
    checkpointIndex: number;
    point: RouteResumePoint;
  } | null {
    const route = this._plannedRoute;
    if (!route || validSteps < 1) {
      return null;
    }
    let tried = 0;
    for (let i = this._checkpoints.length - 1; i >= 0; i -= 1) {
      const cursor = this._checkpointStepCursors[i];
      if (cursor == null || cursor < 1 || cursor > validSteps) {
        continue;
      }
      if (tried >= Game.RESUME_CANDIDATES) {
        return null;
      }
      tried += 1;
      const point = this.readResumePoint(i, cursor, validSteps);
      if (point) {
        return { stepIndex: point.steps.length, checkpointIndex: i, point };
      }
    }
    return null;
  }

  protected findReplayCheckpoint(validSteps: number): number | undefined {
    if (!this._plannedRoute || validSteps < 1) {
      return undefined;
    }
    let tried = 0;
    for (let i = this._checkpoints.length - 1; i >= 0; i -= 1) {
      const cursor = this._checkpointStepCursors[i];
      if (cursor == null || cursor < 1 || cursor > validSteps) {
        continue;
      }
      if (tried >= Game.RESUME_CANDIDATES) {
        return undefined;
      }
      tried += 1;
      if (this.placeCheckpoint(i, cursor, validSteps)) {
        return i;
      }
    }
    return undefined;
  }

  protected readResumePoint(
    checkpointIndex: number,
    cursor: number,
    validSteps: number,
  ): RouteResumePoint | null {
    const route = this._plannedRoute;
    const placed = this.placeCheckpoint(checkpointIndex, cursor, validSteps);
    if (!route || !placed) {
      return null;
    }
    const { state, at } = placed;
    const charge = route.fallback ? undefined : routeChargeAt(route, at);
    if (!route.fallback && !charge) {
      return null;
    }
    const taken = (route.steps[at - 1]?.decision ?? -1) + 1;
    const decisions = route.decisions.slice(0, taken);
    let conditions = 0;
    let choices = 0;
    for (const decision of decisions) {
      if (decision.kind === "condition") {
        conditions += 1;
      } else {
        choices += 1;
      }
    }
    return {
      state,
      steps: route.steps.slice(0, at),
      decisions,
      conditions: route.conditions.slice(0, conditions),
      choices: route.choices.slice(0, choices),
      ...(charge ? { charge } : {}),
    };
  }

  protected placeCheckpoint(
    checkpointIndex: number,
    cursor: number,
    validSteps: number,
  ): { state: ProgramImage; at: number } | null {
    const route = this._plannedRoute;
    if (!route) {
      return null;
    }
    let state: ProgramImage | undefined;
    let standingOn: ProgramAddress | undefined;
    const program = this.programStory;
    const image = this._checkpoints.imageOf(checkpointIndex) as
      | ProgramImage
      | undefined;
    if (!image || !program.canRestore(image, false)) {
      return null;
    }
    this.discardOpenStoryLine();
    if (!program.restore(image, false)) {
      return null;
    }
    state = image;
    standingOn = this._positions.previous();
    if (standingOn == null) {
      return null;
    }
    let at = -1;
    for (let i = cursor - 1; i < validSteps; i += 1) {
      if (route.steps[i]!.address === standingOn) {
        at = i;
        break;
      }
    }
    if (at < 0) {
      return null;
    }
    if (program && at + 1 >= validSteps && !restsAfter(state, standingOn)) {
      return null;
    }
    return { state, at };
  }

  resumePlannedRoute(stepIndex: number, checkpointIndex: number): string | null {
    return this.checkpointJson(
      this.replayPlannedRoute(stepIndex, checkpointIndex),
    );
  }

  replayPlannedRoute(
    stepIndex: number,
    checkpointIndex: number,
  ): StoredCheckpoint | null {
    const route = this._plannedRoute;
    if (!route || !route.steps[stepIndex]) {
      return null;
    }
    const steps = route.steps.map((step, i) =>
      i < stepIndex
        ? step
        : { seq: step.seq, address: step.address, decision: step.decision },
    );
    this.simulateRoute({ ...route, steps }, stepIndex, checkpointIndex);
    return this.newestCheckpoint();
  }

  patchAndSimulateRoute(
    newRoute: RoutePlan,
    limits?: { steps: number; checkpoint: number },
  ): string | null {
    return this.checkpointJson(this.replayPatchedRoute(newRoute, limits));
  }

  replayPatchedRoute(
    newRoute: RoutePlan,
    limits?: { steps: number; checkpoint: number },
  ): StoredCheckpoint | null {
    if (!this._plannedRoute || !this.plannedRouteStartsAs(newRoute.from)) {
      this._runtimeState = new RuntimeState();
      this.simulateRoute(newRoute);
      return this.newestCheckpoint();
    }

    const considered =
      limits == null
        ? newRoute.steps.length
        : Math.max(0, Math.min(limits.steps, newRoute.steps.length));
    let valid = considered;
    let lastValidOldRouteCheckpoint: number | null = null;
    while (valid > 0) {
      const step = newRoute.steps[valid - 1]!;
      lastValidOldRouteCheckpoint = this.stepCheckpoint(step.seq || "", {
        address: step.address,
        index: valid - 1,
        maxCheckpoint: limits?.checkpoint,
      });
      if (lastValidOldRouteCheckpoint !== null) {
        break;
      }
      valid -= 1;
    }

    if (lastValidOldRouteCheckpoint === null) {
      this._runtimeState = new RuntimeState();
      this.simulateRoute(newRoute);
      return this.newestCheckpoint();
    }

    const patchedSteps = this._plannedRoute.steps.slice(0, valid);
    for (let i = valid; i < newRoute.steps.length; i += 1) {
      patchedSteps.push(newRoute.steps[i]!);
    }
    const patchedRoute: RoutePlan = { ...newRoute, steps: patchedSteps };

    const fromStep = valid - 1;
    this.simulateRoute(patchedRoute, fromStep);
    return this.newestCheckpoint();
  }

  endSimulation(): void {
    if (this._simulation === "simulating") {
      this._simulation = "fail";
    }
    this._context.system.simulating = undefined;
  }

  start(save: string = ""): void {
    this.cancelPreview();
    this._state = "running";
    this.endSimulation();
    this.notifyStarted();
    this._context.system.previewing = undefined;
    this._previewedAddress = undefined;
    for (const k of this._moduleNames) {
      this._modules[k]?.onStart();
    }
    if (this._simulation === "success") {
      this.observeScene(this._positions.current());
      this.continue(true);
    } else if (this._simulation === "fail") {
      this.module.interpreter.clearQueuedBeats();
      this.rewindStory();
      this.clearChoices();
      if (this._startAddress != null) {
        this.jumpTo(this._startAddress, true);
      }
      this.observeScene(this._startAddress);
      this.continue();
    } else {
      if (save) {
        this.load(save);
        this.observeScene(this._positions.current());
      } else if (this._startAddress != null) {
        this.jumpTo(this._startAddress);
        this.observeScene(this._startAddress);
      }
      this.continue();
    }
    if (this._clock) {
      this._clock.add((time) => this.update(time));
      this._clock.start();
    }
  }

  pause(): void {
    this._paused = true;
    if (this._clock) {
      this._clock.speed = 0;
    }
  }

  unpause(): void {
    this._paused = false;
    if (this._clock) {
      this._clock.speed = 1;
    }
  }

  skip(seconds: number): void {
    if (this._clock) {
      this._clock.adjustTime(seconds);
      this.update(this._clock);
    }
  }

  update(time: Clock) {
    if (!this._destroyed && !this.paused) {
      for (const k of this._moduleNames) {
        this._modules[k]?.onUpdate(time);
      }
      if (this._coordinator) {
        this._coordinator.onUpdate(time);
      }
    }
  }

  async restore(): Promise<void> {
    await Promise.all(
      this._moduleNames.map((k) => this._modules[k]?.onRestore()),
    );
  }

  destroy(): void {
    this.cancelPreview();
    this._destroyed = true;
    this._clock?.stop();
    this._clock?.dispose();
    for (const k of this._moduleNames) {
      this._modules[k]?.onDestroy();
    }
    this._sceneTracker.reset();
    this._moduleNames = [];
    this._connection.incoming.removeAllListeners();
    this._connection.outgoing.removeAllListeners();
    this._coordinator = null;
  }

  checkpoint(): void {
    this._checkpoints.capture();
    this._checkpointStepCursors.length = this._checkpoints.length;
    this._checkpointShownBeats.length = this._checkpoints.length;
    this._checkpointDecisionsTaken.length = this._checkpoints.length;
    if (this._checkpoints.length > 0) {
      const simulating = this._simulation === "simulating";
      this._checkpointStepCursors[this._checkpoints.length - 1] = simulating
        ? this._plannedRouteStepCursor
        : undefined;
      this._checkpointShownBeats[this._checkpoints.length - 1] = simulating
        ? this._shownBeat
        : undefined;
      this._checkpointDecisionsTaken[this._checkpoints.length - 1] = simulating
        ? this._routeSimulator?.decisionsTaken()
        : undefined;
    }
  }

  save(): string {
    return this.buildSave(false);
  }

  protected durableExecuted(executed: RecencyEntry[]): RecencyEntry[] {
    const root = this._story.root;
    const out: RecencyEntry[] = [];
    for (const entry of executed) {
      const form = typeof entry === "number" ? durableAddress(root, entry) : entry;
      if (form !== undefined) {
        out.push(form);
      }
    }
    return out;
  }

  protected placedExecuted(root: ProgramRoot, saved: RecencyEntry[]): RecencyEntry[] {
    const out: RecencyEntry[] = [];
    for (const entry of saved) {
      const address =
        typeof entry === "string" ? placeDurableAddress(root, entry) : undefined;
      if (address !== undefined) {
        out.push(address);
      }
    }
    return out;
  }

  protected buildSave(omitDeltaState: boolean, withStory = true): string {
    let story = "";
    let watchedCells: SaveData["watchedCells"];
    const state = this.programStory.state;
    try {
      if (withStory) {
        const watched = this._dataWatches.filter(
          (watch) =>
            watch.pointer && watch.pointerState === state.variablesState,
        );
        if (watched.length > 0) {
          state.cellsWritten = (cells) => {
            watchedCells = [];
            for (const watch of watched) {
              const cell = cells.get(watch.pointer!);
              if (cell !== undefined) {
                watchedCells.push({
                  dataId: watch.dataId,
                  cell,
                  tag: this.cellTag(watch.pointer!),
                });
              }
            }
          };
        }
        try {
          story = this._story.toSave(this._version);
        } finally {
          state.cellsWritten = null;
        }
      }
    } catch (e: any) {
      this.Error(e.message, ErrorType.Error);
    }
    const runtime = omitDeltaState
      ? this._runtimeState.toJSONWithoutCollections()
      : this._runtimeState.toJSON((executed) => this.durableExecuted(executed));
    const saveData: SaveData = {
      modules: {},
      context: {},
      story,
      runtime,
      simulatedFrom:
        this._simulation !== "none" ? this._simulateFlow : undefined,
    };
    if (watchedCells && watchedCells.length > 0) {
      saveData.watchedCells = watchedCells;
    }
    for (const k of this._moduleNames) {
      const module = this._modules[k];
      if (module) {
        saveData.modules[k] = module.state;
      }
    }
    const serialized = JSON.stringify(saveData);
    return serialized;
  }

  load(saveJSON: string) {
    return this.loadProgramSave(this._story, saveJSON);
  }

  newestCheckpoint(): StoredCheckpoint | null {
    const checkpoint = this._checkpoints.checkpointAt(-1);
    return checkpoint && this.writesImage(checkpoint.image) ? checkpoint : null;
  }

  checkpointJson(checkpoint: StoredCheckpoint | null): string | null {
    return checkpoint ? this._checkpoints.jsonOf(checkpoint) : null;
  }

  loadCheckpoint(checkpoint: StoredCheckpoint): boolean {
    const program = this._story;
    const image = checkpoint.image as ProgramImage;
    try {
      if (!this.writesImage(image)) {
        throw new Error("The save holds no story to load");
      }
      const saveData: SaveData = JSON.parse(checkpoint.body);
      this.checkSaveModules(saveData);
      const rt = checkpoint.runtime;
      const runtime = RuntimeState.of({
        pe: this.placedExecuted(program.root, this.durableExecuted(rt.pe)),
        ce: rt.ce,
        cde: rt.cde,
      });
      if (!program.loadImage(image)) {
        const json = this.checkpointJson(checkpoint);
        return json !== null && this.load(json);
      }
      for (const watch of this._dataWatches) {
        watch.pointer = null;
        watch.pointerState = null;
      }
      this.finishLoad(saveData, runtime);
      return true;
    } catch (e) {
      this.log(e, "error");
    }
    return false;
  }

  protected checkSaveModules(saveData: SaveData): void {
    const isRecord = (value: unknown) =>
      typeof value === "object" && value !== null && !Array.isArray(value);
    if (!isRecord(saveData.modules)) {
      throw new Error("The save holds no module states to load");
    }
    for (const k of this._moduleNames) {
      if (this._modules[k] && !isRecord(saveData.modules[k])) {
        throw new Error(`The save holds no state for the module ${k}`);
      }
    }
  }

  protected finishLoad(saveData: SaveData, runtime: RuntimeState): void {
    this.cancelPreview();
    this.restoreReactiveTracking();
    for (const k of this._moduleNames) {
      const module = this._modules[k];
      if (module) {
        module.load(saveData.modules[k]);
      }
    }
    this._runtimeState = runtime;
    this._awaiting = this.lastExecutedScriptLocation();
    if (saveData.simulatedFrom) {
      this._simulation = "success";
      this._simulateFlow = saveData.simulatedFrom;
    }
  }

  protected loadProgramSave(program: ProgramStory, saveJSON: string): boolean {
    try {
      const saveData: SaveData =
        typeof saveJSON === "string" ? JSON.parse(saveJSON) : saveJSON;
      if (typeof saveData?.story !== "string" || !saveData.story) {
        throw new Error("The save holds no story to load");
      }
      this.checkSaveModules(saveData);
      if (typeof saveData.runtime !== "string") {
        throw new Error("The save holds no runtime record to load");
      }
      const runtime = RuntimeState.read(saveData.runtime);
      program.checkSave(saveData.story);
      runtime.pathsExecutedThisFrame = RecencySet.from(
        this.placedExecuted(program.root, runtime.pathsExecutedThisFrame.toArray()),
      );
      const noted = new Map<string, { cell: number; tag: string }>();
      if (Array.isArray(saveData.watchedCells)) {
        for (const entry of saveData.watchedCells) {
          if (
            typeof entry?.dataId === "string" &&
            Number.isInteger(entry?.cell) &&
            typeof entry?.tag === "string"
          ) {
            noted.set(entry.dataId, { cell: entry.cell, tag: entry.tag });
          }
        }
      }
      for (const [dataId, note] of noted) {
        const watch = this._dataWatches.find((w) => w.dataId === dataId);
        if (!watch?.pointer || this._cellTags.get(watch.pointer) !== note.tag) {
          noted.delete(dataId);
        }
      }
      const read: { cells: Map<number, VariablePointerValue> | null } = {
        cells: null,
      };
      if (noted.size > 0) {
        program.state.cellsRead = (cells) => {
          read.cells = new Map(cells);
        };
      }
      try {
        program.loadSave(saveData.story);
      } finally {
        program.state.cellsRead = null;
      }
      for (const watch of this._dataWatches) {
        const note = noted.get(watch.dataId);
        const cell = note ? read.cells?.get(note.cell) : undefined;
        if (cell) {
          this._cellTags.set(cell, note!.tag);
        }
        watch.pointer = cell ?? null;
        watch.pointerState = cell ? program.state.variablesState : null;
      }
      this.finishLoad(saveData, runtime);
      return true;
    } catch (e) {
      this.log(e, "error");
    }
    return false;
  }

  restoreCheckpoint(index: number): boolean {
    const entry = this._checkpoints.checkpointAt(index);
    const story = this.programStory;
    if (!entry || index < 0) {
      return false;
    }
    const image = entry.image as ProgramImage;
    if (!story.canRestore(image)) {
      return false;
    }
    this.cancelPreview();
    this.discardOpenStoryLine();
    if (!story.restore(image)) {
      return false;
    }
    this.restoreReactiveTracking();
    const saveData = JSON.parse(entry.body) as SaveData;
    for (const k of this._moduleNames) {
      this._modules[k]?.load(saveData.modules[k]);
    }
    this._runtimeState = RuntimeState.of(entry.runtime);
    if (saveData.simulatedFrom) {
      this._simulation = "success";
      this._simulateFlow = saveData.simulatedFrom;
    }
    return true;
  }

  async onReceive(
    msg: RequestMessage | NotificationMessage,
  ): Promise<
    | { error: ResponseError; transfer?: ArrayBuffer[] }
    | { result: unknown; transfer?: ArrayBuffer[] }
    | { transfer?: ArrayBuffer[] }
    | undefined
  > {
    for (const k of this._moduleNames) {
      const module = this._modules[k];
      if (module) {
        if ("id" in msg) {
          return module.onReceiveRequest(msg);
        }
        module.onReceiveNotification(msg);
      }
    }
    if (this._coordinator) {
      this._coordinator.onMessage(msg);
    }
    return undefined;
  }

  protected rewindStory() {
    this.discardOpenStoryLine();
    this._story.ResetState();
    this.restoreReactiveTracking();
  }

  protected discardOpenStoryLine() {
    this._story.CancelAsyncContinue();
    this._awaiting = null;
  }

  protected restoreReactiveTracking() {
    if (this._program?.sparkle?.layouts) {
      this._story.variablesState.reactiveDepsEnabled = true;
    }
  }

  reset() {
    this.cancelPreview();
    this.rewindStory();
    this._sceneTracker.reset();
    for (const k of this._moduleNames) {
      const module = this._modules[k];
      if (module) {
        module.reset();
      }
    }
  }

  continue(preserveExecutionInfo?: boolean) {
    if (!preserveExecutionInfo) {
      this._runtimeState = new RuntimeState();
    }
    this._awaiting = null;

    this.resetExecutionBudget();
    this.refreshDataWatches();

    this.clearVariableReferences();
    this._coordinator = null;
    let done = false;
    do {
      done = this.stepWithinBudget();
    } while (!done);

    if (
      this._simulation !== "simulating" &&
      !this._holdingFlush &&
      !this._replaying
    ) {
      this.notifyExecuted();
    }

    return done;
  }

  protected resetExecutionBudget() {
    this._executionBudgetExhausted = false;
    this._executionStepsRemaining = this._executionStepLimit;
  }

  step(traversal: "in" | "out" | "over" | "continue" = "continue"): boolean {
    this.cancelPreview();
    this._awaiting = null;
    this.resetExecutionBudget();
    this.refreshDataWatches();
    const origin = {
      depth: this._story.state.callstackDepth,
      location: this._executingLocation,
    };
    this._announcedStop = false;
    this._steppingInThroughEntry = false;
    let done = this.stepWithinBudget(traversal, origin);
    while (!done && traversal !== "continue") {
      done = this.stepWithinBudget(traversal, origin);
    }
    if (traversal !== "continue" && !this._announcedStop) {
      this.notifyStepped();
    }
    this.module.assets.releaseAbandonedGates();
    return done;
  }

  protected stepWithinBudget(
    traversal: "in" | "out" | "over" | "continue" = "continue",
    origin?: { depth: number; location: ScriptLocation | null },
  ): boolean {
    const initialCallstackDepth =
      origin?.depth ?? this._story.state.callstackDepth;
    const initialExecutedLocation =
      origin?.location ?? this._executingLocation;

    while (true) {
      if (this._executionStepsRemaining <= 0) {
        this._executionBudgetExhausted = true;
        this.Error(
          `Execution exceeded ${this._executionStepLimit} ${
            this._executionStepLimit === 1 ? "step" : "steps"
          }: possible infinite loop`,
          ErrorType.Error,
        );
        return true;
      }
      this._executionStepsRemaining -= 1;

      const address = this._positions.previous();
      if (address != null) {
        if (address !== this._executingAddress) {
          this._executingAddress = address;
          this.observeScene(address);
          if (
            this._plannedRoute &&
            this._plannedRouteStepCursor < this._plannedRoute?.steps.length
          ) {
            const step = this._plannedRoute.steps[this._plannedRouteStepCursor];
            if (step) {
              if (step.address === address) {
                const latestCheckpoint = this._checkpoints.length - 1;
                if (latestCheckpoint >= 0) {
                  step.checkpoint = latestCheckpoint;
                }
                this._plannedRouteStepCursor++;
                if (
                  this._plannedRouteStepCursor ===
                  this._plannedRoute.steps.length - 1
                ) {
                  this.watchTargetWrites();
                }
              }
            }
          }
        }
      }

      if (this._story.asyncContinueComplete) {
        if (
          this._simulation === "simulating" &&
          this._startAddress != null &&
          this._runtimeState.pathsExecutedThisFrame.has(this._startAddress)
        ) {
          this.endTargetWatch();
          this.checkpoint();
          this._simulation = "success";
          return true;
        }
      }

      if (this.module.interpreter.shouldFlush() || !this._story.canContinue) {
        const instructions = this.module.interpreter.flush();
        if (this._holdingFlush) {
          this._held = { instructions: instructions ?? null };
          return true;
        }
        if (instructions) {
          this._coordinator = new Coordinator(this, instructions);
          if (this._simulation !== "simulating") {
            this.noteShownChoices(instructions);
          } else {
            this._shownBeat = instructions;
          }
          if (
            !this._coordinator.shouldContinue() &&
            this._simulation !== "simulating" &&
            (!(instructions.load || instructions.cutscene) ||
              (instructions.choices?.length ?? 0) > 0)
          ) {
            this.notifyAwaitingInteraction();
          }
        } else if (
          !this._story.canContinue &&
          this._simulation !== "simulating" &&
          this._state === "running"
        ) {
          this.notifyFinished();
        }
        if (instructions || this._simulation !== "simulating") {
          this.checkpoint();
        }
        if (this._simulation === "simulating") {
          if (!this._story.canContinue) {
            return true;
          }
          continue;
        }
        if (!this._coordinator) {
          this.module.ui.reveal();
        }
        return true;
      } else if (this._story.canContinue) {
        const stepsBefore = this._story.stepCount;
        const program = this.programStory;
        const log = this._executedLog;
        log.length = 0;
        program.executedLog = log;
        const beatLog = this._beatLog;
        beatLog.length = 0;
        program.beatLog = beatLog;
        const variablesState = program.state.variablesState;
        variablesState.writeWatch =
          this._dataWatches.length > 0 ? this._noteWrite : null;
        this._story.stepLimit =
          stepsBefore + 1 + this._executionStepsRemaining;
        let stopped = false;
        try {
          this._story.ContinueAsync();
        } catch (e) {
          if (!(e instanceof StepLimitExceeded)) {
            throw e;
          }
          stopped = true;
        } finally {
          this._story.stepLimit = null;
          this._executionStepsRemaining -= Math.max(
            0,
            this._story.stepCount - stepsBefore - 1,
          );
          program.executedLog = null;
          program.beatLog = null;
          variablesState.writeWatch = null;
        }
        let hit = false;
        for (let i = 0; i < log.length; i += 1) {
          if (this._breakAddresses.has(log[i]!)) {
            hit = true;
          }
        }
        for (let i = 0; i < beatLog.length; i += 1) {
          this._runtimeState.recordExecution(beatLog[i]!);
        }
        if (stopped) {
          this._story.CancelAsyncContinue();
          this._story.state.ForceEnd();
          continue;
        }
        if (this._dataWatches.length > 0 && this.dataWatchesChanged()) {
          hit = true;
        }
        if (this._story.state.callstackDepth > this._callDepthLimit) {
          this._story.CancelAsyncContinue();
          this._story.state.ForceEnd();
          this.Error(
            `Calls nested more than ${this._callDepthLimit} deep: stack overflow, possible infinite recursion`,
            ErrorType.Error,
          );
          return true;
        }

        const prevExecutedLocation = this._executingLocation;
        const location = this.scriptLocationOf(this._positions.previous());
        if (location) {
          this._executingLocation = location;
        }

        if (
          this._story.asyncContinueComplete &&
          this._story.continueShowedSomething
        ) {
          this.module.interpreter.queue(
            this._story.currentDisplayInstructions,
            this._story.currentChoices.map((c) => c.text),
            this._story.currentText || "",
          );
        }

        if (this._simulation !== "simulating") {
          if (hit) {
            this.notifyHitBreakpoint();
            return true;
          }
          if (traversal === "continue") {
            return false;
          }
          if (traversal === "in") {
            const last = this._positions.previous();
            if (last != null && this.entryCode().has(last)) {
              this._steppingInThroughEntry = true;
              continue;
            }
            if (this._steppingInThroughEntry) {
              this._steppingInThroughEntry = false;
              this.notifyStepped();
              return true;
            }
          }

          if (
            sameLocation(prevExecutedLocation, this._executingLocation) ||
            sameLocation(initialExecutedLocation, this._executingLocation)
          ) {
            continue;
          }

          const currentCallstackDepth = this._story.state.callstackDepth;

          if (traversal === "in") {
            this.notifyStepped();
            return true;
          }

          if (
            traversal === "over" &&
            currentCallstackDepth <= initialCallstackDepth
          ) {
            this.notifyStepped();
            return true;
          }

          if (
            traversal === "out" &&
            currentCallstackDepth < initialCallstackDepth
          ) {
            this.notifyStepped();
            return true;
          }

        }

        return false;
      } else {
        return true;
      }
    }
  }

  autoAdvancedToContinue() {
    this.continue();
    this.notifyAutoAdvancedToContinue();
  }

  clickedToContinue() {
    this.continue();
    this.notifyClickedToContinue();
  }

  chosePathToContinue(index: number) {
    this._shownChoices = [];
    this._story.ChooseChoiceIndex(index);
    this.checkpoint();
    this.continue();
    this.notifyChosePathToContinue();
  }

  clearChoices() {
    const targets = this._shownChoices;
    this._shownChoices = [];
    for (const target of targets) {
      this.module.ui.text.clear(target);
      this.module.ui.image.clear(target);
      this.module.ui.unobserve("click", target);
      this.module.ui.hide(target);
    }
  }

  protected noteShownChoices(instructions: Instructions | null) {
    this._shownChoices = [...(instructions?.choices ?? [])];
  }

  jumpTo(address: ProgramAddress, withStartingValues = false) {
    this.discardOpenStoryLine();
    if (withStartingValues) {
      const plan = this.startPlan(this.routeStartOf(address));
      this._story.resetSeed = plan.seed;
      this._story.ResetState();
      applyStartValues(this._story, plan);
      this._positions.jumpTo(address);
      bindStartArguments(this._story, plan);
      return;
    }
    this._story.ResetState();
    this._positions.jumpTo(address);
  }

  jumpToFlow(flow: string) {
    this.discardOpenStoryLine();
    const plan = this.startPlan(flow);
    this._story.resetSeed = plan.seed;
    this._story.ResetState();
    startStoryAt(this._story, plan);
  }

  protected notifyHitBreakpoint() {
    this._announcedStop = true;
    this.connection.emit(
      GameHitBreakpointMessage.type.notification({
        location: this.getDocumentLocation(this._executingLocation),
      }),
    );
  }

  protected notifyAwaitingInteraction() {
    const location =
      this.lastExecutedScriptLocation() ?? this._executingLocation;
    this._awaiting = location;
    this.connection.emit(
      GameAwaitingInteractionMessage.type.notification({
        location: this.getDocumentLocation(location),
      }),
    );
  }

  protected notifyAutoAdvancedToContinue() {
    this.connection.emit(
      GameAutoAdvancedToContinueMessage.type.notification({
        location: this.getDocumentLocation(this._executingLocation),
      }),
    );
  }

  protected notifyClickedToContinue() {
    this.connection.emit(
      GameClickedToContinueMessage.type.notification({
        location: this.getDocumentLocation(this._executingLocation),
      }),
    );
  }

  protected notifyChosePathToContinue() {
    this.connection.emit(
      GameChosePathToContinueMessage.type.notification({
        location: this.getDocumentLocation(this._executingLocation),
      }),
    );
  }

  protected notifyStarted() {
    this.connection.emit(GameStartedMessage.type.notification({}));
  }

  protected notifyFinished() {
    this.connection.emit(GameFinishedMessage.type.notification({}));
  }

  protected notifyStartedThread(threadIndex: number) {
    this.connection.emit(
      GameStartedThreadMessage.type.notification({ threadId: threadIndex }),
    );
  }

  protected notifyExitedThread(threadIndex: number) {
    this.connection.emit(
      GameExitedThreadMessage.type.notification({ threadId: threadIndex }),
    );
  }

  protected notifyPreviewed(address: ProgramAddress) {
    const location = this.getDocumentLocation(this.scriptLocationOf(address));
    this.connection.emit(
      GamePreviewedMessage.type.notification({
        location,
        address,
      }),
    );
  }

  protected executedParams(): GameExecutedParams {
    const detailed = this.reportsExecutedLines;
    let first: ScriptLocation | undefined;
    let last: ScriptLocation | undefined;
    let lastAddress: ProgramAddress | undefined;
    const lines = new Map<string, Set<number>>();
    const lastLines = new Map<string, number>();
    this._runtimeState.pathsExecutedThisFrame.forEach((p) => {
      if (typeof p !== "number") {
        return;
      }
      lastAddress = p;
      const l = this.scriptLocationOf(p);
      if (!l) {
        return;
      }
      first ??= l;
      last = l;
      if (detailed) {
        const uri = this.scriptUri(l[0]);
        let set = lines.get(uri);
        if (!set) {
          set = new Set();
          lines.set(uri, set);
        }
        for (let line = l[1]; line <= l[3]; line++) {
          if (!set.has(line)) {
            set.add(line);
            lastLines.set(uri, line);
          }
        }
      }
    });
    let executedLines: Record<string, ExecutedLines> | undefined;
    if (detailed) {
      executedLines = {};
      for (const [uri, set] of lines) {
        executedLines[uri] = {
          ranges: lineRanges(set),
          last: lastLines.get(uri)!,
        };
      }
    }
    const failed = this._simulation === "fail";
    return {
      simulateFlow: this._simulateFlow,
      simulateLocation:
        failed && this._simulateFlow != null
          ? (this.flowDocumentLocationOf(this._simulateFlow) ?? undefined)
          : undefined,
      startLocation:
        failed && this._startAddress != null
          ? (this.documentLocationOf(this._startAddress) ?? undefined)
          : undefined,
      executedLines,
      firstLocation: first ? this.getDocumentLocation(first) : undefined,
      lastLocation: last ? this.getDocumentLocation(last) : undefined,
      lastExecutedAddress: detailed ? lastAddress : undefined,
      conditions: detailed ? [...this._runtimeState.conditionsEncountered] : [],
      choices: [...this._runtimeState.choicesEncountered],
      state: this._state,
      restarted: this._restarted,
      simulation: this._simulation,
      simulationFailure:
        this._simulation === "fail" ? this._simulationFailure : undefined,
      route: this._previewRoute,
    };
  }

  previewRouteOf(route: RoutePlan, source?: ScriptSource): PreviewRoute {
    const lineOf = (address: ProgramAddress) => {
      const location = this.scriptLocationOf(address);
      return location ? { script: location[0], line: location[1] } : undefined;
    };
    const target =
      this.documentLocationOf(route.to) ?? this.lineLocation(this._program.uri, 0);
    const scene = this.flowDocumentLocationOf(route.from);
    const firstStep = route.steps.find(
      (step) => this.scriptLocationOf(step.address) !== undefined,
    );
    const start = scene
      ? { scene: route.from, location: scene }
      : {
          location:
            (firstStep && this.documentLocationOf(firstStep.address)) ??
            this.lineLocation(target.uri, 0),
        };
    const structures = new Map<number, ScriptStructure>();
    const structureOf =
      source &&
      ((script: number) => {
        let found = structures.get(script);
        if (!found) {
          found = source.structure(this.scriptUri(script));
          structures.set(script, found);
        }
        return found;
      });
    const pinned = this.pinnedOptions;
    const decisions: PreviewRouteDecision[] = [];
    for (const decision of routeDecisions(
      route,
      lineOf,
      structureOf,
      pinned,
    )) {
      const location = decision.loop
        ? this.lineLocation(
            this.scriptUri(decision.loop.script),
            decision.loop.line,
          )
        : this.documentLocationOf(decision.site);
      if (!location) {
        continue;
      }
      const options: PreviewRouteOption[] = [];
      for (const option of decision.options ?? []) {
        const at = this.documentLocationOf(option.site);
        if (at) {
          options.push({
            location: at,
            text: option.text,
            offer: option.offer,
            ...(option.pinned ? { pinned: true as const } : {}),
          });
        }
      }
      const menu =
        decision.menu !== undefined
          ? this.documentLocationOf(decision.menu)
          : null;
      const unofferedPins: RoutePin[] = [];
      for (const { site, offer } of decision.unoffered ?? []) {
        const at = this.documentLocationOf(site);
        if (at) {
          unofferedPins.push({
            uri: at.uri,
            line: at.range.start.line,
            offer,
          });
        }
      }
      decisions.push({
        kind: decision.kind,
        location,
        text:
          decision.kind === "auto" || decision.kind === "pinned"
            ? (decision.option ?? "")
            : conditionText(
                source?.lineText(location.uri, location.range.start.line) ??
                  "",
              ),
        ...(decision.meeting !== undefined
          ? { meeting: decision.meeting }
          : {}),
        ...(decision.options ? { options } : {}),
        ...(menu ? { menu } : {}),
        ...(decision.notFollowed ? { notFollowed: true as const } : {}),
        ...(unofferedPins.length > 0 ? { unofferedPins } : {}),
        ...(decision.verdict !== undefined
          ? { verdict: decision.verdict }
          : {}),
        ...(decision.passes !== undefined ? { passes: decision.passes } : {}),
      });
    }
    return {
      start,
      target,
      decisions,
      valuesStart: this.routeStartOf(route.to),
      ...(pinned.unresolved.length > 0
        ? { unresolvedPins: [...pinned.unresolved] }
        : {}),
    };
  }

  protected lineLocation(uri: string, line: number): DocumentLocation {
    return {
      uri,
      range: {
        start: { line, character: 0 },
        end: { line, character: 0 },
      },
    };
  }

  static routeMenus(route: RoutePlan): RunMenu[] {
    const menus: RunMenu[] = [];
    for (const choice of route.choices) {
      const taken = choice.sources?.[choice.selected];
      if (choice.sources && taken !== undefined) {
        menus.push({ sources: [...choice.sources], taken });
      }
    }
    return menus;
  }

  runMenus(route: RunMenu[]): RunMenu[] {
    return [
      ...route,
      ...this._playedMenus.map((menu) => ({
        sources: [...menu.sources],
        taken: menu.taken,
      })),
    ];
  }

  runMeetings(menus: RunMenu[]): RunMeeting[] | null {
    const pinned = this.pinnedOptions;
    const counts = new Map<string, number>();
    const lines = new Map<string, Omit<RoutePin, "offer"> | null>();
    const lineOf = (source: string) => {
      let at = lines.get(source);
      if (at === undefined) {
        const location = this.documentLocationOf(Number(source));
        at = location
          ? { uri: location.uri, line: location.range.start.line }
          : null;
        lines.set(source, at);
      }
      return at;
    };
    const meetings: RunMeeting[] = [];
    for (const menu of menus) {
      let pin: RoutePin | undefined;
      const others: RoutePin[] = [];
      for (const source of menu.sources) {
        const at = lineOf(source);
        if (!at) {
          return null;
        }
        const offer = (counts.get(source) ?? 0) + 1;
        counts.set(source, offer);
        if (source === menu.taken) {
          pin = { ...at, offer };
        } else {
          others.push({ ...at, offer });
        }
      }
      for (const { source, offer } of pinnedNotOffered(
        pinned,
        menu.sources,
        counts,
      )) {
        const at = lineOf(source);
        if (at) {
          others.push({ ...at, offer });
        }
      }
      if (!pin) {
        return null;
      }
      meetings.push({ pin, others });
    }
    return meetings;
  }

  protected notifyExecuted(params: GameExecutedParams = this.executedParams()) {
    this.connection.emit(GameExecutedMessage.type.notification(params));
  }

  protected notifyStepped() {
    this._announcedStop = true;
    this.connection.emit(
      GameSteppedMessage.type.notification({
        location: this.getDocumentLocation(this._executingLocation),
      }),
    );
  }

  getEvaluationContext(threadId?: number, frameId?: number) {
    const context: any = {};
    const variableState = this._story.state.variablesState;
    const callStack = variableState.callStack;
    const thread =
      threadId != null ? callStack.ThreadWithIndex(threadId) : undefined;
    const selected = thread
      ? thread.callstack[frameId ?? thread.callstack.length - 1]
      : undefined;
    for (const name of variableState["_globalVariables"].keys()) {
      const valueObj =
        selected && thread
          ? this.valueInFrame(thread, selected, name)
          : variableState.GetVariableWithName(name);
      const value = this.getRuntimeValue(valueObj);
      if (isEvaluable(value) && !this.isTableRecord(value)) {
        context[name] = value;
      }
    }
    const contextThread = selected && thread ? thread : callStack.currentThread;
    const contextElement =
      selected ?? callStack.currentThread.callstack[callStack.currentElementIndex];
    if (contextElement?.temporaryVariables) {
      for (const [name, scoped] of contextElement.temporaryVariables.entries()) {
        const valueObj =
          scoped instanceof VariablePointerValue
            ? this.valueAtPointerInThread(contextThread, scoped)
            : scoped;
        const value = this.getRuntimeValue(valueObj);
        if (isEvaluable(value) && !this.isTableRecord(value)) {
          context[name] = value;
        }
      }
    }
    return context;
  }

  protected valueInFrame(
    thread: CallStack.Thread,
    element: CallStack.Element,
    name: string,
  ): InkObject | null {
    const scopes = element.temporaryScopes;
    for (let s = scopes.length - 1; s >= 0; s -= 1) {
      if (scopes[s]!.has(name)) {
        const scoped = scopes[s]!.get(name) ?? null;
        return scoped instanceof VariablePointerValue
          ? this.valueAtPointerInThread(thread, scoped)
          : scoped;
      }
    }
    const variableState = this._story.state.variablesState;
    const globalObj = variableState.GetGlobalVariableValue(name);
    return globalObj instanceof VariablePointerValue
      ? variableState.ValueAtVariablePointer(globalObj)
      : globalObj;
  }

  isTableRecord(value: unknown): boolean {
    return (
      typeof value === "object" && value != null && this._tableRecords.has(value)
    );
  }

  getVarVariables(): Variable[] {
    const variables: Variable[] = [];
    const variableState = this._story.state.variablesState;
    for (const name of variableState["_globalVariables"].keys()) {
      if (name.indexOf("$") > 0) {
        continue;
      }
      const globalObj = variableState.GetGlobalVariableValue(name);
      const valueObj =
        globalObj instanceof VariablePointerValue
          ? variableState.ValueAtVariablePointer(globalObj)
          : globalObj;
      const value = this.getRuntimeValue(valueObj);
      if (value !== undefined) {
        variables.push(
          this.getVariableInfo(name, value, {
            kind: "data",
            visibility: "public",
          }),
        );
      }
    }
    return variables;
  }

  getDefineVariables(): Variable[] {
    const variables: Variable[] = [];
    for (const [type, structs] of Object.entries(this.context)) {
      if (type !== "system") {
        variables.push(
          this.getVariableInfo(type, structs, {
            kind: "interface",
            visibility: "public",
          }),
        );
      }
    }
    return variables;
  }

  getTempVariables(threadId?: number, frameId?: number): Variable[] {
    const variables: Variable[] = [];
    const variableState = this._story.state.variablesState;
    const callStack = variableState.callStack;
    const thread =
      threadId != null
        ? callStack.ThreadWithIndex(threadId)
        : callStack.currentThread;
    const frameIndex =
      frameId ??
      (threadId != null && thread
        ? thread.callstack.length - 1
        : callStack.currentElementIndex);
    const contextElement = thread?.callstack[frameIndex];
    const programScope = this._story.debugFrames(thread?.threadIndex ?? 0)?.[
      frameIndex
    ]?.scope;
    const scopes = contextElement?.temporaryScopes ?? [];
    const seen = new Set<string>();
    for (let s = scopes.length - 1; s >= 0; s -= 1) {
      for (const [name, scoped] of scopes[s]!.entries()) {
        if (!name.includes("$") && !seen.has(name)) {
          seen.add(name);
          const valueObj =
            scoped instanceof VariablePointerValue && thread
              ? this.valueAtPointerInThread(thread, scoped)
              : scoped;
          const value = this.getRuntimeValue(valueObj);
          const scopePath = programScope;
          if (value !== undefined) {
            variables.push(
              this.getVariableInfo(
                name,
                value,
                {
                  kind: "data",
                  visibility: "private",
                },
                scopePath,
              ),
            );
          }
        }
      }
    }
    return variables;
  }

  protected valueAtPointerInThread(
    thread: CallStack.Thread,
    pointer: VariablePointerValue,
  ): InkObject | null {
    const variableState = this._story.state.variablesState;
    const visited = new Set<VariablePointerValue>();
    let at: VariablePointerValue = pointer;
    while (!visited.has(at)) {
      visited.add(at);
      if (at.isClosed) {
        return at.closedValue;
      }
      const name = at.variableName;
      const contextIndex =
        at.contextIndex === -1 ? thread.callstack.length : at.contextIndex;
      const scopes = thread.callstack[contextIndex - 1]?.temporaryScopes;
      let found: InkObject | null | undefined;
      if (scopes && name !== null) {
        const scopeIndex = at.scopeIndex;
        if (scopeIndex >= 0 && scopes[scopeIndex]?.has(name)) {
          found = scopes[scopeIndex]!.get(name) ?? null;
        } else {
          for (let s = scopes.length - 1; s >= 0 && found === undefined; s -= 1) {
            if (scopes[s]!.has(name)) {
              found = scopes[s]!.get(name) ?? null;
            }
          }
        }
      }
      if (found === undefined) {
        return at.contextIndex <= 0
          ? variableState.GetVariableWithName(name, 0)
          : null;
      }
      if (!(found instanceof VariablePointerValue)) {
        return found;
      }
      at = found;
    }
    return null;
  }

  getChildVariables(varRef: number): Variable[] {
    const variables: Variable[] = [];
    const value = this._objectVariableRefMap.get(varRef);
    if (typeof value === "object" && Array.isArray(value)) {
      value.forEach((v, index) => {
        variables.push(
          this.getVariableInfo(index.toString(), v, {
            kind: "property",
            visibility: "public",
          }),
        );
      });
    } else if (typeof value === "object" && value) {
      const tableKeys = this._tableRecords.get(value);
      const record = value as Record<string, unknown>;
      for (const k of tableKeys ?? Object.keys(record)) {
        if (tableKeys || !k.startsWith("$")) {
          variables.push(
            this.getVariableInfo(k, record[k], {
              kind: "property",
              visibility: "public",
            }),
          );
        }
      }
    } else {
      variables.push(
        this.getVariableInfo("", value, {
          kind: "property",
          visibility: "public",
        }),
      );
    }
    return variables;
  }

  getValueVariables(value: any): Variable[] {
    const variables: Variable[] = [];
    variables.push(
      this.getVariableInfo("", value, {
        kind: "property",
        visibility: "public",
      }),
    );
    return variables;
  }

  getRuntimeValue(valueObj: InkObject | null): unknown | undefined {
    if (valueObj && "value" in valueObj) {
      if (valueObj instanceof ObjectValue) {
        return this.getTableRecord(valueObj);
      }
      return valueObj.value;
    }
    return undefined;
  }

  getTableRecord(table: ObjectValue): Record<string, unknown> {
    const record: Record<string, unknown> = Object.create(null);
    const entries = table.value ?? new Map<string, unknown>();
    const keys: string[] = [];
    for (let i = 1; entries.get(String(i)) != null; i += 1) {
      keys.push(String(i));
    }
    const arrayLength = keys.length;
    for (const key of entries.keys()) {
      const index = Number(key);
      const inArray =
        Number.isInteger(index) &&
        index >= 1 &&
        index <= arrayLength &&
        String(index) === key;
      if (!inArray) {
        keys.push(key);
      }
    }
    this._tableRecords.set(record, keys);
    for (const [key, entry] of entries) {
      record[key] =
        entry instanceof ObjectValue
          ? entry
          : entry && typeof entry === "object" && "value" in entry
            ? entry.value
            : entry;
    }
    return record;
  }

  getVariableInfo(
    name: string,
    value: unknown,
    presentationHint?: VariablePresentationHint,
    scopePath?: string,
  ): Variable {
    if (value instanceof ObjectValue) {
      value = this.getTableRecord(value);
    }
    let variablesReference = 0;
    if (typeof value === "object" && value != null) {
      variablesReference = this._nextObjectVariableRef;
      this._objectVariableRefMap.set(variablesReference, value);
      this._nextObjectVariableRef++;
    }
    const indexedVariables =
      typeof value === "object" && value != null && Array.isArray(value)
        ? value.length
        : 0;
    const namedVariables =
      typeof value === "object" && value != null && !Array.isArray(value)
        ? Object.keys(value).length
        : 0;
    const isTable = this.isTableRecord(value);
    const displayValue =
      value === undefined
        ? "undefined"
        : value === null
          ? "null"
          : isTable
            ? Object.keys(value as object).length > 0
              ? "{...}"
              : "{}"
            : typeof value === "object"
            ? Array.isArray(value)
              ? `[${value.length}]`
              : Object.keys(value).filter((k) => !k.startsWith("$")).length > 0
                ? "{...}"
                : "{}"
            : JSON.stringify(value);
    const displayType =
      value === undefined
        ? "undefined"
        : value === null
          ? "null"
          : isTable
            ? "object"
            : typeof value === "object"
            ? Array.isArray(value)
              ? `array`
              : "$type" in value && typeof value.$type === "string"
                ? value.$type
                : "object"
            : typeof value;
    return {
      scopePath,
      name,
      value: displayValue,
      type: displayType,
      variablesReference,
      indexedVariables,
      namedVariables,
      presentationHint,
    };
  }

  clearVariableReferences() {
    this._objectVariableRefMap.clear();
    this._nextObjectVariableRef = 2000;
  }

  getThreads(): Thread[] {
    const threads: Thread[] = [];
    const callStack = this._story.state.callStack;
    for (const thread of callStack._threads) {
      const threadId = thread.threadIndex;
      const name = this._story.debugFrames(threadId)?.at(-1)?.name;
      threads.push({
        id: threadId,
        name: name || "<unknown thread>",
      });
    }
    return threads;
  }

  protected getProgramStackTrace(
    program: ProgramStory,
    threadId: number,
    startFrame: number,
    levels?: number,
  ): { stackFrames: StackFrame[]; totalFrames: number } {
    const stackFrames: StackFrame[] = [];
    const frames = program.debugFrames(threadId);
    if (!frames) {
      return { stackFrames, totalFrames: 0 };
    }
    const top = frames.length - 1 - Math.max(0, startFrame);
    const bottom = levels ? Math.max(0, top - levels + 1) : 0;
    const ran =
      this._executingLocation && this._executingLocation[0] >= 0
        ? this._executingLocation
        : this.lastExecutedScriptLocation();
    const awaiting =
      threadId === program.state.callStack.currentThread.threadIndex
        ? this._awaiting
        : null;
    for (let i = top; i >= bottom; i--) {
      const f = frames[i]!;
      const location =
        (i === frames.length - 1 ? awaiting : null) ??
        this.scriptLocationOf(f.address >= 0 ? f.address : undefined) ??
        ran;
      const isFunction = f.type == PushPopType.Function;
      stackFrames.push({
        id: i,
        name: f.name || (isFunction ? "<unknown function>" : "<unknown tunnel>"),
        moduleId: isFunction ? "function" : "tunnel",
        presentationHint: "normal",
        location: this.getDocumentLocation(location),
      });
    }
    return { stackFrames, totalFrames: frames.length };
  }

  getStackTrace(
    threadId: number,
    startFrame: number = 0,
    levels?: number,
  ): { stackFrames: StackFrame[]; totalFrames: number } {
    return this.getProgramStackTrace(this._story, threadId, startFrame, levels);
  }

  protected Error(
    message: string,
    type: ErrorType,
    location: ScriptLocation | null = this._executingLocation,
  ) {
    if (type === ErrorType.Error) {
      this._runtimeErrorsReported += 1;
    }
    if (this._replaying) {
      this._routeErrors.push({
        at: this._checkpoints.length,
        error: { message, type, location: this.getDocumentLocation(location) },
      });
      return;
    }
    this.connection.emit(
      GameEncounteredRuntimeErrorMessage.type.notification({
        message,
        type,
        location: this.getDocumentLocation(location),
        state: this._state,
      }),
    );
  }

  log(message: unknown, severity: "info" | "warning" | "error" = "info") {
    this._context.system.log?.(message, severity);
  }

  startDebugging() {
    this._context.system.debugging = true;
  }

  stopDebugging() {
    this._context.system.debugging = false;
  }

  markPreviewing(previewAddress?: ProgramAddress): void {
    this._context.system.previewing =
      previewAddress != null ? previewAddress : true;
  }

  protected runPreview(previewAddress: ProgramAddress) {
    if (this._simulation === "success") {
      this.continue(true);
      return;
    }
    this.module.interpreter.clearQueuedBeats();
    this._startAddress = previewAddress;
    this.jumpTo(previewAddress, true);
    this.restoreReactiveTracking();
    this.continue();
  }

  get holdingFlush(): boolean {
    return this._holdingFlush;
  }

  async preview(
    file: string,
    line: number,
    runFrom?: ProgramAddress,
    address?: ProgramAddress,
  ): Promise<ProgramAddress | null> {
    if (this._state === "running") {
      return null;
    }
    const previewAddress =
      address ?? this.locator.addressAt(file, line, { beat: "last" });
    if (previewAddress == null) {
      this.cancelPreview();
      this.module.assets.releaseAbandonedGates();
      this.module.ui.reveal();
      return null;
    }
    if (this._previewedAddress === previewAddress) {
      return this._pendingPreview?.promise ?? previewAddress;
    }
    this.cancelPreview();
    this._previewFrom = address === undefined ? { file, line } : { file, line, address };
    this._previewAddress = previewAddress;
    this._executingAddress = null;
    this._executingLocation = [-1, -1, -1, -1, -1];
    this.endSimulation();
    if (this._state === "initial") {
      this._state = "previewing";
    }
    this._context.system.previewing = previewAddress;
    this._previewedAddress = previewAddress;
    const generation = ++this._previewGeneration;
    this._holdingFlush = true;
    let held: { instructions: Instructions | null } | null = null;
    try {
      this.observeScene(previewAddress);
      this.runPreview(runFrom ?? previewAddress);
    } finally {
      this._holdingFlush = false;
      held = this._held;
      this._held = null;
      this._coordinator = null;
    }
    const executed = this.executedParams();
    const gate = this.module.assets.gatePreviewBeat(
      held?.instructions ?? null,
    );
    this.clearChoices();
    if (!held) {
      this.finishPreview(previewAddress, executed);
      return previewAddress;
    }
    if (!gate) {
      this.displayHeld(held.instructions);
      this.finishPreview(previewAddress, executed);
      return previewAddress;
    }
    let cancel = () => {};
    const cancelled = new Promise<void>((resolve) => {
      cancel = resolve;
    });
    const waiting = this.displayWhenResident(
      previewAddress,
      generation,
      held.instructions,
      executed,
      gate,
      cancelled,
    );
    this._pendingPreview = {
      address: previewAddress,
      generation,
      promise: waiting,
      abandon: gate.abandon,
      cancel,
    };
    return waiting;
  }

  protected async displayWhenResident(
    previewAddress: ProgramAddress,
    generation: number,
    instructions: Instructions | null,
    executed: GameExecutedParams,
    gate: { settled: Promise<unknown>; release: () => void },
    cancelled: Promise<void>,
  ): Promise<ProgramAddress | null> {
    try {
      await Promise.race([gate.settled, cancelled]);
      if (generation !== this._previewGeneration || this._destroyed) {
        return null;
      }
      this.displayHeld(instructions);
    } finally {
      this.forgetPendingPreview(generation);
      this.module.ui.afterCompose(() => gate.release());
    }
    this.finishPreview(previewAddress, executed);
    return previewAddress;
  }

  protected forgetPendingPreview(generation: number): void {
    if (this._pendingPreview?.generation === generation) {
      this._pendingPreview = null;
    }
  }

  protected finishPreview(
    previewAddress: ProgramAddress,
    executed: GameExecutedParams,
  ): void {
    this.notifyExecuted(executed);
    for (const k of this._moduleNames) {
      this._modules[k]?.onPreview();
    }
    this._coordinator = null;
    this.notifyPreviewed(previewAddress);
  }

  protected cancelPreview(): void {
    this._previewGeneration += 1;
    this._previewedAddress = undefined;
    const pending = this._pendingPreview;
    if (pending) {
      this._pendingPreview = null;
      pending.abandon();
      pending.cancel();
    }
  }

  protected displayHeld(instructions: Instructions | null) {
    this._coordinator = null;
    if (instructions) {
      this._coordinator = new Coordinator(this, instructions);
      this.noteShownChoices(instructions);
      if (
        !this._coordinator.shouldContinue() &&
        (!(instructions.load || instructions.cutscene) ||
          (instructions.choices?.length ?? 0) > 0)
      ) {
        this.notifyAwaitingInteraction();
      }
    }
    this.checkpoint();
    if (!this._coordinator) {
      this.module.ui.reveal();
    }
  }

  getLastExecutedDocumentLocation() {
    const location = this.lastExecutedScriptLocation();
    return location ? this.getDocumentLocation(location) : null;
  }

  protected lastExecutedScriptLocation(): ScriptLocation | null {
    const lastExecuted = this._runtimeState.pathsExecutedThisFrame
      .toArray()
      .findLast(
        (entry): entry is ProgramAddress =>
          typeof entry === "number" &&
          this.scriptLocationOf(entry) !== undefined,
      );
    return lastExecuted != null
      ? (this.scriptLocationOf(lastExecuted) ?? null)
      : null;
  }

  scriptLocationOf(
    address: ProgramAddress | null | undefined,
  ): ScriptLocation | undefined {
    return Game.scriptLocationIn(
      this._scripts,
      this._positions.locator,
      address,
    );
  }

  documentLocationOf(
    address: ProgramAddress | null | undefined,
  ): DocumentLocation | null {
    const location = this.scriptLocationOf(address);
    return location ? this.getDocumentLocation(location) : null;
  }

  getDocumentLocation(location: ScriptLocation | null | undefined) {
    return Game.documentLocation(this._program, this._scripts, location);
  }

  protected scriptUri(scriptIndex: number | undefined) {
    return scriptIndex != null
      ? (this._scripts[scriptIndex] ?? this._program.uri)
      : this._program.uri;
  }

  protected static scriptLocationIn(
    scripts: readonly string[],
    locator: ProgramLocator,
    address: ProgramAddress | null | undefined,
  ): ScriptLocation | undefined {
    if (address == null) {
      return undefined;
    }
    const location = locator.locationOf(address);
    if (location) {
      const script = scripts.indexOf(location.uri);
      return [
        script < 0 ? 0 : script,
        location.startLine,
        location.startColumn,
        location.endLine,
        location.endColumn,
      ];
    }
    return undefined;
  }

  flowDocumentLocationOf(flow: string): DocumentLocation | null {
    const program = this._program;
    const location =
      program.knotLocations?.[flow] ||
      program.functionLocations?.[flow] ||
      program.sceneLocations?.[flow] ||
      program.branchLocations?.[flow];
    return location ? this.getDocumentLocation(location) : null;
  }

  static storyLocation(
    story: ProgramStory,
    program: SparkProgram,
  ): DocumentLocation | null {
    const positions = storyPositions(story, program);
    const scripts = Object.keys(program?.scripts ?? {});
    const location = Game.scriptLocationIn(
      scripts,
      positions.locator,
      positions.previous() ?? positions.current(),
    );
    return location ? Game.documentLocation(program, scripts, location) : null;
  }

  static documentLocation(
    program: SparkProgram,
    scripts: string[],
    location: ScriptLocation | null | undefined,
  ): DocumentLocation {
    const [scriptIndex, startLine, startColumn, endLine, endColumn] =
      location || [];
    const uri =
      scriptIndex != null ? (scripts[scriptIndex] ?? program.uri) : program.uri;
    return {
      uri,
      range: {
        start: {
          line: startLine ?? 0,
          character: startColumn ?? 0,
        },
        end: {
          line: endLine ?? 0,
          character: endColumn ?? 0,
        },
      },
    };
  }

}
