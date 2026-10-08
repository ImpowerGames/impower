import type { Message } from "@impower/jsonrpc/src/common/types/Message";
import type { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { ResponseError } from "@impower/jsonrpc/src/common/types/ResponseError";
import type {
  ProgramAddress,
  ProgramLocator,
} from "@impower/sparkdown/src/compiler/types/ProgramAddress";
import { type SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { resolveCompiledProgram } from "@impower/sparkdown/src/binary/programBinary";
import { ProgramStory } from "@impower/sparkdown/src/program/ProgramStory";
import type { ProgramImage } from "@impower/sparkdown/src/program/ProgramImages";
import type { ProgramRoot } from "@impower/sparkdown/src/program/ProgramRoot";
import {
  durableAddress,
  placeDurableAddress,
} from "@impower/sparkdown/src/program/ProgramSave";
import { chunkOfAddress } from "@impower/sparkdown/src/program/StatementChunk";
import {
  buildRouteSimulator,
  lastSearchStats,
  planRoute,
  type SearchOptions,
  type RoutePlan,
  type RouteResumePoint,
} from "@impower/sparkdown/src/compiler/utils/planRoute";
import type { SimulationError } from "@impower/sparkdown/src/compiler/types/SimulationError";
import { uuid } from "@impower/sparkdown/src/compiler/utils/uuid";
import { ErrorType as InkErrorType } from "@impower/sparkdown/src/inkjs/engine/Error";
import { InkObject } from "@impower/sparkdown/src/inkjs/engine/Object";
import { PushPopType } from "@impower/sparkdown/src/inkjs/engine/PushPop";
import { InkList, Story } from "@impower/sparkdown/src/inkjs/engine/Story";
import { StepLimitExceeded } from "@impower/sparkdown/src/inkjs/engine/StoryException";
import { VariablePointerValue } from "@impower/sparkdown/src/inkjs/engine/Value";
import { DEFAULT_MODULES } from "../../modules/DEFAULT_MODULES";
import { ErrorType } from "../enums/ErrorType";
import type { Breakpoint } from "../types/Breakpoint";
import type { DocumentLocation } from "../types/DocumentLocation";
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
import { possibleBreakpointLines } from "../utils/possibleBreakpointLines";
import {
  programAssignmentAddresses,
  programBreakpointLines,
  declaresName,
  programFunctionAddress,
  runsAfterReset,
} from "../utils/programBreakpoints";
import {
  validAddressPrefixLength,
  validRoutePrefixLength,
} from "../utils/routeResume";
import { storyPositions, type StoryPositions } from "../utils/storyPositions";
import { CheckpointStore } from "./CheckpointStore";
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

/** Whether a program engine's image stands right after the statement whose
 *  instruction ran last, at `address`: where a beat's image rests at its
 *  newline, and where it is placed after that statement in any program that
 *  still holds it and the statement after it (`PositionCopy.after`). */
const restsAfter = (
  state: unknown,
  address: ProgramAddress | undefined,
): boolean => {
  const position = (state as Partial<ProgramImage> | undefined)?.positional
    ?.position;
  return (
    typeof address === "number" &&
    position != null &&
    position.offset === 0 &&
    position.after === chunkOfAddress(address)
  );
};

/** A value the editor can receive and evaluate an expression against: a
 *  primitive, or plain data made of them, as a list or a divert target
 *  reads. */
const isEvaluable =(value: unknown, depth = 0): boolean => {
  if (value === undefined || typeof value === "function") {
    return false;
  }
  if (value === null || typeof value !== "object") {
    return true;
  }
  // A table is a `Map` of the runtime's own objects, and a structure nested
  // this deep is not a value an author reads in the console.
  if (value instanceof Map || value instanceof Set || depth > 8) {
    return false;
  }
  return Object.values(value).every(
    (item) => item === undefined || isEvaluable(item, depth + 1),
  );
};

/** Whether two locations are the same, nothing being the same as nothing. */
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

  protected _story!: Story;
  get story() {
    return this._story;
  }

  protected _scripts: string[] = [];
  get scripts() {
    return this._scripts;
  }

  protected _coordinator: Coordinator<typeof this> | null = null;

  /** While a preview's beat runs with its flush held back ({@link preview}):
   *  the flush that would build a coordinator is kept instead. */
  protected _holdingFlush = false;

  /** The flush a held run reached, if it reached one. */
  protected _held: { instructions: Instructions | null } | null = null;

  /** Counts previews, so one that starts while another waits for its
   *  pictures takes over, as does anything that changes what the wait
   *  would display into: a load, a recompile, a reset, a start, a connect,
   *  the game's destruction ({@link cancelPreview}). */
  protected _previewGeneration = 0;

  /** The preview waiting for its beat's pictures, if one is: what a repeat
   *  of its point settles with, the gate a take-over abandons, and the
   *  signal that ends its wait then. */
  protected _pendingPreview: {
    address: ProgramAddress;
    generation: number;
    promise: Promise<ProgramAddress | null>;
    abandon: () => void;
    cancel: () => void;
  } | null = null;

  /** The targets of the choices the last displayed beat presented, which
   *  the next preview clears before it waits ({@link clearChoices}). Kept
   *  on the game rather than in a module's state: a loaded checkpoint
   *  replaces that state while the choices stay on the page. */
  protected _shownChoices: string[] = [];

  /**
   * How many times one uninterrupted stretch of execution may advance the
   * story before it is stopped as a runaway.
   *
   * An author can write a story that never ends, so execution needs a ceiling.
   * Counting work rather than elapsed time makes the ceiling mean the same
   * thing on an idle machine and a busy one, which is what keeps it from
   * mistaking a long scene for a loop.
   *
   * The unit is one iteration of the loop in `stepWithinBudget`, which is not
   * the same as a display line or a runtime path. Replaying a scene of plain
   * display lines, each lowered to a `display()` call as the editor compiles
   * it, costs about 37 iterations per line (73,961 at 2,000 lines), which puts
   * a 20,000-line replay near 740,000.
   *
   * Calibrate against what the EDITOR compiles. Setting this ceiling from a
   * program coarser than the editor's is exactly what shipped the planner's
   * ceiling several times too small.
   *
   * Two million is about two and a half times a 20,000-line replay, so a
   * replay to a line more than about 54,000 lines into one scene is stopped
   * and reported as a possible infinite loop whether or not it loops: the
   * ceiling counts work and cannot tell. What it costs when it does fire is
   * worth stating plainly rather
   * than hand-waving: an iteration runs in about 4 µs for a content-free loop
   * (roughly eight seconds at this ceiling) but around 50 µs for a replay that
   * captures a checkpoint every beat, which is minutes. A replay only diverges
   * if its plan has gone stale, so that shape is rare — but this ceiling is not
   * a fast guard, and on the PLAY path it blocks the interface thread (#385).
   */
  protected _executionStepLimit = 2_000_000;

  protected _executionStepsRemaining = 2_000_000;

  /**
   * How deeply calls may nest before the run is stopped as a stack overflow.
   * Far deeper than any recursion a story needs, and shallow enough that
   * recursion which never ends stops well inside the step ceiling: a call that
   * displays a line takes about sixty advances, so this depth costs about a
   * seventh of the ceiling, and the ceiling's minutes would hold up the
   * preview's worker and every program after it (#1072).
   */
  protected _callDepthLimit = 5_000;

  protected _executionBudgetExhausted = false;

  protected _executingAddress: ProgramAddress | null = null;
  /** The address of the position executed most recently. */
  get executingAddress() {
    return this._executingAddress;
  }

  /** Where the story stands, in the addresses of the engine that runs it,
   *  and the accessor that places them in the source. */
  protected _positions!: StoryPositions;
  get locator(): ProgramLocator {
    return this._positions.locator;
  }

  /** Which top-level flow the story is in, and when that changes
   *  (`Module.onEnterScene`). Fed from every place the position can move. */
  protected _sceneTracker = new SceneTracker((flow) =>
    this.isFunctionFlow(flow),
  );
  get sceneTracker() {
    return this._sceneTracker;
  }

  protected _executingLocation: ScriptLocation | null = null;

  protected _runtimeErrorsReported = 0;
  /** How many runtime errors (not warnings) the game has reported, so a caller
   *  can tell whether a failure it caught was already reported. */
  get runtimeErrorsReported() {
    return this._runtimeErrorsReported;
  }

  protected _runtimeState: RuntimeState = new RuntimeState();
  get runtimeState() {
    return this._runtimeState;
  }

  protected _lastHitBreakpointLocation: ScriptLocation | null = null;

  /** Whether the debugger has heard a stop (a step's or a breakpoint's)
   *  since the current `step` began. */
  protected _announcedStop = false;

  protected _nextObjectVariableRef = 2000; // Start at 2000 to avoid conflicts with scope handles

  protected _objectVariableRefMap = new Map<number, object>();

  protected _startFrom?: {
    file: string;
    line: number;
  };
  get startFrom() {
    return this._startFrom;
  }

  /** Which beat of its line `setStartFrom` last started at, so a program
   *  for the other engine can resolve the same start point. */
  protected _startBeat: "first" | "last" = "first";

  protected _previewFrom?: {
    file: string;
    line: number;
  };
  get previewFrom() {
    return this._previewFrom;
  }

  protected _previewAddress?: ProgramAddress;
  get previewAddress() {
    return this._previewAddress;
  }

  /** The address `preview()` last ran to completion, so asking for it again
   *  is a no-op. Kept apart from `context.system.previewing` — that one
   *  answers "is this a preview rather than a real run", which callers must
   *  be able to establish BEFORE a preview point has been chosen (see
   *  `markPreviewing`). */
  protected _previewedAddress?: ProgramAddress;
  get previewedAddress() {
    return this._previewedAddress;
  }

  /** The flow the route to the start point starts at the top of. */
  protected _simulateFlow?: string | null;
  get simulateFlow() {
    return this._simulateFlow;
  }
  set simulateFlow(value) {
    this._simulateFlow = value;
  }

  /** The address the story starts at, and a route to it ends at: the beat a
   *  line starts (`setStartFrom`), or a flow. */
  protected _startAddress?: ProgramAddress | null;
  get startAddress() {
    return this._startAddress;
  }

  protected _breakpointMap: Record<number, Map<number, Breakpoint>> = {};

  protected _functionBreakpointMap: Record<number, Map<number, Breakpoint>> =
    {};

  protected _dataBreakpointMap: Record<number, Map<number, Breakpoint>> = {};

  /** On the program engine, the addresses of the line and function
   *  breakpoints, by kind, which `_breakAddresses` joins: the game stops
   *  after a step that ran an instruction whose address it holds. The line
   *  maps above are the current engine's and stay empty here. */
  protected _lineBreakAddresses = new Set<number>();
  protected _functionBreakAddresses = new Set<number>();
  protected _breakAddresses = new Set<number>();

  /** The addresses of the instructions the program engine's current step
   *  ran (`ProgramStory.executedLog`), reused from step to step. */
  protected _executedLog: number[] = [];

  /** On the program engine, the variables the data breakpoints watch: a
   *  global by its name, or a temporary of the frame named `scope`, with
   *  the value object each held when the game last looked and, for a
   *  temporary, the block scope it was found in (`readWatch`). */
  protected _dataWatches: {
    scope?: string;
    name: string;
    last: unknown;
    binding: Map<string, InkObject> | null;
    /** The addresses of the declarations of a temporary's name in the code
     *  its frame runs, apart from those that bind a function's parameters:
     *  where it is declared again rather than written. */
    redeclarations: ReadonlySet<number>;
  }[] = [];

  protected _simulation?: "none" | "simulating" | "success" | "fail";
  get simulation() {
    return this._simulation;
  }
  set simulation(value) {
    this._simulation = value;
  }

  /** Whether a route replay is running now. The replay is one synchronous run
   *  whose beats nothing displays, so while it lasts the UI module buffers no
   *  operation and the game reports no execution. */
  protected _replaying = false;
  get replaying() {
    return this._replaying;
  }

  /** The runtime errors and warnings the route replays raised, each with the
   *  number of checkpoints saved before it was raised. A replay that resumes
   *  from a checkpoint runs again only what came after that checkpoint, so it
   *  keeps what the steps before it raised and drops the rest. */
  protected _routeErrors: { at: number; error: SimulationError }[] = [];

  /** The errors that stopped the last search for a route, when it found
   *  none. Kept apart from the replay's record, which a later replay of the
   *  route already planned resumes. */
  protected _searchErrors?: SimulationError[];

  /** The runtime errors and warnings the route to the start point raised, in
   *  the order the replay raised them, or, when the search found no route, the
   *  errors that stopped it. A replay reports these here rather than as it
   *  raises them: nothing shows its beats, and the game that shows the start
   *  point reports them as part of its own run. */
  get routeErrors(): SimulationError[] {
    return this._searchErrors ?? this._routeErrors.map((e) => e.error);
  }

  /** The errors that stopped the route search that just returned, where the
   *  statements that raised them are in `program`. A search that found no
   *  route and raised an error was stopped by it on the way, since an error
   *  ends the story; what it raised on the branches it abandoned for a route
   *  it found is not the author's to see. */
  searchErrors(): SimulationError[] {
    return lastSearchStats.errors.map(({ message, address }) => ({
      message,
      type: ErrorType.Error,
      location: this.getDocumentLocation(this.scriptLocationOf(address)),
    }));
  }

  /** Why the last attempt to simulate a route gave up. Recorded where the
   *  giving-up happens, because that is the only place that still knows: by the
   *  time `_simulation` is flipped to `"fail"` — in `start()` or `preview()`,
   *  which is where the editor learns about it — every distinguishing detail is
   *  gone. Only meaningful while `_simulation` is `"fail"`. */
  protected _simulationFailure?: SimulationFailure;
  get simulationFailure() {
    return this._simulationFailure;
  }
  /** Settable for the same reason `simulation` is: in the editor's preview the
   *  route is planned in the compile worker, not here, so the host that made
   *  the attempt is the one that knows how it went. */
  set simulationFailure(value) {
    this._simulationFailure = value;
  }

  /** Whether `game/executed` carries what the editors draw: the executed
   *  lines, the last executed path and the conditions. The host turns it off
   *  while the game displays a suggestion, whose report only labels the
   *  preview with its first and last location. */
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

  // The context revision (#654) the define tables currently in `_context` were
  // built from, and how many times they have been built on this Game. The
  // count is what a test reads to prove an edit that changed no definition did
  // not rebuild them.
  protected _definesContextRevision?: string;
  protected _definesContextBuilds = 0;
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
  /** The route the last replay followed, or nothing when none has run. Read by
   *  a caller deciding whether to plan another; it is the game's own record, so
   *  a reader must not hold it across a replay. */
  get plannedRoute(): RoutePlan | null {
    return this._plannedRoute;
  }

  /** Which compile the planned route was replayed in
   *  (`SparkProgram.changes.id`). A later compile says which program its own
   *  changes are measured against, and only a route replayed in THAT program
   *  can be read against them. */
  protected _plannedRouteChangeId?: number;

  /** On the program engine, the root the planned route was replayed in,
   *  where its steps' addresses stand (`validAddressPrefixLength`). */
  protected _plannedRouteRoot?: ProgramRoot;

  protected _plannedRouteStepCursor: number = 0;

  protected _plannedRouteStepMap: { [seq: string]: number } = {};

  /** Per checkpoint, the planned-route step the story was about to run when it
   *  was captured; see {@link checkpoint}. */
  protected _checkpointStepCursors: (number | undefined)[] = [];

  protected _checkpoints!: CheckpointStore;
  get checkpoints() {
    return this._checkpoints;
  }

  // Whether a program that carries statement chunks runs on the program
  // engine (`GameConfiguration.programChunks`), as every host's game does.
  protected _programChunks = true;

  // The game's own version string (`GameConfiguration.version`).
  protected _version = "";
  // How many beats a save on the program engine holds, and how many the
  // story keeps restorable during play (docs/engine/binary-program.md,
  // section 7).
  protected _saveHistory = 16;
  protected _rewindBeats = 128;

  /** The story when it is the program engine's, which keeps images of its
   *  beats: the checkpoints are its images, and a save is its durable save
   *  (docs/engine/binary-program.md, section 7). */
  get programStory(): ProgramStory | null {
    const story: unknown = this._story;
    return story instanceof ProgramStory ? story : null;
  }

  constructor(
    options: { program: SparkProgram; story?: Story } & GameConfiguration &
      SystemConfiguration & {
        modules?: {
          [name in keyof T]: abstract new (...args: any) => T[name];
        };
      },
  ) {
    this._programChunks = options.programChunks ?? true;
    this._version = options.version ?? "";
    this._saveHistory = options.saveHistory ?? 16;
    this._rewindBeats = options.rewindBeats ?? 128;
    this._program = this.updateProgram(options.program, options.story);

    // Create connection for sending and receiving messages
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
    this.updateFunctionBreakpointsMap(options?.functionBreakpoints ?? []);
    this.updateDataBreakpointsMap(options?.dataBreakpoints ?? []);

    if (options?.executionStepLimit != null) {
      this._executionStepLimit = options.executionStepLimit;
    }
    this._executionStepsRemaining = this._executionStepLimit;

    const game = this;
    this._checkpoints = new CheckpointStore(
      {
        // A story that keeps images is checkpointed by its beats' images.
        get captureImage() {
          const story = game.programStory;
          return story
            ? (keyframe: boolean) => story.captureBeat(keyframe)
            : undefined;
        },
        saveWithoutStory: (omitDeltaState) =>
          this.buildSave(omitDeltaState, false),
        storyOfImage: (image) =>
          this.programStory?.saveOfImage(image as ProgramImage, this._version) ??
          null,
        durableExecuted: (executed) => this.durableExecuted(executed),
        save: () => this.save(),
        saveDeltaBody: () => this.saveDeltaBody(),
        snapshotCounts: () => ({
          vc: this._story.state.GetVisitCountEntries(),
          ti: this._story.state.GetTurnIndexEntries(),
        }),
        drainCountDeltas: () => ({
          vc: this._story.state.DrainVisitCountDeltas(),
          ti: this._story.state.DrainTurnIndexDeltas(),
        }),
        snapshotRuntime: () => this._runtimeState.snapshotFull(),
        drainRuntime: () => this._runtimeState.drainDeltas(),
      },
      {
        incremental: options?.incrementalCheckpoints ?? false,
        verify: options?.verifyCheckpoints ?? true,
        baseInterval: options?.checkpointBaseInterval ?? 50,
      },
    );

    // Create context
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
      },
    };

    // Build the runtime context entirely from the compiler's dedicated engine
    // channels — NOT the LSP-only `program.context` (the Game runtime no longer
    // depends on that field). Together these channels cover every context type:
    //   defines  — define-typed structs (animation/character/ease/config/…),
    //              fully merged with builtin $defaults
    //   assets   — file-derived + implicit-def assets (image/audio/font/…)
    //   layouts/components/styles — static UI structs
    // Mutable interpreter state (visited/returned/…) is written onto this object
    // by the modules at runtime; it was never part of program.context.
    this.assignContextChannels();

    // Override default modules with custom ones if specified
    const allModules = {
      ...modules, // custom modules should be first in call order
      ...DEFAULT_MODULES,
      ...modules, // custom modules should override default modules if specified
    };
    const moduleNames = Object.keys(allModules);
    // Instantiate all modules
    for (const key of moduleNames) {
      const name = key as keyof typeof allModules;
      const ctr = allModules[name];
      if (ctr) {
        this._modules[name] = new ctr(this);
      }
    }
    // Register builtins of all modules
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
          // A clock source reads in seconds, and `now` in milliseconds.
          get currentTime() {
            return system.now() / 1000;
          },
        },
        (callback: () => void) => system.requestFrame?.(callback) ?? 0,
      );
    }
  }

  updateProgram(program: SparkProgram, story?: Story) {
    // A preview waiting for its pictures would display a beat of the old
    // program.
    this.cancelPreview();
    this._program = program;
    const chunks =
      this._programChunks && !program.fallback ? program.chunks : undefined;
    // Resolved ONCE: with the binary path (#314) this materializes the buffer,
    // so testing it repeatedly would re-walk the whole program.
    const compiled =
      story || chunks ? undefined : resolveCompiledProgram(program);
    if (!story && !compiled && !chunks) {
      throw new Error(
        "Program must be successfully compiled before it can be run",
      );
    }
    this._scripts = Object.keys(this._program.scripts);
    // Which engine ran the program before, when one did: a compile that
    // falls back, or one that comes back to its chunks, switches the game
    // from one engine to the other (#1663).
    const ranProgramEngine = this._story ? this.programStory !== null : null;

    if (chunks) {
      // The program engine presents the members of `Story` this game reads
      // on the paths it runs (see `ProgramStory`). It shares the pristine
      // copies its images read with the engine of the program before, so a
      // checkpoint taken there restores here for every statement this
      // program kept (`restoreCheckpoint`), and it keeps the image of each
      // beat, which a checkpoint and a save at a menu hold.
      const previous = this.programStory;
      const engine = new ProgramStory(chunks, {
        images: previous?.images,
        history: previous?.history,
        saveHistory: this._saveHistory,
        rewindBeats: this._rewindBeats,
      });
      engine.keepBeatImages = true;
      this._story = engine as unknown as Story;
    } else if (story) {
      this._story = story;
    } else if (compiled) {
      this._story = new Story(compiled);
    }
    this._positions = storyPositions(this._story, this._program);
    this.setupStory(this._story);
    this.restoreReactiveTracking();
    // The breakpoints set last resolve against this program: on the program
    // engine a statement the compile emitted again has new addresses, and a
    // compile that falls back to the current engine, or comes back from it,
    // needs the other engine's form of them.
    this.resolveBreakpoints();
    if (ranProgramEngine !== null && ranProgramEngine !== !!this.programStory) {
      this.forgetOtherEngine();
    }
    // Live edit → recompile reuses this Game: refresh the context channels from
    // the new program and let modules re-derive any state cached from context
    // (e.g. InterpreterModule's character-name map). Guarded on modules already
    // existing — the constructor calls updateProgram BEFORE building the context
    // + instantiating modules (it assigns channels itself, after).
    if (this._moduleNames && this._moduleNames.length > 0) {
      this.assignContextChannels();
      for (const moduleName of this._moduleNames) {
        this._modules[moduleName]?.onProgramUpdate();
      }
      // The program (and its freshly-installed story) changed, so any earlier
      // preview's result is stale even when the next preview resolves to the
      // SAME path — an intra-line edit keeps the structural path while changing
      // the text. Clearing the memo makes `preview()`'s same-path short-circuit
      // miss, so it re-runs the new story and re-emits the beat's content;
      // without this the reconcile pass sweeps the un-re-emitted elements and
      // the preview goes blank until the cursor moves to a different beat.
      this._previewedAddress = undefined;
      // The scene map may have changed with the program; the next observation
      // re-enters the current scene and re-requests what it needs.
      this._sceneTracker?.reset();
    }
    return this._program;
  }

  /**
   * Drop what the game holds in the form of the engine it ran before
   * `updateProgram` gave it a program for the other one (#1663). The program
   * engine names a position by a number and keeps its checkpoints as images,
   * and the current engine names one by a runtime path and keeps saves, so
   * neither engine can read the other's start address, checkpoints, planned
   * route or record of executed positions. The new story stands at its
   * start, so the game is put where a fresh game given the program is: its
   * start point resolved again on this engine, and no route replayed.
   */
  protected forgetOtherEngine() {
    this._checkpoints.truncate(0);
    this._checkpointStepCursors.length = 0;
    this._plannedRoute = null;
    this._plannedRouteChangeId = undefined;
    this._plannedRouteRoot = undefined;
    this._plannedRouteStepMap = {};
    this._plannedRouteStepCursor = 0;
    this._routeErrors = [];
    this._searchErrors = undefined;
    this._simulation = undefined;
    this._simulationFailure = undefined;
    this._simulateFlow = undefined;
    this._runtimeState = new RuntimeState();
    this._executingAddress = null;
    this._executingLocation = null;
    this._previewAddress = undefined;
    this._previewedAddress = undefined;
    // What a route replayed on the other engine left in the modules (a beat
    // still queued, the state its checkpoints saved) belongs to a run the
    // new story never made: they go back to what a game that has never run
    // holds, as a route replayed from its start puts them (`replayRoute`).
    if (this._moduleNames && this._moduleNames.length > 0) {
      this.module.interpreter.clearQueuedBeats();
      for (const k of this._moduleNames) {
        this._modules[k]?.load({});
      }
    }
    if (this._startFrom) {
      this.setStartFrom(this._startFrom, this._startBeat);
    }
  }

  /** Assign the program's channels (defines → character/image/…, assets,
   *  layout/component/style) onto the runtime context. Defines are sourced from
   *  the live runtime `__def` tables (assignRuntimeDefines); the rest come from
   *  the static engine channels. Runtime-mutated state (visit counts, …) lives
   *  under separate keys and is preserved. */
  protected assignContextChannels() {
    const assignChannel = (src?: { [type: string]: any }) => {
      if (src) {
        for (const [type, structs] of Object.entries(src)) {
          this._context[type] = structs;
        }
      }
    };
    // Defines (character/animation/ease/config/…) come from the LIVE runtime
    // __def tables: the story's __def calls resolve authored→builtin inheritance
    // via the VM __index chain and carry the richer values the lossy compile-time
    // channel dropped. (The static `program.defines` channel was retired once
    // this path proved byte-identical — see buildContextFromStory.)
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

  /** Source the define context from the live runtime `__def` tables
   *  (buildDefinesContext). Each define type is replaced wholesale so a live edit
   *  that removes/renames a define doesn't leave a stale entry. Requires the
   *  program to have been compiled with `seedBuiltinsIntoStory` so builtin
   *  defaults are present in the story VM. No-op when the story has no globals yet
   *  (e.g. an uncompiled program). */
  protected assignRuntimeDefines() {
    const globals = this._story?.state?.variablesState?.["_globalVariables"];
    if (!globals || globals.size === 0) {
      return;
    }
    // A program carries the revision of the context it was compiled with
    // (#654). The define tables this produces are a function of that context
    // alone, and the revision is keyed by every declaration a define's value
    // can be computed from, so a program carrying the revision the tables
    // already in `_context` were built from leaves them in place. They are
    // plain JS all the way down (`convertValue` converts every runtime value
    // and drops methods), so nothing in them points at the replaced story.
    // Rebuilding them cost 14 to 20 ms in the worker's game and 12 to 16 ms
    // again on the page, on every keystroke, for a project the size of Raffles
    // and Bunny.
    const revision = this._program?.contextRevision;
    if (revision !== undefined && revision === this._definesContextRevision) {
      return;
    }
    const runtime = buildDefinesContext(this._story);
    // A program compiled WITHOUT `seedBuiltinsIntoStory` still has authored
    // globals, so the empty-map bail above doesn't catch it — it just yields a
    // define context with every builtin type (colors, `synth`, `character`,
    // `config`…) silently absent, which surfaces far downstream as missing
    // defaults. Warn loudly instead of failing quietly; every in-repo host
    // sets the flag, so this fires only for an external embedder's mistake.
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
  }

  setupStory(story: Story) {
    story.collapseWhitespace = false;
    story.processEscapes = false;
    story.onError = (message, type, _source, raised) => {
      // The story reports its errors as the step that raised them ends, before
      // that step's location is recorded, so an error names the content that
      // raised it, and the last recorded step only when that content has no
      // location.
      this.Error(
        raised?.message ?? message,
        type === InkErrorType.Warning ? ErrorType.Warning : ErrorType.Error,
        this.scriptLocationOf(
          this.programStory
            ? (raised?.address ?? this._positions.previous())
            : raised?.path,
        ) ?? this._executingLocation,
      );
    };
    // The program engine calls no hook per step: the game reads the address
    // of each step it takes (`stepWithinBudget`), which records it and
    // compares it with the breakpoints' addresses. The current engine
    // builds the path it names a step by only for a hook.
    const engine: unknown = story;
    story.onExecute =
      engine instanceof ProgramStory
        ? null
        : (((address: ProgramAddress | undefined) => {
            if (address != null && address !== "") {
              this._runtimeState.recordExecution(address);
            }
          }) as never);
    story.onMakeChoice = (choice) => {
      this._runtimeState.recordChoice(story, choice);
    };
    story.onEvaluateCondition = (value) => {
      this._runtimeState.recordCondition(value);
    };
  }

  simulate(
    simulationOptions?: Record<
      string,
      {
        favoredConditions?: (boolean | undefined)[];
        favoredChoices?: (number | undefined)[];
      }
    >,
  ) {
    this._simulation = "simulating";
    this._simulationFailure = undefined;
    if (this._startAddress != null) {
      // Plan a route from the top of the flow the start point stands in.
      const to = this._startAddress;
      const from = this.routeStartOf(to);
      const route = Game.planRoute(
        this._story,
        this._program,
        from,
        to,
        simulationOptions,
        // The replay below starts by loading a checkpoint or jumping to the
        // route's start, either of which replaces the story state, so the
        // search need not restore one of its own first.
        { callerResetsStory: true },
      );
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

  /**
   * Turn a route search that came back empty into the reason it did.
   *
   * Checking whether the target is a real address first is not
   * belt-and-braces: a line that is not part of the story flow (front matter,
   * a `define` block, the gap between scenes) resolves to the `"0"` fallback,
   * and the search that
   * then runs is searching for a target that was never in the story. Whatever
   * ceiling it stops on, the honest answer is that there was nothing to route
   * to — not that the scene is too long.
   *
   * Every ceiling collapses to `"timeout"` because they are one thing to the
   * author: the search gave up before it had finished looking, so whether a
   * route exists is still unknown. Which ceiling it was is a fact about the
   * planner, and `lastSearchStats.endReason` still carries it for anyone
   * debugging one.
   *
   * A search that BROKE is kept apart from one that ran the story out, because
   * only the second is entitled to say the script has no path to the line.
   */
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

  /** A top-level flow the story calls and returns from rather than enters:
   *  a `function`, a binding evaluator, or a synthetic flow. */
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

  /** The top-level flow an address stands in: a scene's name, a branch's
   *  scene's, a function's, or `"0"` for the top-level content
   *  (`ProgramLocator.sceneAt`). Null for no address. */
  sceneOf(address: ProgramAddress | null | undefined): string | null {
    return address == null || address === ""
      ? null
      : (this._positions.locator.sceneAt(address) ?? null);
  }

  /** The flow a route to `address` starts at the top of: the scene the
   *  address stands in, or the top-level content. */
  routeStartOf(address: ProgramAddress): string {
    return this.sceneOf(address) ?? "0";
  }

  /** The scenes of the positions on the call stack: where every open
   *  tunnel, thread, and function call will return to, plus the current
   *  position. */
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

  /** Note where the story is; when that is a different scene, tell every
   *  module. A route simulation is silent: it never enters anything. */
  observeScene(address: ProgramAddress | null | undefined): void {
    if (this._destroyed || this._simulation === "simulating") {
      return;
    }
    // This runs on every position change in the step loop; the call stack is
    // walked only when the scene actually changes. A call into a function
    // keeps the scene current, as `SceneTracker.observe` rules with the same
    // `isFunctionFlow` predicate, so every step inside one returns here too:
    // walking the stack on each would make recursion cost the square of its
    // depth.
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
    // The connect restores what the page shows; a preview waiting from
    // before it would display its beat over the restored state.
    this.cancelPreview();
    // The connect clears every transient target, the choice slots among
    // them, out of the page and out of the module's state, so the choices
    // the last beat presented are gone before the restore.
    this._shownChoices = [];
    this._connection.connectOutput(send);
    // Everything the connect restores, and whatever it goes on to display,
    // is a new stream: what the last one still had in flight must not land
    // on it.
    const epoch = this._connection.beginEpoch();
    // Before the modules connect, so the scene's assets are requested before
    // the restore gate waits on the ones already on screen.
    const previewing = this._context.system.previewing;
    this.observeScene(
      typeof previewing === "string" || typeof previewing === "number"
        ? previewing
        : this._positions.current(),
    );
    await Promise.all(
      this._moduleNames.map((moduleName) =>
        this._modules[moduleName]?.onConnected(),
      ),
    );
    // A newer connect began while this one waited (for the main layout's
    // fonts, or the restore gate): that connect restores the page, and this
    // one's restore would reach the page stamped as the newer stream.
    if (this._connection.epoch !== epoch) {
      return;
    }
    await this.restore();
  }

  /** Where a run from `startFrom` begins: the address of the beat on the
   *  line (`ProgramLocator.addressAt`), or the top-level content's flow when
   *  the line has none. A line that `>` breaks holds several beats: PLAY
   *  from the line starts at its first, and the route a preview of the line
   *  replays ends at its last (`beat`), so the beats before it run, and
   *  apply what they do, as any beat on the route does. */
  setStartFrom(
    startFrom: { file: string; line: number },
    beat: "first" | "last" = "first",
  ) {
    this._startFrom = startFrom;
    this._startBeat = beat;
    this._startAddress =
      this.locator.addressAt(startFrom.file, startFrom.line, { beat }) ?? "0";
    const trueLocation = this.locator.locationOf(this._startAddress);
    if (trueLocation) {
      this._startFrom = { file: trueLocation.uri, line: trueLocation.startLine };
      return this._startFrom;
    }
    return null;
  }

  /** The lines of `search` a debugger may set a breakpoint on: on the
   *  program engine, the lines its chunks' line tables start rows on. */
  possibleBreakpointLines(search: {
    uri: string;
    range: { start: { line: number }; end: { line: number } };
  }): number[] {
    const program = this.programStory;
    if (program) {
      return programBreakpointLines(program.root, search);
    }
    return possibleBreakpointLines(
      this._program.pathLocations,
      this._scripts,
      search,
    );
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

  /** The breakpoints the debugger set last, which a program that arrives
   *  resolves again, since an edited statement's chunk has new addresses. */
  protected _requestedBreakpoints: {
    lines: { file: string; line: number }[];
    functions: { name: string }[];
    data: { dataId: string }[];
  } = { lines: [], functions: [], data: [] };

  /** Resolves the breakpoints set last against the program now loaded. */
  protected resolveBreakpoints() {
    this.updateBreakpointsMap(this._requestedBreakpoints.lines);
    this.updateFunctionBreakpointsMap(this._requestedBreakpoints.functions);
    this.updateDataBreakpointsMap(this._requestedBreakpoints.data);
  }

  /** Whether a breakpoint of the current engine is set, each of which is a
   *  line the game compares with the line of every step. */
  protected _hasLineBreakpoints = false;

  /** Joins the program engine's breakpoint addresses of every kind, and
   *  notes whether the current engine has a breakpoint set. */
  protected joinBreakAddresses() {
    this._breakAddresses = new Set([
      ...this._lineBreakAddresses,
      ...this._functionBreakAddresses,
    ]);
    const any = (map: Record<number, Map<number, Breakpoint>>) =>
      Object.values(map).some((lines) => lines.size > 0);
    this._hasLineBreakpoints =
      any(this._breakpointMap) ||
      any(this._functionBreakpointMap) ||
      any(this._dataBreakpointMap);
  }

  /**
   * The value object a data breakpoint's variable holds now, and whether it
   * was read from the binding the watch read last. A global is read by its
   * name. A temporary is read from the block scope that held it when the
   * watch last found it, while a frame named by the watch's scope still
   * holds that block scope, so a temporary of the same name declared in an
   * inner block shadows it without being it; otherwise it is found anew, in
   * the innermost frame named by the scope, from its innermost block scope
   * out. Nothing when no such variable is in scope.
   */
  protected readWatch(
    program: ProgramStory,
    watch: (typeof this._dataWatches)[number],
  ): { value: unknown; same: boolean } {
    if (watch.scope === undefined) {
      const value =
        program.state.variablesState.GetGlobalVariableValue(watch.name) ??
        undefined;
      return { value, same: true };
    }
    const callStack = program.state.callStack;
    const frames =
      program.debugFrames(callStack.currentThread.threadIndex) ?? [];
    const named = frames.filter((frame) => frame.name === watch.scope);
    // A temporary bound to a pointer (a variable passed by reference, or
    // one a closure captured, as the current engine binds it) is read
    // through it, since a write through it leaves the pointer in place.
    const resolve = (value: InkObject | undefined): unknown =>
      value instanceof VariablePointerValue
        ? (program.state.variablesState.ValueAtVariablePointer(value) ??
          undefined)
        : value;
    const bound = watch.binding;
    if (
      bound &&
      bound.has(watch.name) &&
      named.some((frame) => frame.element.temporaryScopes.includes(bound))
    ) {
      return { value: resolve(bound.get(watch.name)), same: true };
    }
    watch.binding = null;
    const innermost = named.at(-1);
    const scopes = innermost?.element.temporaryScopes ?? [];
    for (let s = scopes.length - 1; s >= 0; s -= 1) {
      const value = scopes[s]!.get(watch.name);
      if (value !== undefined) {
        watch.binding = scopes[s]!;
        return { value: resolve(value), same: false };
      }
    }
    return { value: undefined, same: false };
  }

  /** Notes what each data breakpoint's variable holds now, so that only a
   *  step that writes it stops the game: a load, a jump or a replay between
   *  steps changes it without a step. */
  protected refreshDataWatches() {
    const program = this.programStory;
    if (!program) {
      return;
    }
    for (const watch of this._dataWatches) {
      watch.last = this.readWatch(program, watch).value;
    }
  }

  /** Whether a data breakpoint's variable holds another value than it did,
   *  noting what each holds now. A variable that comes into scope, goes out
   *  of it, or is found in another binding is declared, dropped or shadowed
   *  rather than written. */
  protected dataWatchesChanged(): boolean {
    const program = this.programStory;
    if (!program) {
      return false;
    }
    let changed = false;
    for (const watch of this._dataWatches) {
      const { value, same } = this.readWatch(program, watch);
      if (
        same &&
        value !== undefined &&
        watch.last !== undefined &&
        value !== watch.last &&
        // A temporary declared again in its own block is a new variable in
        // the same block scope, not a write to the one watched: the step ran
        // one of the declarations of its name in the code its frame runs
        // (a function it calls declares in a frame of its own).
        !this._executedLog.some((address) => watch.redeclarations.has(address))
      ) {
        changed = true;
      }
      watch.last = value;
    }
    return changed;
  }

  /** A breakpoint that stops at `address`, placed on the line it stands on,
   *  or an unverified one with `message` when there is no such address. */
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

  /** Of `addresses`, the one that stands first in the source: in the first
   *  script of the program, on the first line and column. */
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
    if (program) {
      // A line's breakpoint is the address `addressAt` gives it: a beat's
      // `LineStart`, or the start of the statement or part on the line.
      this._breakpointMap = {};
      this._lineBreakAddresses = new Set();
      const actual = breakpoints.map((b) => {
        const address = program.root.addressAt(b.file, b.line, {
          functions: true,
        });
        // A declaration runs when the story is reset, before a debugger can
        // stop it, so a breakpoint there would never stop. (A function
        // written in a declaration is a body of its own, which runs when it
        // is called.)
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
    this._lineBreakAddresses = new Set();
    const actualBreakpoints = Game.getActualBreakpoints(
      this.locator,
      breakpoints,
    );
    const breakpointMap: Record<number, Map<number, Breakpoint>> = {};
    for (const b of actualBreakpoints) {
      if (b.location?.uri) {
        const scriptIndex = this._scripts.indexOf(b.location.uri);
        if (scriptIndex >= 0) {
          breakpointMap[scriptIndex] ??= new Map();
          if (b.location.range.start.line != null) {
            breakpointMap[scriptIndex].set(b.location.range.start.line, b);
          }
        }
      }
    }
    this._breakpointMap = breakpointMap;
    this.joinBreakAddresses();
    return actualBreakpoints;
  }

  protected updateFunctionBreakpointsMap(
    functionBreakpoints: { name: string }[],
  ) {
    this._requestedBreakpoints.functions = functionBreakpoints;
    const program = this.programStory;
    if (program) {
      // A function's breakpoint is the address its code starts at.
      this._functionBreakpointMap = {};
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
    this._functionBreakAddresses = new Set();
    const actualBreakpoints = Game.getActualFunctionBreakpoints(
      this._program.functionLocations,
      functionBreakpoints,
      this._scripts,
    );
    const breakpointMap: Record<number, Map<number, Breakpoint>> = {};
    for (const b of actualBreakpoints) {
      if (b.location?.uri) {
        const scriptIndex = this._scripts.indexOf(b.location.uri);
        if (scriptIndex >= 0) {
          breakpointMap[scriptIndex] ??= new Map();
          if (b.location.range.start.line != null) {
            breakpointMap[scriptIndex].set(b.location.range.start.line, b);
          }
        }
      }
    }
    this._functionBreakpointMap = breakpointMap;
    this.joinBreakAddresses();
    return actualBreakpoints;
  }

  protected updateDataBreakpointsMap(dataBreakpoints: { dataId: string }[]) {
    this._requestedBreakpoints.data = dataBreakpoints;
    const program = this.programStory;
    if (program) {
      // A variable's breakpoint watches the variable itself, which a
      // temporary of the same name can shadow, so it is no set of
      // addresses: the game stops after a step that wrote another value to
      // it. It is placed on the first instruction in the source that
      // assigns that name in its scope.
      this._dataBreakpointMap = {};
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
          scope,
          name,
          last: undefined,
          binding: null,
          redeclarations: new Set(
            scope === undefined
              ? []
              : declarations.filter((address) =>
                  declaresName(program.root, address, name),
                ),
          ),
        });
        // A global is placed where it is declared, since a temporary that
        // shadows it is assigned by the same name; a temporary where it is
        // first assigned.
        const first =
          scope === undefined
            ? (this.firstInSource(declarations) ??
              this.firstInSource(assignments))
            : (this.firstInSource(assignments) ??
              this.firstInSource(declarations));
        // A variable no statement in the program writes is watched all the
        // same, at no line.
        return first === undefined
          ? { verified: true }
          : this.programBreakpoint(first, "No variable found at the breakpoint");
      });
      this._dataWatches = watches;
      this.refreshDataWatches();
      this.joinBreakAddresses();
      return actual;
    }
    this._dataWatches = [];
    const actualBreakpoints = Game.getActualDataBreakpoints(
      this._program.dataLocations,
      dataBreakpoints,
      this._scripts,
    );
    const breakpointMap: Record<number, Map<number, Breakpoint>> = {};
    for (const b of actualBreakpoints) {
      if (b.location?.uri) {
        const scriptIndex = this._scripts.indexOf(b.location.uri);
        if (scriptIndex >= 0) {
          breakpointMap[scriptIndex] ??= new Map();
          if (b.location.range.start.line != null) {
            breakpointMap[scriptIndex].set(b.location.range.start.line, b);
          }
        }
      }
    }
    this._dataBreakpointMap = breakpointMap;
    this.joinBreakAddresses();
    return actualBreakpoints;
  }

  static planRoute(
    story: Story,
    program: SparkProgram,
    from: string,
    to: ProgramAddress,
    simulationOptions?: Record<
      string,
      {
        favoredConditions?: (boolean | undefined)[];
        favoredChoices?: (number | undefined)[];
      }
    >,
    budget?: Pick<
      SearchOptions,
      | "maxSteps"
      | "maxNodes"
      | "searchTimeout"
      | "callerResetsStory"
      | "resumeFrom"
    >,
  ) {
    // Plan a route from the top of the flow the target stands in, to the
    // target itself.
    return planRoute(story, from, to, {
      ...budget,
      functions: Object.keys(program.functionLocations || {}),
      stayWithinKnot: true,
      favoredConditions: simulationOptions?.[from]?.favoredConditions,
      favoredChoices: simulationOptions?.[from]?.favoredChoices,
    });
  }

  /** The checkpoint captured for a step of the SIMULATED route, looked up by
   *  the step's identity.
   *
   *  `expected` corroborates the match. Identity used to be the path history
   *  spelled out (`"p0|p1|p2"`), so equal identities implied an equal number
   *  of components and therefore the same index — which is what
   *  `patchAndSimulateRoute` relies on when it resumes by POSITION rather than
   *  by the index it matched. A fixed-width hash carries no depth, so that
   *  implication has to be checked rather than assumed: a caller passes the
   *  step it believes it matched, and a disagreement on address or index
   *  means no match, costing a re-simulation instead of resuming the preview
   *  from an unrelated story position. */
  getCheckpoint(
    seq: string,
    expected?: {
      address?: ProgramAddress;
      index?: number;
      maxCheckpoint?: number;
    },
  ) {
    if (this._plannedRoute) {
      const stepIndex = this._plannedRouteStepMap[seq];
      if (stepIndex != null) {
        if (expected?.index != null && stepIndex !== expected.index) {
          return null;
        }
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
              // Deeper than the caller established is safe. A step's own
              // checkpoint number is stamped when the step is reached, and the
              // engine runs a whole beat between one stamp and the next, so a
              // checkpoint stamped on a step inside the unchanged part of the
              // route can still have been taken with the story standing past
              // it (see `findResumePoint`).
              return null;
            }
            return this._checkpoints.getJson(step.checkpoint);
          }
        }
      }
    }
    return null;
  }

  protected simulateRoute(
    route: RoutePlan,
    fromStep = 0,
    fromCheckpointOverride?: number,
  ): void {
    // A route exists, so whatever the last search concluded no longer applies.
    // Cleared here rather than only in `simulate()` because
    // `patchAndSimulateRoute` arrives with a route of its own and never passes
    // through `simulate()`, which would otherwise leave an older reason to be
    // reported against this run.
    this._simulationFailure = undefined;
    this._searchErrors = undefined;
    const startStep = route.steps[fromStep];
    const fromDecision = startStep?.decision ?? 0;
    // A step's own checkpoint number is stamped when the step is reached, and
    // the engine runs a whole beat between one stamp and the next, so a caller
    // that established which checkpoint a step's story actually comes from says
    // so rather than letting it be re-derived.
    const fromCheckpoint = fromCheckpointOverride ?? startStep?.checkpoint ?? -1;
    // The program engine restores the checkpoint's image in place, and the
    // current engine loads its full save.
    const startCheckpoint = this.programStory
      ? fromCheckpoint
      : this._checkpoints.getJson(fromCheckpoint);
    this._checkpoints.truncate(fromCheckpoint + 1);
    this._checkpointStepCursors.length = fromCheckpoint + 1;
    this._routeErrors = this._routeErrors.filter(
      (e) => e.at <= fromCheckpoint,
    );
    this._plannedRoute = route;
    this._plannedRouteChangeId = this._program.changes?.id;
    this._plannedRouteRoot = this.programStory?.root;
    this._simulateFlow = route.from;
    this._startAddress = route.to;
    // Force the story to follow this route
    this._story.simulator = buildRouteSimulator(route.decisions, fromDecision);
    // Record valid seqs for each step of the route
    this._plannedRouteStepMap = {};
    for (let i = 0; i < route.steps.length; i++) {
      const step = route.steps[i]!;
      this._plannedRouteStepMap[step.seq] = i;
    }
    this._plannedRouteStepCursor = fromStep;

    // A replay is not a preview, even on a game that has displayed one: the
    // coordinator shows every beat a previewing game runs as a preview, which
    // changes the module state the route's checkpoints save. The mark is the
    // display's, so it returns once the replay ends.
    const previewing = this._context.system.previewing;
    this._context.system.previewing = undefined;
    this._replaying = true;
    for (const k of this._moduleNames) {
      this._modules[k]?.onReplay();
    }
    try {
      this.replayRoute(route, startCheckpoint);
    } finally {
      this._replaying = false;
      this._context.system.previewing = previewing;
      for (const k of this._moduleNames) {
        this._modules[k]?.onReplayEnd();
      }
    }
  }

  protected replayRoute(
    route: RoutePlan,
    startCheckpoint: string | number | null,
  ) {
    const resumed =
      typeof startCheckpoint === "number"
        ? startCheckpoint >= 0 && this.restoreCheckpoint(startCheckpoint)
        : startCheckpoint
          ? (this.load(startCheckpoint), true)
          : false;
    if (!resumed && typeof startCheckpoint === "number" && startCheckpoint >= 0) {
      // A checkpoint the program can no longer place: the route replays
      // from its start, and every checkpoint and step it stamps is its own.
      this._checkpoints.truncate(0);
      this._checkpointStepCursors.length = 0;
      this._plannedRouteStepCursor = 0;
      this._routeErrors = [];
    }
    if (!resumed) {
      // Starting the route at its beginning rather than resuming inside it. The
      // replay about to run is the whole truth about the checkpoints it saves,
      // so no module state may carry over from whatever this game ran before:
      // the story rewinds here, and every module's saved state rewinds with it
      // to what a game that has never run holds. Left carried over, a route's
      // checkpoints embed the last run's backdrop, a beat it left queued (which
      // the replay would flush first, as a beat of its own) and the styles the
      // last beat it displayed set, so the same route through the same program
      // saved different checkpoints depending on whether the game had last
      // replayed another route or displayed a preview. The page's own records
      // of what it presents are the modules' to keep (`onReplay`), and a
      // module that derives one from its saved state derives it again here.
      // The runtime record goes too: it is what tells the replay it has
      // reached its target, and one left from a run that reached the same
      // target ends this replay before it runs a step.
      for (const k of this._moduleNames) {
        this._modules[k]?.load({});
      }
      this._runtimeState = new RuntimeState();
      this.jumpTo(route.from);
    }

    this._simulation = "simulating";
    this._context.system.simulating = route.from;

    this._executingAddress = null;
    this._executingLocation = null;

    this.continue(true);

    if (this._simulation === "simulating") {
      // Still "simulating" means the replay never arrived at the target, even
      // though the planner said there was a way there.
      this._simulation = "fail";
      this._simulationFailure = "diverged";
    }

    this._story.simulator = null;
  }

  /**
   * What the route already planned still offers, now that a new program is
   * loaded.
   *
   * The story ahead of an unchanged prefix is a story that has already been
   * searched and replayed once. Establishing how much of it is unchanged costs
   * a walk over the route's steps and a checkpoint read; searching it again
   * costs a story advance per step, which on a long scene is the whole cost of
   * previewing.
   *
   * Everything here is a question about the PREVIOUS route, so it must be asked
   * before anything replaces it.
   */
  routeResumption(from: string, to: ProgramAddress): RouteResumption {
    const route = this._plannedRoute;
    if (!route || route.from !== from) {
      return { replayOnly: false };
    }
    if (!this._program.changes) {
      // A program that says nothing about what it changed leaves the decision
      // exactly where it was: step identity alone, as it has always been.
      return { replayOnly: false };
    }
    const program = this.programStory;
    const validSteps = program
      ? validAddressPrefixLength(
          route.steps,
          this._plannedRouteRoot,
          program.root,
          this._program.changes,
          this._plannedRouteChangeId,
        )
      : validRoutePrefixLength(
          route.steps,
          this._program,
          this._program.changes,
          this._plannedRouteChangeId,
        );
    const resume = this.findResumePoint(validSteps);
    if (!resume) {
      return { validSteps, replayOnly: false };
    }
    return {
      validSteps,
      stepIndex: resume.stepIndex,
      resumeFrom: resume.point,
      checkpointIndex: resume.checkpointIndex,
      // The route still ends where it is wanted, so it is worth replaying it
      // before searching for another. Replaying is what happens after a search
      // in any case, and from no deeper a checkpoint than this one — so trying
      // it first costs a second replay when the route no longer holds, and
      // saves the whole search when it does.
      // On the program engine the route's own steps are kept only while
      // every one of them still holds: a step past the valid prefix names a
      // statement the compile emitted again, whose decisions the route's
      // forced ones no longer name, so the rest is searched for.
      replayOnly:
        route.to === to && (!program || validSteps === route.steps.length),
    };
  }

  /**
   * How many checkpoints back to look for one whose story is still standing
   * inside the unchanged part of the route.
   *
   * Each attempt costs a checkpoint read and a story-state load, and a
   * checkpoint that is too deep is too deep by one beat, not by twenty. Giving
   * up after a few and searching the scene instead is cheaper than reading
   * back through a store that holds one entry per beat of a long scene.
   */
  protected static readonly RESUME_CANDIDATES = 8;

  /**
   * The deepest checkpoint the new program may be resumed from, and the step of
   * the planned route its story is standing on.
   *
   * The step has to be read out of the restored story rather than assumed: the
   * engine advances a whole beat at a time, while the cursor that stamps a
   * step's checkpoint number sees one position per beat, so a checkpoint's
   * story is routinely further along the route than the step it was stamped
   * against. Resuming on that assumption would claim steps as still to come
   * that the restored state has already taken, and the plan would come back
   * with a hole in it.
   */
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

  /**
   * Restore checkpoint `checkpointIndex` far enough to see where its story
   * stands, and describe that position as a resume point.
   *
   * Returns nothing when the story stands past `validSteps`, which is the case
   * that matters: the state has then already run statements this compile
   * changed, and no amount of care with the route around it would make it
   * describe the new program.
   *
   * Seeing where the story stands means putting it there, so this leaves the
   * story holding the checkpoint's state. Everything that can run afterwards
   * replaces it: a search restores its own node's state, a replay loads the
   * checkpoint itself, and a search that starts at the top resets first,
   * because the story no longer reports itself as pristine.
   */
  protected readResumePoint(
    checkpointIndex: number,
    cursor: number,
    validSteps: number,
  ): RouteResumePoint | null {
    const route = this._plannedRoute;
    if (!route) {
      return null;
    }
    let state: RouteResumePoint["state"] | undefined;
    let standingOn: ProgramAddress | undefined;
    const program = this.programStory;
    if (program) {
      // The checkpoint's image, restored in place, which a search node runs
      // from as it is.
      const image = this._checkpoints.imageAt(checkpointIndex)?.image as
        | ProgramImage
        | undefined;
      // A route resumes only from a checkpoint whose positions the new
      // root holds as they are: the steps after it are judged by their
      // addresses (`validAddressPrefixLength`), so one placed through its
      // saved form is not resumed from, and the search goes on from an
      // earlier one (#700). `restoreCheckpoint` translates.
      if (!image || !program.canRestore(image, false)) {
        return null;
      }
      this.discardOpenStoryLine();
      if (!program.restore(image, false)) {
        return null;
      }
      state = image;
      standingOn = this._positions.previous();
    } else {
      const checkpoint = this._checkpoints.getJson(checkpointIndex);
      if (!checkpoint) {
        return null;
      }
      let storyState: unknown;
      try {
        storyState = (JSON.parse(checkpoint) as SaveData).story;
      } catch {
        return null;
      }
      if (typeof storyState !== "string" || !storyState) {
        return null;
      }
      try {
        this.discardOpenStoryLine();
        this._story.state.LoadJson(storyState);
        standingOn = this._positions.previous();
      } catch {
        return null;
      }
      state = storyState;
    }
    if (standingOn == null || standingOn === "") {
      return null;
    }
    // The step that position belongs to, looked for from the checkpoint's own
    // step onwards: an address repeats along a route, and the arrival that
    // matters is the one this checkpoint was taken at or after.
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
      // The step after this one is not one the new program takes the way
      // the route did (a statement was inserted before it, or it was
      // emitted again), and the image stands somewhere other than right
      // after the statement that ran, where it would be placed after that
      // statement in the new program: restoring it would skip what the new
      // program runs there.
      return null;
    }
    // A step records the decisions made BEFORE it, so the step the story is
    // standing on is the one that says how many have been taken. The plan
    // reports those same decisions split in two, and a search reads its favored
    // answers by counting each list, so both have to be cut to the same point.
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
      // Up to but not including the step the story is standing on, because a
      // search reads the position it is standing on before advancing and would
      // otherwise record it twice. This is the convention a fork already
      // follows — it pops the step it is about to re-encounter.
      steps: route.steps.slice(0, at),
      decisions,
      conditions: route.conditions.slice(0, conditions),
      choices: route.choices.slice(0, choices),
    };
  }

  /**
   * Replay the route already planned, resuming from `stepIndex`.
   *
   * Used when nothing the new program changed can be reached before that step
   * and the route still ends where it is wanted, so there is nothing left to
   * search for: the story is restored to the checkpoint and the rest of the
   * route runs again in the new program.
   *
   * The steps after the resume point are replaced by copies that carry no
   * checkpoint and no position. The store is truncated to the resume point, so
   * an index recorded against the old run would name a state captured by this
   * one; and the statements those steps came from are exactly the statements
   * that may have changed, so their old positions are the ones least worth
   * keeping. The replay re-earns both for every step it actually reaches.
   */
  resumePlannedRoute(stepIndex: number, checkpointIndex: number): string | null {
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
    return this._checkpoints.at(-1) ?? null;
  }

  /**
   * Replay `newRoute`, resuming from the deepest checkpoint of the previous
   * route that this one still agrees with.
   *
   * `limits` bounds how far into the previous route a checkpoint may be taken
   * from, as a step count and as a checkpoint number. Step identity alone
   * answers "did the route come this way again", which is the whole question
   * while the PROGRAM is the same; when the program has changed it answers only
   * half of it, and the caller supplies the other half (see
   * {@link routeResumption}). Leaving it out considers every step, which is
   * what a caller with no reason to doubt the program does.
   */
  patchAndSimulateRoute(
    newRoute: RoutePlan,
    limits?: { steps: number; checkpoint: number },
  ): string | null {
    if (
      !this._plannedRoute ||
      this._plannedRoute.from !== newRoute.from
    ) {
      // simulate from the beginning
      this._runtimeState = new RuntimeState();
      this.simulateRoute(newRoute);
      return this._checkpoints.at(-1) ?? null;
    }

    // Search for a valid checkpoint we can start simulation from, among the
    // steps the caller says the new program still agrees with. A checkpoint
    // beyond that is a state the old program produced from statements this one
    // no longer has, however well its step's identity matches.
    const considered =
      limits == null
        ? newRoute.steps.length
        : Math.max(0, Math.min(limits.steps, newRoute.steps.length));
    const validSteps = newRoute.steps.slice(0, considered);
    const newSteps = newRoute.steps.slice(considered);
    let lastValidNewRouteStep = validSteps.at(-1);
    // The resume below is positional (`validSteps.length - 1` indexes the OLD
    // route), so the match has to agree on that index, not merely on identity.
    let lastValidOldRouteCheckpoint = this.getCheckpoint(
      lastValidNewRouteStep?.seq || "",
      {
        address: lastValidNewRouteStep?.address,
        index: validSteps.length - 1,
        maxCheckpoint: limits?.checkpoint,
      },
    );
    while (lastValidNewRouteStep && !lastValidOldRouteCheckpoint) {
      const invalidStep = validSteps.pop();
      if (invalidStep) {
        newSteps.unshift(invalidStep);
      }
      lastValidNewRouteStep = validSteps.at(-1);
      lastValidOldRouteCheckpoint = this.getCheckpoint(
        lastValidNewRouteStep?.seq || "",
        {
          address: lastValidNewRouteStep?.address,
          index: validSteps.length - 1,
          maxCheckpoint: limits?.checkpoint,
        },
      );
    }

    if (!lastValidOldRouteCheckpoint) {
      // Could not start from an earlier checkpoint, so simulate from the beginning
      this._runtimeState = new RuntimeState();
      this.simulateRoute(newRoute);
      return this._checkpoints.at(-1) ?? null;
    }

    // Keep valid steps, trim away invalid steps
    const patchedSteps = this._plannedRoute.steps.slice(0, validSteps.length);
    // Add on new steps
    for (const newStep of newSteps) {
      patchedSteps.push(newStep);
    }
    const patchedRoute = {
      from: newRoute.from,
      to: newRoute.to,
      steps: patchedSteps,
      decisions: newRoute.decisions,
      conditions: newRoute.conditions,
      choices: newRoute.choices,
    };

    // Add new checkpoints onto the previous simulation
    const fromStep = validSteps.length - 1;
    this.simulateRoute(patchedRoute, fromStep);
    return this._checkpoints.at(-1) ?? null;
  }

  /** End the route simulation, so the modules connect, restore and display as
   *  a running game rather than as a replay. A route search leaves
   *  `system.simulating` set; a game that connects after one and displays from
   *  its state calls this first. A simulation that never reached its target
   *  ends as failed; one that did keeps its success. */
  endSimulation(): void {
    if (this._simulation === "simulating") {
      this._simulation = "fail";
    }
    this._context.system.simulating = undefined;
  }

  start(save: string = ""): void {
    // A preview waiting for its pictures would display its beat over the
    // run.
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
      // `rewindStory`, NOT `reset`. By the time `start` runs, `connect` has
      // already called every module's `onConnected` AND `restore` — the ui
      // module has mounted its layouts, registered its `@event` handlers and
      // had the renderer attach the matching DOM listeners. A full `reset`
      // here clears `_state` and calls `onReset`, throwing all of that away,
      // and nothing mounts again afterwards.
      //
      // The result was a UI that rendered perfectly and did nothing: the DOM
      // was intact, the renderer still forwarded clicks, and the engine looked
      // them up in an `_events` map that had just been emptied. Traced on a
      // STOP -> PLAY, where the order is
      //   onConnected -> mountEvent -> ui/observe -> onReset.
      // Module reset is only meaningful BEFORE modules are initialized; here we
      // only need the story rewound so the replay starts from `_startAddress`.
      //
      // Per-module residue audit for this branch (the abandoned run's state
      // survives the rewind — what of it is CORRECT to keep?):
      //   interpreter — the beat FIFO is the first hazard: unflushed beats
      //     from the abandoned run sit at the queue's head and would render
      //     FIRST in the replay. The routing the run remembered for a glued
      //     continuation is the second: a beat of the replay would inherit
      //     a cue from a beat that is no longer going to run. Both are
      //     cleared below by `clearQueuedBeats`; the replay re-queues from
      //     the start path. (`_matcherCache`/name maps are pure derivations.)
      //   audio — `_channelsCurrentlyPlaying` and `_state.channels` MIRROR
      //     the renderer, whose players are untouched by a story rewind:
      //     clearing them would break `replace`-behavior stops and channel-
      //     wide saves for audio that is audibly still playing. Kept.
      //   ui — preserving mounted layouts/`_events` is this branch's whole
      //     reason to exist (see above). Kept.
      //   core / world — stateless (`CoreState`/`WorldState` are empty).
      this.module.interpreter.clearQueuedBeats();
      this.rewindStory();
      this.clearChoices();
      if (this._startAddress != null) {
        this.jumpTo(this._startAddress);
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
    // Before the modules go, so the waiting preview's pin is let go while
    // the asset module can still send the release.
    this.cancelPreview();
    this._destroyed = true;
    // A game with its own clock stops asking for frames.
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
    // Where along the planned route the story stood when this checkpoint was
    // taken: the index of the step it is about to run next. A later compile
    // that resumes from this checkpoint needs exactly that, because the steps
    // it claims as already taken have to be the steps the restored state has
    // actually taken. Nothing but this records it — a step's own checkpoint
    // number is stamped when the step is REACHED, which is a different moment.
    //
    // Recorded only while replaying a route. During ordinary play the cursor
    // stands wherever the last replay left it and means nothing.
    this._checkpointStepCursors.length = this._checkpoints.length;
    if (this._checkpoints.length > 0) {
      this._checkpointStepCursors[this._checkpoints.length - 1] =
        this._simulation === "simulating"
          ? this._plannedRouteStepCursor
          : undefined;
    }
  }

  save(): string {
    return this.buildSave(false);
  }

  /** Like `save()` but serializes the unbounded, per-beat-growing collections
   *  (story visit/turn count maps + runtime executed-paths/choices/conditions)
   *  as empty. The CheckpointStore stores this bounded body for delta beats and
   *  re-injects the (delta-reconstructed) collections to rebuild a
   *  byte-identical full save. */
  saveDeltaBody(): string {
    return this.buildSave(true);
  }

  /** The executed record's positions as a save holds them on the program
   *  engine: each address in its durable form (`durableAddress`), since a
   *  chunk id names a statement only in the process that gave it (#700). An
   *  address the root no longer holds is left out. */
  protected durableExecuted(executed: RecencyEntry[]): RecencyEntry[] {
    const root = this.programStory?.root;
    if (!root) {
      return executed;
    }
    const out: RecencyEntry[] = [];
    for (const entry of executed) {
      const form = typeof entry === "number" ? durableAddress(root, entry) : entry;
      if (form !== undefined) {
        out.push(form);
      }
    }
    return out;
  }

  /** The addresses in `root` of a saved executed record's durable
   *  positions, in their order, without those it cannot place. A bare
   *  address is another process's and is dropped too. */
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
    try {
      const program = this.programStory;
      if (!withStory) {
        story = "";
      } else if (program) {
        // The program engine's durable save of the current beat.
        story = program.toSave(this._version);
      } else {
        story = omitDeltaState
          ? this._story.state.ToJsonWithoutCounts()
          : this._story.state.toJson();
      }
    } catch (e: any) {
      this.Error(e.message, ErrorType.Error);
    }
    const runtime = omitDeltaState
      ? this._runtimeState.toJSONWithoutCollections()
      : this._runtimeState.toJSON(
          this.programStory ? (executed) => this.durableExecuted(executed) : undefined,
        );
    const saveData: SaveData = {
      modules: {},
      context: {},
      story,
      runtime,
      simulatedFrom:
        this._simulation !== "none" ? this._simulateFlow : undefined,
    };
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
    const program = this.programStory;
    if (program) {
      return this.loadProgramSave(program, saveJSON);
    }
    // A preview waiting for its pictures would display its beat over the
    // loaded state, and record a checkpoint of it.
    this.cancelPreview();
    try {
      const saveData: SaveData =
        typeof saveJSON === "string" ? JSON.parse(saveJSON) : saveJSON;
      for (const k of this._moduleNames) {
        const module = this._modules[k];
        if (module) {
          module.load(saveData.modules[k]);
        }
      }
      if (saveData.story) {
        // Only once the save has been read and is known to carry a story:
        // letting go of the open line is not reversible, so doing it before
        // the parse would leave a save that turns out to be unreadable — or
        // one written by a failed serialization, which stores an empty story —
        // with the current line torn in half and no replacement for it. The
        // next continue would then resume from the middle of that line,
        // dropping the text and the `display()` table that decide how the
        // beat is displayed.
        this.discardOpenStoryLine();
        this._story.state.LoadJson(saveData.story);
        this.restoreReactiveTracking();
      }
      if (saveData.runtime) {
        this._runtimeState = RuntimeState.fromJSON(saveData.runtime);
      }
      if (saveData.simulatedFrom) {
        this._simulation = "success";
        this._simulateFlow = saveData.simulatedFrom;
      }
      return true;
    } catch (e) {
      this.log(e, "error");
    }
    return false;
  }

  /**
   * Loads a save into a game on the program engine, or refuses it with
   * nothing of the game changed: everything that can fail is read before
   * anything changes. The save must carry a story (one written while the
   * story could not save, which `buildSave` stores as an empty story, is
   * refused), a state for every module the game has, each an object, as
   * `save` writes them, and a runtime record of the shape `toJSON` writes
   * (`RuntimeState.read`), and the story must place it
   * (`ProgramStory.checkSave`). What a module's state holds is the
   * module's to read, on either engine. Then the story loads, which puts
   * itself back, line in progress included, when it fails past the
   * placement, and ends the line in progress when it succeeds; only then
   * does a waiting preview go, and the modules and the runtime record load,
   * which cannot fail.
   */
  protected loadProgramSave(program: ProgramStory, saveJSON: string): boolean {
    try {
      const saveData: SaveData =
        typeof saveJSON === "string" ? JSON.parse(saveJSON) : saveJSON;
      if (typeof saveData?.story !== "string" || !saveData.story) {
        throw new Error("The save holds no story to load");
      }
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
      if (typeof saveData.runtime !== "string") {
        throw new Error("The save holds no runtime record to load");
      }
      const runtime = RuntimeState.read(saveData.runtime);
      program.checkSave(saveData.story);
      // The executed record's positions, written durably (`buildSave`),
      // placed in this program; one it cannot place is dropped, as a save's
      // count whose symbol cannot be placed is.
      runtime.pathsExecutedThisFrame = RecencySet.from(
        this.placedExecuted(program.root, runtime.pathsExecutedThisFrame.toArray()),
      );
      program.loadSave(saveData.story);
      // A preview waiting for its pictures would display its beat over the
      // loaded state, and record a checkpoint of it.
      this.cancelPreview();
      this.restoreReactiveTracking();
      for (const k of this._moduleNames) {
        const module = this._modules[k];
        if (module) {
          module.load(saveData.modules[k]);
        }
      }
      this._runtimeState = runtime;
      if (saveData.simulatedFrom) {
        this._simulation = "success";
        this._simulateFlow = saveData.simulatedFrom;
      }
      return true;
    } catch (e) {
      this.log(e, "error");
    }
    return false;
  }

  /**
   * Restores checkpoint `index` in place: the story's image of the beat, and
   * the module state and runtime collections saved beside it. Within a
   * session an image taken before a compile restores after it for every
   * statement the compile kept, and one that names a statement it emitted
   * again is translated through its saved form (#1429); one that still cannot
   * be placed is unplaced, and nothing changes, so that the caller replays
   * (docs/engine/binary-program.md, sections 7 and 8). A route's resumption
   * does not translate (`readResumePoint`). A checkpoint of the current
   * engine loads from its full save.
   */
  restoreCheckpoint(index: number): boolean {
    const entry = this._checkpoints.imageAt(index);
    const story = this.programStory;
    if (!entry || !story) {
      const json = this._checkpoints.getJson(index);
      return json ? this.load(json) : false;
    }
    const image = entry.image as ProgramImage;
    // Placed before anything of the game changes: an unplaced checkpoint
    // leaves the preview and the line in progress as they are.
    if (!story.canRestore(image)) {
      return false;
    }
    this.cancelPreview();
    this.discardOpenStoryLine();
    if (!story.restore(image)) {
      return false;
    }
    this.restoreReactiveTracking();
    const saveData = entry.save as SaveData;
    for (const k of this._moduleNames) {
      this._modules[k]?.load(saveData.modules[k]);
    }
    if (saveData.runtime) {
      this._runtimeState = RuntimeState.fromJSON(saveData.runtime);
    }
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

  /** Rewind the STORY to its initial state, leaving module state alone.
   *
   *  Split out from {@link reset} because the two are only safe at different
   *  points in the lifecycle. Rewinding the story is safe at any time; resetting
   *  the modules is only safe BEFORE they are initialized, because
   *  `Module.reset` clears `_state` and calls `onReset`, which for the ui module
   *  drops the mounted-layout map and the `_events` handler registry. */
  protected rewindStory() {
    // End any line the story is part-way through, rather than running it to
    // its end. See `discardOpenStoryLine`.
    this.discardOpenStoryLine();
    this._story.ResetState();
    this.restoreReactiveTracking();
  }

  /** Let go of a story line that is stopped part-way through, so the story
   *  state can be replaced.
   *
   *  The runtime refuses to reset, reload or jump while a line is still open,
   *  so `rewindStory`, `jumpTo` and `load` each had to deal with that
   *  first, and each did it by finishing the line with a bare `Continue()`.
   *
   *  Finishing it was never the point — all three replace the story state on
   *  the very next line, so whatever that work produced was thrown away — and
   *  it carried a real cost: `Continue()` advances the story until the line
   *  ends, and a story sitting in a loop that never completes a line never
   *  ends, so the call ran forever with no error raised and nothing to stop it
   *  (#386). The path that made that reachable is the preview's own recovery:
   *  it runs precisely when execution was stopped part-way through a loop for
   *  running out of budget, so the recovery re-entered the loop that had just
   *  been declared a runaway, this time with nothing counting the work.
   *
   *  Ending the line instead of finishing it removes both problems at once:
   *  the story is left replaceable, no work is done, and there is no ceiling
   *  to get wrong. */
  protected discardOpenStoryLine() {
    this._story.CancelAsyncContinue();
  }

  /** Re-assert reactive dependency tracking after ANY story-state
   *  replacement (`ResetState`, a recompile's `new Story`, a checkpoint
   *  `LoadJson`). Each of those yields a `VariablesState` whose fine-grained
   *  tracking defaults OFF, and the flag is normally enabled only once, at
   *  layout mount (`UIModule.constructLayoutsFromAst`) — which does NOT
   *  re-run on these paths, precisely because they preserve the mounted UI.
   *  Without this, every mounted `{binding}` freezes after a STOP → PLAY
   *  restart or a live-edit recompile: the VM keeps updating the globals,
   *  but no change is ever recorded for `refreshLayouts` to react to. */
  protected restoreReactiveTracking() {
    if (this._program?.sparkle?.layouts) {
      this._story.variablesState.reactiveDepsEnabled = true;
    }
  }

  reset() {
    this.cancelPreview();
    this.rewindStory();
    this._sceneTracker.reset();
    // Reset modules to their initial state
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

    this.resetExecutionBudget();
    this.refreshDataWatches();

    this.clearVariableReferences();
    this._coordinator = null;
    let done = false;
    do {
      done = this.stepWithinBudget();
    } while (!done);

    // A preview whose flush is held reports its execution once the beat
    // displays (`preview`), after what it displays, as this does.
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

  /** A debugger traversal is its own stretch of execution, so it starts with a
   *  full budget rather than sharing whatever the last `continue` left. */
  step(traversal: "in" | "out" | "over" | "continue" = "continue"): boolean {
    // A step advances the story; a preview waiting to display a beat of it
    // would display over the step's.
    this.cancelPreview();
    this.resetExecutionBudget();
    this.refreshDataWatches();
    // A step in, over or out runs until it stops where it says it stops, or
    // at a breakpoint or a beat to show, however many lines that takes: the
    // debugger sends one request and waits for the stop, which it hears as
    // a step's or a breakpoint's. A beat to show is announced as the step's
    // stop too, since the debugger hears a wait for the player only while
    // it follows the execution.
    const origin = {
      depth: this._story.state.callstackDepth,
      location: this._executingLocation,
    };
    this._announcedStop = false;
    let done = this.stepWithinBudget(traversal, origin);
    while (!done && traversal !== "continue") {
      done = this.stepWithinBudget(traversal, origin);
    }
    if (traversal !== "continue" && !this._announcedStop) {
      this.notifyStepped();
    }
    // A step gates nothing: a beat it reaches displays at once, since the
    // game is previewing, and one it does not reach issues no gate. Nothing
    // waits, so an abandoned pin goes now.
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
        // Execution is running away. Force it to stop.
        return true;
      }
      this._executionStepsRemaining -= 1;

      const address = this._positions.previous();
      if (address != null && address !== "") {
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
                // The nearest checkpoint at or before this step. Steps reached
                // before the first capture have none, and must stay undefined:
                // recording -1 made `getCheckpoint` ask the store for index -1
                // (null) instead of reporting "no checkpoint here", so a real
                // absence was indistinguishable from a lookup failure.
                const latestCheckpoint = this._checkpoints.length - 1;
                if (latestCheckpoint >= 0) {
                  step.checkpoint = latestCheckpoint;
                }
                // On the current engine, where this step's path pointed,
                // recorded while the program that answers for it is the one
                // loaded. A later compile says which lines it changed, and
                // this is the only thing on a route those lines can be
                // compared with — and comparing the whole location catches
                // the other way a step stops meaning what it meant, which is
                // an edit elsewhere renumbering the path. A step on the
                // program engine needs neither: its address names a chunk,
                // which a later root holds exactly when the statement kept it.
                //
                // Stamped here rather than while planning because only the
                // steps actually replayed are the ones a resume can rest on,
                // and this walk covers exactly those.
                step.stamped = true;
                if (typeof address === "string") {
                  const location = this.scriptLocationOf(address);
                  step.location = location;
                  step.uri = location ? this._scripts[location[0]] : undefined;
                }
                this._plannedRouteStepCursor++;
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
          // End simulation
          this.checkpoint();
          this._simulation = "success";
          return true;
        }
      }

      if (this.module.interpreter.shouldFlush() || !this._story.canContinue) {
        const instructions = this.module.interpreter.flush();
        if (this._holdingFlush) {
          // The preview displays this beat once its pictures are resident;
          // see `displayHeld` for the rest of what a flush does.
          this._held = { instructions: instructions ?? null };
          return true;
        }
        if (instructions) {
          this._coordinator = new Coordinator(this, instructions);
          if (this._simulation !== "simulating") {
            // A route replay presents nothing on the page.
            this.noteShownChoices(instructions);
          }
          if (
            !this._coordinator.shouldContinue() &&
            this._simulation !== "simulating" &&
            // A load beat is loading, not waiting for the player.
            (!instructions.load || (instructions.choices?.length ?? 0) > 0)
          ) {
            this.notifyAwaitingInteraction();
          }
        } else if (
          !this._story.canContinue &&
          this._simulation !== "simulating" &&
          this._state === "running"
        ) {
          // Nothing buffered left to display and no flow left to run, so the
          // story is over. Note this only fires once the final beat has been
          // consumed -- a last beat still waiting to be read flushes above.
          this.notifyFinished();
        }
        // A replay takes one checkpoint per beat. The continue after its last
        // line can end the story with nothing to flush, and that is no beat.
        if (instructions || this._simulation !== "simulating") {
          this.checkpoint();
        }
        if (this._simulation === "simulating") {
          if (!this._story.canContinue) {
            return true;
          }
          // Continue without user interaction
          continue;
        }
        // DONE - waiting for user interaction (or auto advance).
        // If this run produced NO content beat (`_coordinator` was never created
        // — e.g. a UI-only project with no dialogue), the per-beat reveal
        // (Coordinator.updateUI → ui.reveal) will never fire and the layouts
        // layer would stay hidden (opacity:0). Reveal it here now that the run
        // has settled. Idempotent; a real game has `_coordinator` set here and
        // skips this, keeping its flash-free, asset-gated beat-time reveal.
        if (!this._coordinator) {
          this.module.ui.reveal();
        }
        return true;
      } else if (this._story.canContinue) {
        // One step was charged above. A Luau callback runs all of its steps
        // inside the step that called it, and those count too: the limit stops
        // them where the budget runs out, and what they took is charged after.
        const stepsBefore = this._story.stepCount;
        // On the program engine the step appends the address of each
        // instruction it runs, a Luau callback's among them, to the log,
        // which the game reads once the step returns: it records them as
        // the addresses this beat ran, and a breakpoint stops the game when
        // its set holds one of them. No call and no string per step.
        const program = this.programStory;
        const log = this._executedLog;
        log.length = 0;
        if (program) {
          program.executedLog = log;
        }
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
          if (program) {
            program.executedLog = null;
          }
        }
        let hit = false;
        for (let i = 0; i < log.length; i += 1) {
          const address = log[i]!;
          this._runtimeState.recordExecution(address);
          if (this._breakAddresses.has(address)) {
            hit = true;
          }
        }
        if (stopped) {
          // The budget ran out part way through the step. The story cannot
          // resume from there: the operation the step was running has already
          // taken its arguments, so running it again would fail for a reason
          // the story does not have. The story ends, as a runtime error ends
          // it, and the check at the top of the loop reports the budget.
          this._story.CancelAsyncContinue();
          this._story.state.ForceEnd();
          continue;
        }
        // A data breakpoint stops the game once a step has written another
        // value to its variable.
        if (this._dataWatches.length > 0 && this.dataWatchesChanged()) {
          hit = true;
        }
        if (this._story.state.callstackDepth > this._callDepthLimit) {
          // Recursion that does not end. The story ends here, as a runtime
          // error ends it, and the run stops as a runaway, as it does at the
          // step ceiling: nothing flushes and the story is not reported as
          // finished.
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

        // A continue returns at its line's newline, so the one after a line
        // can complete with nothing to show: the flow went on through logic
        // to the story's end, or on into more of it. Choices alone make a beat
        // of their own. A continue that shows nothing is not handed to the
        // interpreter at all: `queue` would create its empty beat buffer, and
        // the interpreter's saved state is part of every checkpoint, which two
        // runs reaching the same story position must write alike. The end is
        // reported, or the story runs on, below.
        if (
          this._story.asyncContinueComplete &&
          this._story.continueShowedSomething
        ) {
          // The step's beat takes its routing from the first
          // `display(<table>)` table that names a target (see
          // `InterpreterModule.queue`). Its body is `currentText`, the step's
          // ordered visible text.
          this.module.interpreter.queue(
            this._story.currentDisplayInstructions,
            this._story.currentChoices.map((c) => c.text),
            this._story.currentText || "",
          );
        }

        if (this._simulation !== "simulating") {
          // On the program engine a breakpoint is a set of addresses, and
          // a step stops the game when the set holds the address of an
          // instruction it ran. Each instruction of a line has an address
          // of its own, so a breakpoint stops once each time its
          // instruction runs; one inside a Luau callback stops the game
          // once the step that called it returns.
          if (hit) {
            this._lastHitBreakpointLocation = this._executingLocation;
            this.notifyHitBreakpoint();
            // DONE - hit breakpoint
            return true;
          }
          // With no traversal asked for and no line breakpoint of the
          // current engine, nothing below can stop the game.
          if (traversal === "continue" && !this._hasLineBreakpoints) {
            return false;
          }
          // Skip duplicate stops (avoid breaking at the same location)
          if (
            sameLocation(prevExecutedLocation, this._executingLocation) ||
            sameLocation(initialExecutedLocation, this._executingLocation)
          ) {
            continue;
          }

          const currentCallstackDepth = this._story.state.callstackDepth;

          // Handle step in: Stop at each instruction that is executed
          if (traversal === "in") {
            this.notifyStepped();
            // DONE - stepped in
            return true;
          }

          // Handle step over: Stop at the next line in the same function
          if (
            traversal === "over" &&
            currentCallstackDepth <= initialCallstackDepth
          ) {
            this.notifyStepped();
            // DONE - stepped over
            return true;
          }

          // Handle step out: Stop when we return to a shallower depth
          if (
            traversal === "out" &&
            currentCallstackDepth < initialCallstackDepth
          ) {
            this.notifyStepped();
            // DONE - stepped out
            return true;
          }

          // Script index or line is different than last breakpoint
          const [currScriptIndex, currLine] = this._executingLocation || [
            -1, -1, -1, -1,
          ];
          const [breakpointScriptIndex, breakpointLine] =
            this._lastHitBreakpointLocation || [];
          if (
            currScriptIndex !== breakpointScriptIndex ||
            currLine !== breakpointLine
          ) {
            // Stop at a breakpoint
            if (
              this._breakpointMap[currScriptIndex]?.has(currLine) ||
              this._functionBreakpointMap[currScriptIndex]?.has(currLine) ||
              this._dataBreakpointMap[currScriptIndex]?.has(currLine)
            ) {
              this._lastHitBreakpointLocation = this._executingLocation;
              this.notifyHitBreakpoint();
              // DONE - hit breakpoint
              return true;
            }
          }
        }

        return false;
      } else {
        // Unreachable: reaching here would need `canContinue && !canContinue`,
        // because the first branch already claims every `!canContinue` case
        // (which is where running out of flow is now reported). Kept purely as
        // a backstop so a future change to the conditions above can't spin
        // here forever.
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
    // The coordinator's click handler took the choices off the page.
    this._shownChoices = [];
    // Tell the story where to go next
    this._story.ChooseChoiceIndex(index);
    // Save after every choice
    this.checkpoint();
    this.continue();
    this.notifyChosePathToContinue();
  }

  /** Take the choices the last displayed beat presented off the page: their
   *  text and pictures, their click observers, and the elements themselves.
   *  Only the targets that showed a choice are touched, so a beat that
   *  presented none costs the page nothing. */
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

  /** Remember the choice targets a displayed beat presents (the
   *  interpreter's `choice 0`, `choice 1`, and so on, which an element
   *  named `choice 0` matches as two classes). */
  protected noteShownChoices(instructions: Instructions | null) {
    this._shownChoices = [...(instructions?.choices ?? [])];
  }

  /** Resets the story and moves it to an address, or to the top of a flow
   *  named by its qualified name. */
  jumpTo(target: ProgramAddress) {
    this.discardOpenStoryLine();
    this._story.ResetState();
    this._positions.jumpTo(target);
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
    this.connection.emit(
      GameAwaitingInteractionMessage.type.notification({
        location: this.getDocumentLocation(this._executingLocation),
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

  /** What the last stretch of execution did, as `game/executed` reports it. */
  protected executedParams(): GameExecutedParams {
    const detailed = this.reportsExecutedLines;
    let first: ScriptLocation | undefined;
    let last: ScriptLocation | undefined;
    let lastAddress: ProgramAddress | undefined;
    // Each script's executed lines, and the last of them to be added: the
    // line an editor follows while a game runs, which is not the end of the
    // last location when that location returns to lines already executed (a
    // line that calls a function, after the function's body).
    const lines = new Map<string, Set<number>>();
    const lastLines = new Map<string, number>();
    this._runtimeState.pathsExecutedThisFrame.forEach((p) => {
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
    // Copies, not the runtime state's own arrays, so a report, once taken,
    // is not changed by what the story evaluates afterwards (the layouts'
    // bindings as they mount).
    const failed = this._simulation === "fail";
    return {
      simulateFlow: this._simulateFlow,
      // Where the route that failed was to start and to end, which the page
      // labels the failure with.
      simulateLocation:
        failed && this._simulateFlow != null
          ? (this.documentLocationOf(this._simulateFlow) ?? undefined)
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
      // Gated on the state rather than sent whenever it happens to be set, so
      // a reason recorded by an earlier failed simulation can never ride along
      // with a run that succeeded.
      simulationFailure:
        this._simulation === "fail" ? this._simulationFailure : undefined,
    };
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

  /** The story's globals and the current temporaries by name, for the
   *  editor to evaluate an expression against: each value it can receive
   *  and read into (`isEvaluable`). A table holds the runtime's own objects
   *  and functions, which no message can carry. */
  getEvaluationContext() {
    const context: any = {};
    const variableState = this._story.state.variablesState;
    for (const name of variableState["_globalVariables"].keys()) {
      const valueObj = variableState.GetVariableWithName(name);
      const value = this.getRuntimeValue(name, valueObj);
      if (isEvaluable(value)) {
        context[name] = value;
      }
    }
    const contextIndex = variableState.callStack.currentElementIndex + 1;
    let contextElement =
      variableState.callStack.currentThread.callstack[contextIndex - 1];
    if (contextElement?.temporaryVariables) {
      for (const [
        name,
        valueObj,
      ] of contextElement?.temporaryVariables.entries()) {
        const value = this.getRuntimeValue(name, valueObj);
        if (isEvaluable(value)) {
          context[name] = value;
        }
      }
    }
    return context;
  }

  getVarVariables(): Variable[] {
    const variables: Variable[] = [];
    const variableState = this._story.state.variablesState;
    for (const name of variableState["_globalVariables"].keys()) {
      const listDefinition = this._story.listDefinitions?.TryListGetDefinition(
        name,
        null,
      )?.result;
      if (!listDefinition) {
        const valueObj = variableState.GetVariableWithName(name);
        const value = this.getRuntimeValue(name, valueObj);
        if (value !== undefined) {
          variables.push(
            this.getVariableInfo(name, value, {
              kind: "data",
              visibility: "public",
            }),
          );
        }
      }
    }
    return variables;
  }

  getListVariables(): Variable[] {
    const variables: Variable[] = [];
    if (this._story.listDefinitions) {
      for (const listDefinition of this._story.listDefinitions.lists) {
        const value: Record<string, unknown> = { $type: "list.def" };
        for (const [key, itemValue] of listDefinition.items) {
          const keyObj = JSON.parse(key) as {
            originName: string;
            itemName: string;
          };
          value[keyObj.itemName] = itemValue;
        }
        if (value !== undefined) {
          variables.push(
            this.getVariableInfo(listDefinition.name, value, {
              kind: "data",
              visibility: "public",
            }),
          );
        }
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

  /** The temporaries of a frame (`frameId`, an index into the call stack of
   *  thread `threadId` as `getStackTrace` numbers its frames), by default
   *  the frame that runs, each with the scope a data breakpoint names it
   *  by. */
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
    // On the program engine a temporary's scope is the name of the frame it
    // is a temporary of; on the current engine, the runtime path the game
    // last ran, without its indices.
    const program = this.programStory;
    const programScope = program
      ? program.debugFrames(thread?.threadIndex ?? 0)?.[frameIndex]?.name
      : undefined;
    // Every block scope of the frame, from the innermost out, so a temporary
    // of an outer block (a function's parameters and the variables its
    // closure captured, beside the locals of its body) is shown while the
    // frame runs an inner one, and an inner temporary hides an outer one of
    // the same name, as reading the name does.
    const scopes = contextElement?.temporaryScopes ?? [];
    const seen = new Set<string>();
    for (let s = scopes.length - 1; s >= 0; s -= 1) {
      for (const [name, scoped] of scopes[s]!.entries()) {
        // A name with a `$` is the compiler's own (a loop's hidden index,
        // stop and step), which no author wrote.
        if (!name.includes("$") && !seen.has(name)) {
          seen.add(name);
          // A temporary bound to a pointer (a variable passed by reference,
          // or one a closure captured, as the current engine binds it)
          // shows the value it points to.
          const valueObj =
            scoped instanceof VariablePointerValue
              ? variableState.ValueAtVariablePointer(scoped)
              : scoped;
          const value = this.getRuntimeValue(name, valueObj);
          const scopePath = program
            ? programScope
            : typeof this._executingAddress === "string"
            ? this._executingAddress
                .split(".")
                .filter(
                  (p) =>
                    Number.isNaN(Number(p)) &&
                    !p.includes("-") &&
                    !p.includes("$"),
                )
                .join(".")
            : undefined;
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
      for (const [k, v] of Object.entries(value)) {
        if (!k.startsWith("$")) {
          variables.push(
            this.getVariableInfo(k, v, {
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

  getRuntimeValue(
    name: string,
    valueObj: InkObject | null,
  ): unknown | undefined {
    if (valueObj && "value" in valueObj) {
      if (valueObj.value instanceof InkList) {
        const listDefinition =
          this._story.listDefinitions?.TryListGetDefinition(name, null)?.result;
        if (listDefinition) {
          const listValue: Record<string, unknown> = { $type: "list.def" };
          for (const [key, itemValue] of listDefinition.items) {
            const keyObj = JSON.parse(key) as {
              originName: string;
              itemName: string;
            };
            listValue[keyObj.itemName] = itemValue;
          }
          return listValue;
        }
        const listValue: Record<string, unknown> = { $type: "list.var" };
        for (const [key, value] of valueObj.value.entries()) {
          const keyObj = JSON.parse(key) as {
            originName: string;
            itemName: string;
          };
          listValue[keyObj.originName + "." + keyObj.itemName] = value;
        }
        return listValue;
      }
      return valueObj.value;
    }
    return undefined;
  }

  getVariableInfo(
    name: string,
    value: unknown,
    presentationHint?: VariablePresentationHint,
    scopePath?: string,
  ): Variable {
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
    const displayValue =
      value === undefined
        ? "undefined"
        : value === null
          ? "null"
          : typeof value === "object"
            ? Array.isArray(value)
              ? `[${value.length}]`
              : Object.keys(value).filter((k) => !k.startsWith("$")).length > 0
                ? "$type" in value &&
                  (value.$type === "list.def" || value.$type === "list.var")
                  ? "(...)"
                  : "{...}"
                : "$type" in value &&
                    (value.$type === "list.def" || value.$type === "list.var")
                  ? "()"
                  : "{}"
            : JSON.stringify(value);
    const displayType =
      value === undefined
        ? "undefined"
        : value === null
          ? "null"
          : typeof value === "object"
            ? Array.isArray(value)
              ? `array`
              : "$type" in value && typeof value.$type === "string"
                ? value.$type === "list.def" || value.$type === "list.var"
                  ? "list"
                  : value.$type
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
    const program = this.programStory;
    for (const thread of callStack._threads) {
      const threadId = thread.threadIndex;
      // On the program engine a thread is named by the frame it runs.
      const name = program
        ? program.debugFrames(threadId)?.at(-1)?.name
        : thread.previousPointer.path?.toString();
      threads.push({
        id: threadId,
        name: name || "<unknown thread>",
      });
    }
    return threads;
  }

  /** The program engine's stack trace: each frame named from its symbol,
   *  at the line of the address it stands at (`ProgramStory.debugFrames`). */
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
    const frameCount =
      levels != null ? Math.min(startFrame + levels, frames.length) : frames.length;
    // A frame that stands at no address is the one running after a load,
    // which keeps no last instruction: it stands where the game last ran,
    // or where the runtime record the save carried last ran.
    const ran =
      this._executingLocation && this._executingLocation[0] >= 0
        ? this._executingLocation
        : this.lastExecutedScriptLocation();
    for (let i = startFrame; i < frameCount; i++) {
      const f = frames[i]!;
      const location =
        this.scriptLocationOf(f.address >= 0 ? f.address : undefined) ?? ran;
      const isFunction = f.type == PushPopType.Function;
      stackFrames.unshift({
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
    const program = this.programStory;
    if (program) {
      return this.getProgramStackTrace(program, threadId, startFrame, levels);
    }
    const stackFrames: StackFrame[] = [];
    const callStack = this._story.state.callStack;
    const threadIndex = threadId;
    const thread = callStack.ThreadWithIndex(threadIndex);
    if (thread) {
      const frameCount =
        levels != null ? startFrame + levels : thread.callstack.length;
      for (let i = startFrame; i < frameCount; i++) {
        const f = thread.callstack[i]!;
        if (f) {
          const pointerPath =
            f.previousPointer.path?.toString() ??
            f.previousPointer.container?.path?.toString();
          if (pointerPath) {
            const location =
              this.scriptLocationOf(pointerPath) ?? this._executingLocation;
            const documentLocation = this.getDocumentLocation(location);
            if (f.type == PushPopType.Function) {
              stackFrames.unshift({
                id: i,
                name: pointerPath || "<unknown function>",
                moduleId: "function",
                presentationHint: "normal",
                location: documentLocation,
              });
            } else {
              stackFrames.unshift({
                id: i,
                name: pointerPath || "<unknown tunnel>",
                moduleId: "tunnel",
                presentationHint: "normal",
                location: documentLocation,
              });
            }
          }
        }
      }
      return { stackFrames, totalFrames: thread.callstack.length };
    }
    return { stackFrames, totalFrames: 0 };
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

  /** Declare that what follows is a preview rather than a real run.
   *
   *  `preview()` runs last: the caller has to load a checkpoint and connect the
   *  game first, and `connect()` restores every module — which is where the
   *  audio module decides whether to resume whatever the route left playing. It
   *  reads `context.system.previewing` to decide, so the mode has to be set
   *  before the connect rather than at the end of `preview()`.
   *
   *  Do not call this on a game that is about to run for real: `Application`
   *  reads the same flag to decide whether to skip building a renderer.
   *
   *  Pass the address the cursor resolved to whenever there is one: the
   *  asset module reads it as the preview's anchor, to centre its
   *  prediction window; without an address the flag is simply `true` and it
   *  does not. The address a preview settled on afterwards is
   *  `previewedAddress`. */
  markPreviewing(previewAddress?: ProgramAddress): void {
    this._context.system.previewing =
      previewAddress != null && previewAddress !== "" ? previewAddress : true;
  }

  /** Run the story to the preview point's beat: from the loaded checkpoint
   *  when the route to it succeeded, else from the start of the flow. */
  protected runPreview(previewAddress: ProgramAddress) {
    if (this._simulation === "success") {
      this.continue(true);
      return;
    }
    // A failed route, or none: the same reason as the `start` fail branch.
    // Modules are already connected and mounted here, so a full `reset`
    // would clear the ui module's mounted layouts and `_events` and nothing
    // would mount again. Only the story needs resetting, which the jump
    // does, before jumping to the preview path — plus discarding any beats
    // the abandoned run left queued (see the start-branch residue audit;
    // idempotent between previews, where the queue is already drained).
    this.module.interpreter.clearQueuedBeats();
    this._startAddress = previewAddress;
    this.jumpTo(previewAddress);
    this.restoreReactiveTracking();
    this.continue();
  }

  /** Whether a preview's beat is running with its flush held back, to be
   *  displayed once the pictures it shows are resident. */
  get holdingFlush(): boolean {
    return this._holdingFlush;
  }

  /**
   * Preview the beat at a point in the script: run the story to the beat's
   * flush the way play does, hold back the coordinator that would display
   * it, wait until the pictures the beat shows are resident, then display
   * it, so its line and its portrait land together. What displays together
   * is the story's decision as it runs (a conditional, a divert, a
   * `[[hide]]`, a line of dialogue, a beat that spills into the next scene),
   * so nothing read off the source can say it; the beat itself can. A beat
   * with no picture to wait for displays at once, and so does one whose
   * pictures are already resident; the wait is bounded by the restore
   * timeout, after which the beat displays anyway. The layouts' bindings
   * refresh when the beat displays, as they do in play, so nothing the beat
   * changed shows before its line does.
   *
   * A run that stops short of its flush (at a breakpoint inside the beat,
   * or as a runaway) displays nothing, as it does in play. A preview that
   * starts while another is waiting takes over, whether or not its point
   * resolves, and so does a load, a recompile, a reset, a start, a connect,
   * a debug step, or the game's destruction: the earlier preview's wait
   * ends at once and it displays nothing, its point previews again when
   * asked, and its pin goes with the next beat's gate, right after that
   * gate's request, so a picture still queued for the beat the cursor has
   * left leaves the express lane once the beat it is on has asked for its
   * own (a load already in flight finishes there) and the page's
   * background queue stays paused between the two; when nothing waits (the
   * next beat needs no gate, the take-over's point resolves to none, a
   * debug step, whose beat displays at once) the pin goes at once and the
   * queue resumes, and it goes when its own load settles or with the game
   * in any case. A
   * repeat of the point whose preview is waiting settles with it. The
   * choices the last displayed beat presented leave before the wait, after
   * the beat's pictures have been asked for, so none of them can be clicked
   * while it waits and a run that stops short takes them away too; the
   * page's connect clears every transient target, the choice slots among
   * them, and forgets them for the game, so on the page's path the connect
   * takes them and this clear is for a host that previews without a connect
   * between (a route replay presents none). A handler that runs while the
   * beat waits repaints the layouts from the story's state, which the beat
   * has already changed, as it does in play when a handler runs while a
   * beat's own gate waits. The execution report is what the run executed,
   * taken when it stopped, so nothing a handler runs during the wait is in
   * it. With `restore_timeout` at 0 the wait is unbounded: the beat
   * displays when the page answers or the next update takes the preview
   * over. Resolves to the path previewed; to null when the point resolves
   * to none, or when the preview was taken over while it waited.
   */
  async preview(file: string, line: number): Promise<ProgramAddress | null> {
    if (this._state === "running") {
      // Don't preview while running
      return null;
    }
    const previewAddress = this.locator.addressAt(file, line, { beat: "last" });
    if (previewAddress == null) {
      // A preview call takes over a waiting preview whether or not its
      // point resolves; with no beat to gate, nothing waits, so an
      // abandoned pin goes now.
      this.cancelPreview();
      this.module.assets.releaseAbandonedGates();
      // A pure UI-only project (e.g. a `layout` with only reactive `{bindings}`)
      // has no narrative path to preview: every path-located flow is a synthetic
      // `__binding_*` evaluator, and those are excluded from preview candidates.
      // Its layouts were still mounted at connect, but nothing reveals the
      // layouts LAYER in this case — no content beat runs, so neither the
      // per-beat Coordinator reveal nor the UI-only `continue()` fallback fires,
      // and the layer stays at its mounted `opacity:0` (invisible). Reveal it
      // here so previewing a UI-only screen actually shows it. Idempotent.
      this.module.ui.reveal();
      return null;
    }
    if (this._previewedAddress === previewAddress) {
      return this._pendingPreview?.promise ?? previewAddress;
    }
    this.cancelPreview();
    this._previewFrom = { file, line };
    this._previewAddress = previewAddress;
    this._executingAddress = null;
    this._executingLocation = [-1, -1, -1, -1, -1];
    this.endSimulation();
    // A game that has never started is previewing from its first preview on,
    // as one constructed to preview is from birth.
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
      this.runPreview(previewAddress);
    } finally {
      this._holdingFlush = false;
      held = this._held;
      this._held = null;
      this._coordinator = null;
    }
    // What the run executed, taken now: nothing the story runs during the
    // wait (a handler) can join it.
    const executed = this.executedParams();
    // The gate for the beat's pictures: none for a run that stopped short
    // or a beat with nothing to wait for, and the asset module lets an
    // abandoned pin go either way.
    const gate = this.module.assets.gatePreviewBeat(
      held?.instructions ?? null,
    );
    // After the beat's pictures have been asked for, so that request is the
    // first thing out; before the wait, so none of the choices can be
    // clicked meanwhile; whether or not the run reached its flush.
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

  /** Display a held beat once its pictures are resident, unless something
   *  took the preview over while it waited, which ends the wait at once;
   *  the pending record and the gate go however the wait ends. */
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
      gate.release();
    }
    this.finishPreview(previewAddress, executed);
    return previewAddress;
  }

  /** Drop the pending record of the preview of `generation`, if it is
   *  still the pending one (a take-over may have replaced it). */
  protected forgetPendingPreview(generation: number): void {
    if (this._pendingPreview?.generation === generation) {
      this._pendingPreview = null;
    }
  }

  /** Report a preview once it has displayed what it displays: the run's
   *  execution as taken when the run stopped, sent after the display as
   *  `continue` sends it in play; then the modules' notice and the page's. */
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

  /** Take over from a preview. A waiting one ends its wait now and displays
   *  nothing, and its gate is abandoned: the asset module lets the pin go
   *  with the next beat's gate, at once when the caller issues none, when
   *  the load settles, or with the game, whichever is first, since a
   *  release before the next gate's request would let the page's
   *  background queue start loads beside the picture the next beat waits
   *  on. The point last previewed is forgotten either way, since what the
   *  caller is about to do replaces the state that preview showed. */
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

  /** Display a beat whose flush was held, doing what the flush would have
   *  done in `stepWithinBudget`: the coordinator, the interaction notice,
   *  the checkpoint, and the reveal of a run that displayed nothing. */
  protected displayHeld(instructions: Instructions | null) {
    this._coordinator = null;
    if (instructions) {
      this._coordinator = new Coordinator(this, instructions);
      this.noteShownChoices(instructions);
      if (
        !this._coordinator.shouldContinue() &&
        (!instructions.load || (instructions.choices?.length ?? 0) > 0)
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

  /** Where the last address the runtime record holds a location for
   *  stands. */
  protected lastExecutedScriptLocation(): ScriptLocation | null {
    const lastExecuted = this._runtimeState.pathsExecutedThisFrame
      .toArray()
      .findLast((address) => this.scriptLocationOf(address) !== undefined);
    return lastExecuted != null
      ? (this.scriptLocationOf(lastExecuted) ?? null)
      : null;
  }

  /** Where an address stands, as a script index and a range, or, for a
   *  flow named by its qualified name (a route's start), where the flow is
   *  declared; nothing for an address the program does not hold. */
  scriptLocationOf(
    address: ProgramAddress | null | undefined,
  ): ScriptLocation | undefined {
    return Game.scriptLocationIn(
      this._program,
      this._scripts,
      this._positions.locator,
      address,
    );
  }

  /** Where an address stands, as an editor takes a location. */
  documentLocationOf(
    address: ProgramAddress | null | undefined,
  ): DocumentLocation | null {
    const location = this.scriptLocationOf(address);
    return location ? this.getDocumentLocation(location) : null;
  }

  getDocumentLocation(location: ScriptLocation | null | undefined) {
    return Game.documentLocation(this._program, this._scripts, location);
  }

  /** The uri a location's script index names, as `documentLocation` gives it. */
  protected scriptUri(scriptIndex: number | undefined) {
    return scriptIndex != null
      ? (this._scripts[scriptIndex] ?? this._program.uri)
      : this._program.uri;
  }

  protected static scriptLocationIn(
    program: SparkProgram,
    scripts: readonly string[],
    locator: ProgramLocator,
    address: ProgramAddress | null | undefined,
  ): ScriptLocation | undefined {
    if (address == null || address === "") {
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
    if (typeof address !== "string") {
      return undefined;
    }
    return (
      program.knotLocations?.[address] ||
      program.stitchLocations?.[address] ||
      program.functionLocations?.[address] ||
      program.sceneLocations?.[address] ||
      program.branchLocations?.[address] ||
      undefined
    );
  }

  /** Where the story that runs `program` stands: the position its last step
   *  ran, which the player's worker names when the story runs away. */
  static storyLocation(
    story: Story,
    program: SparkProgram,
  ): DocumentLocation | null {
    const positions = storyPositions(story, program);
    const scripts = Object.keys(program?.scripts ?? {});
    // The position its last step ran, or, on the program engine after an
    // image was restored and before a step has run, where it stands.
    const location = Game.scriptLocationIn(
      program,
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

  static getActualBreakpoints(
    locator: ProgramLocator,
    breakpoints: { file: string; line: number }[],
  ) {
    const actualBreakpoints: Breakpoint[] = [];
    for (const breakpoint of breakpoints) {
      const closestInstruction = locator.locationOf(
        locator.addressAt(breakpoint.file, breakpoint.line, { functions: true }),
      );
      if (closestInstruction) {
        const closestStartLine = closestInstruction.startLine;
        const validBreakpoint = {
          verified: true,
          location: {
            uri: breakpoint.file,
            range: {
              start: {
                line: closestStartLine,
                character: 0,
              },
              end: {
                line: closestStartLine,
                character: 0,
              },
            },
          },
        };
        actualBreakpoints.push(validBreakpoint);
      } else {
        const invalidBreakpoint: Breakpoint = {
          verified: false,
          reason: "failed",
          message: "No instruction found at the breakpoint",
        };
        actualBreakpoints.push(invalidBreakpoint);
      }
    }
    return actualBreakpoints;
  }

  static getActualFunctionBreakpoints(
    functionLocations: Record<string, ScriptLocation> | undefined,
    breakpoints: { name: string }[],
    scripts: string[],
  ) {
    const actualBreakpoints: Breakpoint[] = [];
    for (const breakpoint of breakpoints) {
      const name = breakpoint.name;
      const functionLocation = functionLocations?.[name];
      if (functionLocation) {
        const [scriptIndex, line] = functionLocation;
        const validBreakpoint = {
          verified: true,
          location: {
            uri: scripts[scriptIndex]!,
            range: {
              start: {
                line: line,
                character: 0,
              },
              end: {
                line: line,
                character: 0,
              },
            },
          },
        };
        actualBreakpoints.push(validBreakpoint);
      } else {
        const invalidBreakpoint: Breakpoint = {
          verified: false,
          reason: "failed",
          message: "No instruction found at the breakpoint",
        };
        actualBreakpoints.push(invalidBreakpoint);
      }
    }
    return actualBreakpoints;
  }

  static getActualDataBreakpoints(
    dataLocations: Record<string, ScriptLocation> | undefined,
    breakpoints: { dataId: string }[],
    scripts: string[],
  ) {
    const actualBreakpoints: Breakpoint[] = [];
    for (const breakpoint of breakpoints) {
      const dataId = breakpoint.dataId;
      const dataLocation = dataLocations?.[dataId];
      if (dataLocation) {
        const [scriptIndex, line] = dataLocation;
        const validBreakpoint = {
          verified: true,
          location: {
            uri: scripts[scriptIndex]!,
            range: {
              start: {
                line: line,
                character: 0,
              },
              end: {
                line: line,
                character: 0,
              },
            },
          },
        };
        actualBreakpoints.push(validBreakpoint);
      } else {
        const invalidBreakpoint: Breakpoint = {
          verified: false,
          reason: "failed",
          message: "No variable found at the breakpoint",
        };
        actualBreakpoints.push(invalidBreakpoint);
      }
    }
    return actualBreakpoints;
  }
}
