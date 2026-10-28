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
import {
  buildRouteSimulator,
  lastSearchStats,
  planRoute,
  showsBeatAhead,
  routeChargeAt,
  stepsBeforeDeparture,
  sameFavoredReads,
  type LevelZeroStore,
  type LevelZeroWork,
  type SearchOptions,
  type RoutePlan,
  type RouteResumePoint,
} from "@impower/sparkdown/src/compiler/utils/planRoute";
import {
  routeDecisions,
  type ScriptLoop,
} from "@impower/sparkdown/src/compiler/utils/routeDecisions";
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
    address !== undefined &&
    position != null &&
    position.offset === 0 &&
    position.after === chunkOfAddress(address)
  );
};

/** A value the editor can receive and evaluate an expression against: a
 *  primitive, or plain data made of them. */
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

  protected _story!: ProgramStory;
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

  /** The program whose scenes the tracker last observed (#657). A program
   *  given since is compared with it at the next observation: the tracker
   *  and the prediction window stand while its scenes do. */
  protected _sceneProgram?: SparkProgram;

  /** Counts the programs whose engine ran the declarations rather than
   *  carrying the run of the engine before it (#1759, #657): two programs
   *  given under one count define the same tables and the same functions. */
  protected _declarationsRun = 0;
  get declarationsRun() {
    return this._declarationsRun;
  }

  /** What the last display began from, and what the programs given since
   *  changed (#657): the program it showed, where its beat starts, the
   *  route it was replayed along, and the scenes the compiles since emitted
   *  or dropped a statement in (`""` for a declaration), `unmeasured` when a
   *  compile was not measured against the program before it. */
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

  /** Whether the replay of the planned route wrote the story's state from
   *  the step before its target to the checkpoint taken at the target
   *  (#657): the checkpoint holds what the target's own statement wrote,
   *  which the steps before it do not show. Unknown until a replay watched
   *  it to its end. */
  protected _routeTargetWrote?: boolean;
  /** The visits that stretch counted, in order (#657): a call of a
   *  function the beat's text interpolates counts one in every replay, and
   *  the checkpoint holds the same counts when two replays counted the same
   *  visits. Unknown as the writes are. */
  protected _routeTargetVisits?: string;
  /** Whether the replay of the planned route, from wherever it began, drew
   *  from the story's seed or read a value no story state holds (#657): a
   *  replay from the route's start makes a story state with a seed of its
   *  own, and a clock reads another time, so the same steps can leave
   *  another state. Unknown until a replay ran. */
  protected _routeUnrepeatable?: boolean;
  /** The reactive changes taken when the watch began, given back when it
   *  ends, and the story's state the write marks do not see then; set
   *  while it runs. */
  protected _targetWatch?: {
    changes: { globals: Set<string>; tables: Set<object> };
    unmarked: string;
    state: ProgramStoryState;
  };

  protected _executingLocation: ScriptLocation | null = null;

  /** Where the beat the game waits on stands: the last line the beat ran,
   *  which is not the last instruction the story ran when the beat's
   *  continue went on to cut the next line (#1756). Nothing while the game
   *  does not wait. Kept until the story moves on or its state is replaced
   *  (a continue, a step, a jump, a rewind, a restore, a load, another
   *  program), and not by the story's last address, which a host's call
   *  into the story (`EvaluateFunction`) moves while the beat still waits,
   *  and which two beats can share. */
  protected _awaiting: ScriptLocation | null = null;

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

  /** Whether the debugger has heard a stop (a step's or a breakpoint's)
   *  since the current `step` began. */
  protected _announcedStop = false;

  protected _nextObjectVariableRef = 2000; // Start at 2000 to avoid conflicts with scope handles

  protected _objectVariableRefMap = new Map<number, object>();

  // The records `getTableRecord` made of Luau tables, each with its keys in
  // the order the view lists them. A table's keys are all its own entries,
  // so the view reads them without the `$` metadata conventions of the
  // other records it shows (a define's `$type` and `$name`).
  protected _tableRecords = new WeakMap<object, string[]>();

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

  /** The point `preview()` last previewed: its line, and the address it
   *  named when that is not the one the line resolves to. */
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

  /** The addresses of the line and function breakpoints, by kind, which
   *  `_breakAddresses` joins: the game stops after a step that ran an
   *  instruction whose address it holds. */
  protected _lineBreakAddresses = new Set<number>();
  protected _functionBreakAddresses = new Set<number>();
  protected _breakAddresses = new Set<number>();
  /** Whether the step in under way has run an instruction of a function's
   *  entry code, and stops once that entry code has run. */
  protected _steppingInThroughEntry = false;
  /** The entry code a step in runs through (`programEntryCode`), for the
   *  program root it was read from. */
  protected _entryCode: { root: unknown; addresses: Set<number> } | null =
    null;

  protected entryCode(): Set<number> {
    const root = this.programStory.root;
    if (this._entryCode?.root !== root) {
      this._entryCode = { root, addresses: programEntryCode(root) };
    }
    return this._entryCode.addresses;
  }

  /** The addresses of the instructions the story's current step ran
   *  (`ProgramStory.executedLog`), reused from step to step. */
  protected _executedLog: number[] = [];
  /** The addresses the story's current step logged for the beat that shows
   *  what they ran (`ProgramStory.beatLog`), reused from step to step. */
  protected _beatLog: number[] = [];

  /** The variables the data breakpoints watch: a global by its name, or a
   *  temporary of the frame named `scope`. Between steps the game notes
   *  where each is bound now (`locateWatch`) and the value object it holds;
   *  during a step the engine reports each write to a bound variable
   *  (`VariablesState.writeWatch`), and a write to the binding noted marks
   *  the watch `written`. */
  protected _dataWatches: {
    /** The breakpoint's data id, which a save names the watch by. */
    dataId: string;
    scope?: string;
    name: string;
    /** The block scope a temporary was found in, which the watch keeps
     *  while a frame named by its scope holds it. */
    blockScope: Map<string, InkObject> | null;
    /** The pointer that block scope held for the variable, when the frame
     *  binds it to one (a variable passed by reference, or one a closure
     *  captured), which the watch follows while no frame named by its
     *  scope runs. */
    pointer: VariablePointerValue | null;
    /** The story's variables when the pointer was noted. */
    pointerState: object | null;
    /** Where a write to the variable lands (`VariablesState.BindingOf`),
     *  and its name there; `undefined` when no such variable is in scope. */
    binding: VariableBinding | undefined;
    bindingName: string;
    last: unknown;
    written: boolean;
  }[] = [];

  /** A tag for each cell a save noted for a data breakpoint, unique to the
   *  cell across sessions, which the save writes beside the cell's id: a
   *  load binds a watch to the cell it read under that id only when the
   *  watch holds the cell the tag names, the cell it held when the save was
   *  written, or the cell an earlier load of the save bound it to. */
  protected _cellTags = new WeakMap<VariablePointerValue, string>();

  protected cellTag(cell: VariablePointerValue): string {
    let tag = this._cellTags.get(cell);
    if (tag === undefined) {
      tag = uuid(16);
      this._cellTags.set(cell, tag);
    }
    return tag;
  }

  /** The engine's write watch while a data breakpoint is set: marks each
   *  watch whose binding a write reached. */
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
  // Whether the define tables in `_context` have been built: a story that
  // took over the declarations' run of the engine before it
  // (`ProgramStory.declarationsCarried`) keeps the tables built from that
  // run (#1759).
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
  /** The route the last replay followed, or nothing when none has run. Read by
   *  a caller deciding whether to plan another; it is the game's own record, so
   *  a reader must not hold it across a replay. */
  get plannedRoute(): RoutePlan | null {
    return this._plannedRoute;
  }

  protected _previewRoute?: PreviewRoute;
  /** The route the preview the game displays took (`previewRouteOf`), which
   *  `game/executed` reports; set by whatever displays the preview, and
   *  cleared for a preview no route reached. */
  get previewRoute(): PreviewRoute | undefined {
    return this._previewRoute;
  }
  set previewRoute(value: PreviewRoute | undefined) {
    this._previewRoute = value;
  }

  /** Which compile the planned route was replayed in
   *  (`SparkProgram.changes.id`). A later compile says which program its own
   *  changes are measured against, and only a route replayed in THAT program
   *  can be read against them. */
  protected _plannedRouteChangeId?: number;

  /** The root the planned route was replayed in, where its steps'
   *  addresses stand (`validAddressPrefixLength`). */
  protected _plannedRouteRoot?: ProgramRoot;

  protected _plannedRouteStepCursor: number = 0;

  /** What the route searches from the top kept of their level zero, by
   *  search key (`LevelZeroWork`), held in the root and the compile named
   *  below: a later search starts from one only while the program still
   *  holds what that level zero ran (`levelZeroStore`). */
  protected _levelZeroWorks = new Map<string, LevelZeroWork>();

  protected _levelZeroRoot?: ProgramRoot;

  protected _levelZeroChangeId?: number;

  /** The index of each step of the planned route by its identity, built
   *  when a caller asks for a step by identity alone (`stepCheckpoint`): a
   *  route through a long loop holds hundreds of thousands of steps, and a
   *  caller that names the index it expects reads the step there. */
  protected _plannedRouteStepMap: Map<string, number> | null = null;

  /** Per checkpoint, the planned-route step the story was about to run when it
   *  was captured; see {@link checkpoint}. */
  protected _checkpointStepCursors: (number | undefined)[] = [];

  /** The last beat the replay under way displayed: the instructions its
   *  flush took. Nothing before the replay displays one. */
  protected _shownBeat?: Instructions;

  /** Per checkpoint, the replay's `_shownBeat` when it was captured, which a
   *  replay resumed from the checkpoint starts from. */
  protected _checkpointShownBeats: (Instructions | undefined)[] = [];

  /** Whether a run from where the last replay reached its target displays a
   *  beat before the story ends, the beat on screen there included
   *  (`noteRouteTarget`); unknown until a replay reached one. */
  protected _routeTargetShows?: boolean;
  get routeTargetShows() {
    return this._routeTargetShows;
  }

  protected _checkpoints!: CheckpointStore;
  get checkpoints() {
    return this._checkpoints;
  }

  // The game's own version string (`GameConfiguration.version`).
  protected _version = "";
  // How many beats a save holds, and how many the story keeps restorable
  // during play (docs/engine/binary-program.md, section 7).
  protected _saveHistory = 16;
  protected _rewindBeats = 128;

  /** The story, which keeps images of its beats: the checkpoints are its
   *  images, and a save is its durable save (docs/engine/binary-program.md,
   *  section 7). */
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

    // The story is checkpointed by its beats' images.
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
        composeBeats: options?.composeBeats,
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

  updateProgram(program: SparkProgram) {
    // A preview waiting for its pictures would display a beat of the old
    // program.
    this.cancelPreview();
    // The beat waited on is a location in the old program.
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
    // The program engine presents the members of `Story` this game reads on
    // the paths it runs (see `ProgramStory`). It shares the pristine copies
    // its images read with the engine of the program before, so a checkpoint
    // taken there restores here for every statement this program kept
    // (`restoreCheckpoint`), and it keeps the image of each beat, which a
    // checkpoint and a save at a menu hold.
    // It also takes over the globals of the engine before, with what that
    // engine recorded of the declarations' run they descend from, when this
    // program runs the same declarations (`carriedDeclarations`, #1759): it
    // runs none and snapshots no table, and the define tables built from
    // that run stand (`assignRuntimeDefines`).
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
    }
    this.noteChangedFlows(before, program);
    this._story = engine;
    this._positions = storyPositions(this._story, this._program);
    this.setupStory(this._story);
    this.restoreReactiveTracking();
    // The breakpoints set last resolve against this program: a statement
    // the compile emitted again has new addresses.
    this.resolveBreakpoints();
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
      // The scene map may have changed with the program. The next
      // observation compares it with the one the tracker observed, and when
      // it changed, re-enters the current scene and re-requests what it
      // needs (`settleSceneMap`, #657).
    }
    return this._program;
  }

  /** A display begins: what changes from here is measured from the program
   *  it shows, and from where its beat starts. */
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

  /** Watch the story's writes from here to the checkpoint at the route's
   *  target: a global, a table, a closed-over cell, or the random state a
   *  draw advances; and log the visits counted. The beat's statement may
   *  call functions and builtins: it runs again from the checkpoint in a
   *  beat-only display as in a full one, and what its calls change is what
   *  the watch sees. The reactive changes pending now are kept aside and
   *  given back when the watch ends, so no binding misses one. A watch that
   *  would share the write marks with another tracker leaves the answer
   *  unknown. */
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

  /** The story's state that changes without a write mark and the watch
   *  refuses any change of: the seed and last draw, which every random draw
   *  reads and advances. Visits are compared between replays instead
   *  (`_routeTargetVisits`). */
  protected unmarkedState(): string {
    const state = this._story.state;
    return `${state.storySeed}:${state.previousRandom}`;
  }

  /** End the watch `watchTargetWrites` began, recording what it saw. */
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
    // A state made anew during the watch kept no log of what it counted.
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

  /** The route planned and replayed in the program the game holds, if the
   *  last one was. */
  protected routeOfProgram(): RoutePlan | undefined {
    const route = this._plannedRoute;
    return route &&
      this._plannedRouteRoot === this._story.root &&
      this._simulation === "success"
      ? route
      : undefined;
  }

  /** Whether `route` reaches its target along the steps `before` reached
   *  its own: from the same flow, through the same statements with the same
   *  decisions, every step before the target. A chunk the compile kept keeps
   *  its id, so a step that ran the same statement has the same address. */
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

  /** Where the beat at `address` starts in its script. */
  protected beatStart(
    address: ProgramAddress,
  ): { uri: string; line: number } | undefined {
    const at = this.locator.locationOf(address);
    return at ? { uri: at.uri, line: at.startLine } : undefined;
  }

  /** Add the flows the compile of `program` changed, measured against
   *  `before`, to those changed since the last display began. */
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

  /**
   * Compare the scenes of the program the tracker last observed with the
   * program now held, once per program given (#657). When they differ, the
   * tracker starts over, so the observation re-enters the current scene,
   * and the asset module lays its prediction window out again. They stand
   * when every flow is the same kind with the same successors and calls,
   * and holds the same beats with the same assets, except the beat at
   * `cursor`: that beat is the one the preview runs again, and its pictures
   * go through the preview's own gate.
   */
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

  /** Whether the scenes of `before` differ from those of the program now
   *  held, as `settleSceneMap` compares them. */
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
    //
    // The revision names more than the define tables read, though: it moves
    // whenever the compile's own implicit definitions differ (the filtered
    // image a directive such as `[[hero_concerned:gloves]]` implies), which an
    // edit of one word of a directive does, and those reach the game through
    // the assets channel, not the story. The tables are a function of the
    // declarations' run, so a story that took over the run of the engine
    // before it (#1759) leaves in place the tables built from that run, or
    // from the run it descends from, whatever the revision says. Its globals
    // are those the engine before held, which the story may have written
    // since, so the tables are never built from them.
    const revision = this._program?.contextRevision;
    if (revision !== undefined && revision === this._definesContextRevision) {
      return;
    }
    if (this._story.declarationsCarried && this._definesContextBuilt) {
      this._definesContextRevision = revision;
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
    this._definesContextBuilt = true;
  }

  /** What the engine of `before`, the program the game held, hands the
   *  engine of `program` in place of a run of the declarations (#1759):
   *  given only when the compile that made `program` was measured against
   *  `before` and ran no other declaration and no other function
   *  (`ChunkChanges.initializers`, the compiler's own rule for running the
   *  declarations again), and when the engine finds `program`'s root runs
   *  the declarations its own does (`ProgramStory.declarationsFor`). A
   *  program measured against another one, a program of another compiler,
   *  and a game's first program run them. */
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
      // The story reports its errors as the step that raised them ends, before
      // that step's location is recorded, so an error names the content that
      // raised it, and the last recorded step only when that content has no
      // location.
      this.Error(
        raised?.message ?? message,
        type === InkErrorType.Warning ? ErrorType.Warning : ErrorType.Error,
        this.scriptLocationOf(raised?.address ?? this._positions.previous()) ??
          this._executingLocation,
      );
    };
    // The program engine calls no hook per step: the game reads the address
    // of each step it takes (`stepWithinBudget`), which records it and
    // compares it with the breakpoints' addresses.
    story.onExecute = null;
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
      // Plan a route from the top of the flow the start point stands in, or
      // first from the story's start inside a scene that takes parameters
      // (`routesFromStartFirst`).
      const to = this._startAddress;
      const from = this.routeStartOf(to);
      // The replay below starts by loading a checkpoint or jumping to the
      // route's start, either of which replaces the story state, so the
      // search need not restore one of its own first.
      const budget = { callerResetsStory: true };
      let route;
      if (this.routesFromStartFirst(to)) {
        route = Game.planRouteFromStart(
          this._story,
          this._program,
          to,
          simulationOptions,
          budget,
        );
        // Only a search that ran the story out shows that no run reaches
        // the address; one cut short by a ceiling, or stopped by an error,
        // is what the author is told.
        if (!route && lastSearchStats.endReason === "exhausted") {
          route = Game.planRouteInFlow(
            this._story,
            this._program,
            from,
            to,
            simulationOptions,
            budget,
          );
        }
      } else {
        route = Game.planRoute(
          this._story,
          this._program,
          from,
          to,
          simulationOptions,
          budget,
        );
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

  /**
   * Turn a route search that came back empty into the reason it did.
   *
   * Checking whether the target is a real address first is not
   * belt-and-braces: a line that is not part of the story flow (front matter,
   * a `define` block, the gap between scenes) resolves to `TOP_LEVEL_START`,
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
    return address == null
      ? null
      : (this._positions.locator.sceneAt(address) ?? null);
  }

  /** The flow a route to `address` starts at the top of: the scene the
   *  address stands in, or the top-level content. */
  routeStartOf(address: ProgramAddress): string {
    return this.sceneOf(address) ?? "0";
  }

  /** Whether a route to `address` is searched from the story's start before
   *  the top of its scene: the scene takes parameters, which bind what the
   *  divert that enters it passes, and a route from its top passes none, so
   *  binds nil for each (#664). The route from the scene's top is the one
   *  that stands only when no run from the story's start reaches the
   *  address (#1608). */
  routesFromStartFirst(address: ProgramAddress): boolean {
    const scene = this.sceneOf(address);
    return scene !== null && this._story.takesParameters(scene);
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
    // Once per program given: whether its scenes are the ones observed.
    this.settleSceneMap(address);
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
    this.beginChangesSince();
    this._connection.connectOutput(send);
    // Everything the connect restores, and whatever it goes on to display,
    // is a new stream: what the last one still had in flight must not land
    // on it.
    const epoch = this._connection.beginEpoch();
    // Before the modules connect, so the scene's assets are requested before
    // the restore gate waits on the ones already on screen.
    const previewing = this._context.system.previewing;
    this.observeScene(
      typeof previewing === "number" ? previewing : this._positions.current(),
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
    this.module.ui.markRestored();
  }

  /**
   * A beat-only display's stand-in for `connect` (#657): the screen the page
   * shows keeps its structure, and only its content is reconciled. It does
   * what `connect` does except what the structure needs: the modules do not
   * connect, the tree, its handlers, the theme and the cache sizes stand,
   * and the scene is observed against the tracker that stood
   * (`settleSceneMap`), so a scene whose map is unchanged is not entered
   * again and nothing is predicted again. The ui module clears the targets a
   * connect clears, in a content pass, and restores the module state as a
   * connect does; the asset module waits only for the restored pictures the
   * page was not showing. The audio module's restore is left out: its
   * mixers come from the define tables, which stand, and a preview resumes
   * no channel. The choices the last beat presented are kept, so the
   * preview's `clearChoices` takes them and their click observers off.
   *
   * Only for a display `beatOnlyRefusal` does not refuse.
   */
  async redisplay(send: (message: Message, transfer?: ArrayBuffer[]) => void) {
    this.cancelPreview();
    this.beginChangesSince();
    this._connection.connectOutput(send);
    const epoch = this._connection.beginEpoch();
    const previewing = this._context.system.previewing;
    this.observeScene(
      typeof previewing === "number" ? previewing : this._positions.current(),
    );
    // Read before the redisplay begins, which takes the standing screen.
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

  /**
   * Why the next display of the preview at `cursor` must connect in full,
   * or null when it can be beat-only (#657), as far as the game knows: the
   * page shows a screen the game composed (`unshown`), whose last beat
   * changed only written content (`screen`), over a tree whose building
   * wrote none of the story's state (`bindings`); the program held runs the
   * declarations the tree was built under (`declarations`), in a context of
   * the same base (`context`); it builds the same tree (`layouts`); and its
   * scenes are those observed, apart from the beat at the cursor
   * (`scenes`). The worker adds what only it knows: a fresh application,
   * PLAY, a swap between a suggestion and the real program, and the
   * checkpoint.
   */
  beatOnlyRefusal(cursor: ProgramAddress | null | undefined): string | null {
    const ui = this.module.ui;
    const refused = ui.beatOnlyRefusal();
    if (refused) {
      return refused;
    }
    // The state the beat runs from is the one the display the page shows ran
    // its beat from: it shows the same beat, and its route reached it along
    // the same statements with the same decisions. The route's checkpoint is
    // taken at the beat's first statement in each program, so it is a value
    // of its own every time and cannot be compared by identity; the route
    // says what ran before it. What the beat's own statement wrote before the
    // capture is in the checkpoint too, and the route does not show it, so a
    // target that wrote the story's state in either replay, or counted other
    // visits in one than in the other, or one not watched to its end,
    // connects. So does a replay that drew from the story's seed or read a
    // value no story state holds: the same steps may have left another
    // state. The statement may call what it likes: a beat-only display runs
    // it again from the checkpoint, as a full one does.
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
    // Only the flow the cursor stands in changed.
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

  /** Where a run from `startFrom` begins: its `address` when it names one
   *  (a position no line resolves to, such as the end of a scene that runs
   *  nothing of its own), and otherwise the address of the beat on the line
   *  (`ProgramLocator.addressAt`), or `TOP_LEVEL_START`, the top of the
   *  top-level content, when the line has none. A line that `>` breaks holds
   *  several beats: PLAY from the line starts at its first, and the route a
   *  preview of the line replays ends at its last (`beat`), so the beats
   *  before it run, and apply what they do, as any beat on the route does. */
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

  /** The lines of `search` a debugger may set a breakpoint on: the lines the
   *  chunks' line tables start rows on. */
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

  /** Joins the breakpoint addresses of every kind. */
  protected joinBreakAddresses() {
    this._breakAddresses = new Set([
      ...this._lineBreakAddresses,
      ...this._functionBreakAddresses,
    ]);
  }

  /**
   * Notes where a data breakpoint's variable is bound now and the value
   * object it holds. A global is bound by its name. A temporary is found in
   * the block scope that held it when the watch last found it, while a frame
   * named by the watch's scope still holds that block scope, so a temporary
   * of the same name declared in an inner block shadows it without being it;
   * otherwise it is found anew, in the innermost frame named by the scope,
   * from its innermost block scope out. A temporary bound to a pointer (a
   * variable passed by reference, or one a closure captured) is bound where
   * the pointer leads, which a write through it reaches. Nothing is bound
   * when no such variable is in scope.
   */
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
      // A reset gives the story other variables, which no pointer of the
      // earlier ones reaches (a load, which keeps them, carries the pointer
      // to the cell it read for the variable, or drops it:
      // `loadProgramSave`).
      watch.pointer = null;
      watch.binding = undefined;
      watch.bindingName = watch.name;
      watch.last = undefined;
      return;
    }
    // A variable the frame captured outlives the frame: while no frame
    // named by the scope runs, the watch keeps the variable it captured,
    // through the pointer the frame held, which a later call of the same
    // closure binds again (inside a builtin step, say, which runs and
    // returns the call within the step).
    const { binding, name } = scope
      ? variablesState.BindingOf(scope, watch.name)
      : variablesState.BindingThrough(watch.pointer!);
    watch.binding = binding;
    watch.bindingName = name;
    watch.last = this.valueAtBinding(program, binding, name);
  }

  /** The value object a binding holds for the variable `name`. */
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

  /** Notes where each data breakpoint's variable is bound now and what it
   *  holds, so that only a step that writes it stops the game: a load, a
   *  jump or a replay between steps changes it without a step. */
  protected refreshDataWatches() {
    const program = this.programStory;
    for (const watch of this._dataWatches) {
      this.locateWatch(program, watch);
    }
  }

  /** Whether the step that ran last wrote another value to a data
   *  breakpoint's variable: the engine reported a write to the binding the
   *  watch noted before the step, and the binding holds another value
   *  object than it did. A declaration binds a new variable, which the
   *  engine does not report, so a temporary declared again, in its own
   *  block, an inner one or another invocation of its function, is not
   *  written. Notes where each is bound for the next step. */
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
    // A line's breakpoint is the address `addressAt` gives it: a beat's
    // `LineStart`, or the start of the statement or part on the line.
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

  protected updateFunctionBreakpointsMap(
    functionBreakpoints: { name: string }[],
  ) {
    this._requestedBreakpoints.functions = functionBreakpoints;
    const program = this.programStory;
    // A function's breakpoint is the address its code starts at.
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
    // A variable's breakpoint watches the variable itself, which a
    // temporary of the same name can shadow, so it is no set of
    // addresses: the game stops after a step that wrote another value to
    // it. It is placed on the first instruction in the source that
    // assigns that name in its scope.
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

  static planRoute(
    story: ProgramStory,
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
      | "levelZeroStore"
    >,
  ) {
    const route = Game.planRouteInFlow(
      story,
      program,
      from,
      to,
      simulationOptions,
      budget,
    );
    if (
      route ||
      from === "0" ||
      budget?.resumeFrom ||
      lastSearchStats.endReason !== "exhausted"
    ) {
      return route;
    }
    // The flow holds no way to the target from its top: a branch that only a
    // divert from outside its scene enters is one. The story's start may
    // reach it, through the divert that enters it and with the arguments
    // that divert passes (#1606). Only a search that ran the flow out tries
    // this one: a search cut short by a ceiling would only be cut short
    // again, on more of the story.
    return Game.planRouteFromStart(story, program, to, simulationOptions, budget);
  }

  /** Plan a route from the top of the flow `from` to `to`, within that
   *  flow: the flow is entered with no arguments, so a scene that takes
   *  parameters binds nil for each (#664). */
  static planRouteInFlow(
    story: ProgramStory,
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
      | "levelZeroStore"
    >,
  ) {
    return planRoute(story, from, to, {
      ...budget,
      functions: Object.keys(program.functionLocations || {}),
      stayWithinKnot: true,
      favoredConditions: simulationOptions?.[from]?.favoredConditions,
      favoredChoices: simulationOptions?.[from]?.favoredChoices,
    });
  }

  /** Plan a route from the story's start to `to`, through whatever flows
   *  the story diverts into on the way, so the flows the route enters take
   *  the arguments the diverts that enter them pass. */
  static planRouteFromStart(
    story: ProgramStory,
    program: SparkProgram,
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
      | "levelZeroStore"
    >,
  ) {
    return planRoute(story, "0", to, {
      ...budget,
      functions: Object.keys(program.functionLocations || {}),
      stayWithinKnot: false,
      favoredConditions: simulationOptions?.["0"]?.favoredConditions,
      favoredChoices: simulationOptions?.["0"]?.favoredChoices,
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
    const index = this.stepCheckpoint(seq, expected);
    return index === null ? null : this._checkpoints.getJson(index);
  }

  /** The index of the checkpoint `getCheckpoint` would write, when it would
   *  write one: a route's resumption asks whether there is one, which needs
   *  no save written (#1758). */
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
              // Deeper than the caller established is safe. A step's own
              // checkpoint number is stamped when the step is reached, and the
              // engine runs a whole beat between one stamp and the next, so a
              // checkpoint stamped on a step inside the unchanged part of the
              // route can still have been taken with the story standing past
              // it (see `findResumePoint`).
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

  /** Whether the story writes a save of `image` (`ProgramStory.saveOfImage`
   *  answers one rather than nothing): it places the image's beat, which
   *  for an image taken just after a choice is the beat before its menu. */
  protected writesImage(image: unknown): boolean {
    const taken = image as ProgramImage;
    return this._story.canRestore(taken.afterChoice?.menu ?? taken);
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
    this._checkpoints.truncate(fromCheckpoint + 1);
    this._checkpointStepCursors.length = fromCheckpoint + 1;
    this._checkpointShownBeats.length = fromCheckpoint + 1;
    this._routeTargetShows = undefined;
    this._routeErrors = this._routeErrors.filter(
      (e) => e.at <= fromCheckpoint,
    );
    this._plannedRoute = route;
    this._plannedRouteChangeId = this._program.changes?.id;
    this._plannedRouteRoot = this._story.root;
    this._simulateFlow = route.from;
    this._startAddress = route.to;
    // Force the story to follow this route
    this._story.simulator = buildRouteSimulator(route.decisions, fromDecision);
    this._plannedRouteStepMap = null;
    this._plannedRouteStepCursor = fromStep;
    this._routeTargetWrote = undefined;
    this._routeTargetVisits = undefined;
    this._routeUnrepeatable = undefined;
    const drawn = storyDraws.count;
    const read = ambientReads.count;

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
    let unrepeatable: boolean | undefined;
    try {
      // The checkpoint's image is restored in place.
      this.replayRoute(route, fromCheckpoint);
      // Counted before the target is asked about, whose run draws and reads
      // nothing the route's checkpoints keep.
      unrepeatable = storyDraws.count !== drawn || ambientReads.count !== read;
      this.noteRouteTarget();
    } finally {
      // A replay that stopped short of its target leaves the answer unknown.
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

  /**
   * After a replay reached its target, put the beat on screen there in the
   * target's checkpoint when a run from the target would display none (#1606).
   *
   * A target whose own beat is queued displays it. Any other (a `done`, a
   * `fin`, a divert, a line of logic) is run on as far as the next thing it
   * shows, by the story alone (`showsBeatAhead`), and the target's checkpoint
   * puts the game back where the replay left it. A run that would show
   * nothing before the story ends gets the last beat the replay displayed
   * queued again, and the checkpoint is taken again with it: the story stands
   * where it reached the target, with everything the lines before it did,
   * and the display and PLAY from there show that beat first, waiting, so the
   * next click runs on into the target.
   */
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
    // Held: it waits for the player even where it first advanced on its own
    // (a layout-only beat, an auto beat). A run from the top never meets it.
    this.module.interpreter.requeue({ ...this._shownBeat, hold: true });
    const cursor = this._checkpointStepCursors[last];
    this._checkpoints.truncate(last);
    this.checkpoint();
    this._checkpointStepCursors[last] = cursor;
    this._checkpointShownBeats[last] = this._shownBeat;
    this._routeTargetShows = true;
  }

  /** Whether a run jumped straight to `address`, as a preview or PLAY of a
   *  line no route reaches runs, displays a beat before the story ends. The
   *  story is left where that run stopped, so the game is put at its start
   *  point again before it runs. */
  jumpShowsBeat(address: ProgramAddress): boolean {
    this.jumpTo(address);
    return showsBeatAhead(this._story);
  }

  protected replayRoute(route: RoutePlan, startCheckpoint: number) {
    const resumed =
      startCheckpoint >= 0 && this.restoreCheckpoint(startCheckpoint);
    this._shownBeat = resumed
      ? this._checkpointShownBeats[startCheckpoint]
      : undefined;
    if (!resumed && startCheckpoint >= 0) {
      // A checkpoint the program can no longer place: the route replays
      // from its start, and every checkpoint and step it stamps is its own.
      this._checkpoints.truncate(0);
      this._checkpointStepCursors.length = 0;
      this._checkpointShownBeats.length = 0;
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
      this.jumpToFlow(route.from);
    }

    this._simulation = "simulating";
    this._context.system.simulating = route.from;

    this._executingAddress = null;
    this._executingLocation = null;

    if (this._plannedRouteStepCursor >= route.steps.length - 1) {
      // The replay resumes at the target, or the step before it.
      this.watchTargetWrites();
    }
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
    const validSteps = validAddressPrefixLength(
      route.steps,
      this._plannedRouteRoot,
      this._story.root,
      this._program.changes,
      this._plannedRouteChangeId,
    );
    // The route still ends where it is wanted, so it is worth replaying it
    // before searching for another. Replaying is what happens after a search
    // in any case, and from no deeper a checkpoint than this one — so trying
    // it first costs a second replay when the route no longer holds, and
    // saves the whole search when it does.
    // The route's own steps are kept only while every one of them still
    // holds: a step past the valid prefix names a statement the compile
    // emitted again, whose decisions the route's forced ones no longer
    // name, so the rest is searched for.
    const replayOnly = route.to === to && validSteps === route.steps.length;
    if (route.fallback) {
      // A route origin/main's search found (`planRoute`) is resumed and
      // replayed as origin/main's preview resumes its own routes: from the
      // deepest checkpoint the new program agrees with, by origin/main's
      // search alone (a resume point without a charge).
      const resume = this.findResumePoint(validSteps);
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
    // A search resumed inside the route keeps every decision before the
    // point it resumes from, and a search from the top forces a verdict
    // against the program only where the target needs it (`planRoute`).
    // So a search resumes no later than the route's first such verdict, or
    // the preview would show a branch the route took for another line.
    const searchSteps = replayOnly
      ? validSteps
      : Math.min(validSteps, stepsBeforeDeparture(route));
    // The replay after it is held only by what the new program still agrees
    // with: it forces whatever the new route decides, so a checkpoint past
    // the route's forced verdicts holds a state it can resume from wherever
    // the new route takes the same steps (`replayPatchedRoute`). Looked for
    // first, since each look leaves the story holding the checkpoint it
    // read, and the search's own point is the one a search runs from.
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

  /** How many searches' level-zero work a game keeps: a flow's own search
   *  and the search from the story's start that can follow it
   *  (`planRoute`). */
  protected static readonly LEVEL_ZERO_WORKS = 2;

  /** Where this game's route searches keep and find level zero's work
   *  (`SearchOptions.levelZeroStore`): a search finds work only while the
   *  program still holds what that level zero ran. */
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

  /** Whether a route to `to` is searched from the top of `from`, favoring
   *  `favored`, without first resuming at `resumeFrom`: the program still
   *  holds level-zero work of a search from that flow whose level zero never
   *  stood in the chunk `to` stands in. When that level zero read the same
   *  favored verdicts and choices, the search starts from it and finds the
   *  route a search from the top finds, at the cost of the levels after
   *  level zero. When it read others, which a search that remembers its
   *  route writes, a search from the top runs level zero again and keeps
   *  work for these; it is chosen only when the resumed search would run
   *  more than half of that level zero again itself, so a scrub pays at most
   *  about twice what resuming costs. */
  searchesFromLevelZeroWork(
    from: string,
    to: ProgramAddress,
    favored: {
      favoredConditions?: (boolean | undefined)[];
      favoredChoices?: (number | undefined)[];
    } = {},
    resumeFrom?: RouteResumePoint,
  ): boolean {
    const chunk = chunkOfAddress(to);
    for (const work of this.heldLevelZeroWorks().values()) {
      if (work.from !== from || work.chunks.has(chunk)) {
        continue;
      }
      if (
        sameFavoredReads(
          work,
          favored.favoredConditions ?? [],
          favored.favoredChoices ?? [],
        )
      ) {
        return true;
      }
      const charged = resumeFrom?.charge?.steps;
      if (charged == null || work.spentSteps - charged > work.spentSteps / 2) {
        return true;
      }
    }
    return false;
  }

  /** The level-zero works the program still holds (`levelZeroHolds`),
   *  measured from the root and compile they were last held in and then held
   *  in this one's; the rest are dropped. */
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
   * The deepest checkpoint a replay of a route sharing the planned route's
   * first `validSteps` steps may resume from: one whose story stands within
   * them (`placeCheckpoint`). A replay forces the new route's decisions from
   * there, so unlike a search it needs no charge, and it is not held before
   * the route's forced verdicts.
   */
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
    const placed = this.placeCheckpoint(checkpointIndex, cursor, validSteps);
    if (!route || !placed) {
      return null;
    }
    const { state, at } = placed;
    // A search resumed here is charged what the search that planned the route
    // had spent when it recorded this step, so that every bound runs out
    // where it ran out there; a step recorded without it, or past level zero,
    // where no resumed search can stand as that search stood, is not resumed
    // from (`routeChargeAt`). A fallback route is resumed by origin/main's
    // search, which is charged nothing (`planRoute`).
    const charge = route.fallback ? undefined : routeChargeAt(route, at);
    if (!route.fallback && !charge) {
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
      ...(charge ? { charge } : {}),
    };
  }

  /**
   * Restore checkpoint `checkpointIndex` far enough to see where its story
   * stands: the step of the planned route it stands on, within the first
   * `validSteps`, and its image. Nothing when it stands past them, or
   * somewhere the new program would not place it (see `readResumePoint`).
   */
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
    // The checkpoint's image, restored in place, which a search node runs
    // from as it is.
    const image = this._checkpoints.imageOf(checkpointIndex) as
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
    if (standingOn == null) {
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
    return { state, at };
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
   * checkpoint: the store is truncated to the resume point, so an index
   * recorded against the old run would name a state captured by this one. The
   * copies keep their addresses: the caller replays only a route every step of
   * which `routeResumption` found valid in the new program (`replayOnly`). The
   * replay stamps a checkpoint on every step it reaches.
   */
  resumePlannedRoute(stepIndex: number, checkpointIndex: number): string | null {
    return this.checkpointJson(
      this.replayPlannedRoute(stepIndex, checkpointIndex),
    );
  }

  /** `resumePlannedRoute`, answering the newest checkpoint as a value
   *  (`newestCheckpoint`) rather than as its full save, which a game in the
   *  same session loads in place (`loadCheckpoint`) (#1758). */
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
    return this.checkpointJson(this.replayPatchedRoute(newRoute, limits));
  }

  /** `patchAndSimulateRoute`, answering the newest checkpoint as a value
   *  (`newestCheckpoint`) rather than as its full save, which a game in the
   *  same session loads in place (`loadCheckpoint`) (#1758). */
  replayPatchedRoute(
    newRoute: RoutePlan,
    limits?: { steps: number; checkpoint: number },
  ): StoredCheckpoint | null {
    if (
      !this._plannedRoute ||
      this._plannedRoute.from !== newRoute.from
    ) {
      // simulate from the beginning
      this._runtimeState = new RuntimeState();
      this.simulateRoute(newRoute);
      return this.newestCheckpoint();
    }

    // Search for a valid checkpoint we can start simulation from, among the
    // steps the caller says the new program still agrees with. A checkpoint
    // beyond that is a state the old program produced from statements this one
    // no longer has, however well its step's identity matches.
    const considered =
      limits == null
        ? newRoute.steps.length
        : Math.max(0, Math.min(limits.steps, newRoute.steps.length));
    // The deepest of those steps with a checkpoint to resume from, looked for
    // by index from the last: a route can hold hundreds of thousands of steps
    // past its last checkpoint (a loop with no beat in it). The resume below
    // is positional (`valid - 1` indexes the OLD route), so the match has to
    // agree on that index, not merely on identity.
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
      // Could not start from an earlier checkpoint, so simulate from the beginning
      this._runtimeState = new RuntimeState();
      this.simulateRoute(newRoute);
      return this.newestCheckpoint();
    }

    // Keep valid steps, trim away invalid steps, and add on the new route's
    // steps after them.
    const patchedSteps = this._plannedRoute.steps.slice(0, valid);
    for (let i = valid; i < newRoute.steps.length; i += 1) {
      patchedSteps.push(newRoute.steps[i]!);
    }
    const patchedRoute: RoutePlan = {
      from: newRoute.from,
      to: newRoute.to,
      steps: patchedSteps,
      decisions: newRoute.decisions,
      conditions: newRoute.conditions,
      choices: newRoute.choices,
      // A later search resumed on this route is charged level zero's bound
      // as the search that planned it had it (`routeChargeAt`).
      ...(newRoute.levelZero ? { levelZero: newRoute.levelZero } : {}),
      ...(newRoute.fallback ? { fallback: true as const } : {}),
    };

    // Add new checkpoints onto the previous simulation
    const fromStep = valid - 1;
    this.simulateRoute(patchedRoute, fromStep);
    return this.newestCheckpoint();
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
    this._checkpointShownBeats.length = this._checkpoints.length;
    if (this._checkpoints.length > 0) {
      const simulating = this._simulation === "simulating";
      this._checkpointStepCursors[this._checkpoints.length - 1] = simulating
        ? this._plannedRouteStepCursor
        : undefined;
      this._checkpointShownBeats[this._checkpoints.length - 1] = simulating
        ? this._shownBeat
        : undefined;
    }
  }

  save(): string {
    return this.buildSave(false);
  }

  /** The executed record's positions as a save holds them: each address in
   *  its durable form (`durableAddress`), since a chunk id names a statement
   *  only in the process that gave it (#700). An address the root no longer
   *  holds is left out. */
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
    let watchedCells: SaveData["watchedCells"];
    const state = this.programStory.state;
    try {
      if (withStory) {
        // A data breakpoint on a captured variable notes the id the save
        // gives the variable's cell, which a load of the save reads the
        // cell under (`loadProgramSave`).
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
        // The story's durable save of the current beat.
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

  /** The newest checkpoint as a value, or null when there is none or the
   *  story cannot write its image, as `checkpoints.at(-1)` is then null.
   *  Nothing is written: its full save is `checkpointJson`'s (#1758). */
  newestCheckpoint(): StoredCheckpoint | null {
    const checkpoint = this._checkpoints.checkpointAt(-1);
    return checkpoint && this.writesImage(checkpoint.image) ? checkpoint : null;
  }

  /** The full save of a checkpoint value, as `checkpoints.at` writes one,
   *  for a reader that needs the string: a game of its own (PLAY's), a save
   *  file, a test. Written by the story as it is now. */
  checkpointJson(checkpoint: StoredCheckpoint | null): string | null {
    return checkpoint ? this._checkpoints.jsonOf(checkpoint) : null;
  }

  /**
   * Loads a checkpoint value this game's route left (`newestCheckpoint`),
   * without writing its full save (`checkpointJson`) or reading it back
   * (#1758). The game then holds the route's state at that beat: the beat,
   * the story's position and output, `store` values, the runtime record and
   * the module state are what a load of the save holds, while a define's
   * properties other than `store` ones and the tables the story shares
   * follow the route, not the save's reconstruction of them on the
   * declarations' current run (the maintainer's decision on #1758). The
   * story loads the image in place (`ProgramStory.loadImage`); the module state
   * is read from the checkpoint's body; the runtime record is the
   * checkpoint's collections, with the executed positions a load of the
   * save keeps (each through its durable form, `durableExecuted` then
   * `placedExecuted`); and each data breakpoint's binding goes, as a load of
   * a save that notes no cell drops it. An image the story does not load in
   * place (`ProgramStory.loadImage`: one taken just after a choice, or one
   * whose positions this root does not hold as they are) loads through the
   * save. Refuses, with nothing of the game changed, what a load
   * of the save refuses; the two share their checks of the module states
   * and what they do once the story has loaded (`checkSaveModules`,
   * `finishLoad`).
   */
  loadCheckpoint(checkpoint: StoredCheckpoint): boolean {
    const program = this._story;
    const image = checkpoint.image as ProgramImage;
    try {
      // Read before anything changes, as `loadProgramSave` reads the save.
      if (!this.writesImage(image)) {
        // A load of the save, which is no save, would refuse it.
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
      // A save written of a checkpoint notes no cell, so a load of it
      // binds no data breakpoint (`loadProgramSave`).
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

  /** Throws what a load refuses a save's module states for: no record of
   *  them, or a module of the game's without a state, each an object, as
   *  `save` writes them. What a module's state holds is the module's to
   *  read. */
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

  /** What a load does once its story has loaded, which cannot fail: a
   *  waiting preview goes, and the modules and the runtime record load. */
  protected finishLoad(saveData: SaveData, runtime: RuntimeState): void {
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
    // The game waits on the beat the save was taken at, where the runtime
    // record the save carried last ran: a story loaded in place keeps the
    // last instruction its beat's continue ran, which can stand past the
    // beat, and a story loaded from JSON keeps none (#1200).
    this._awaiting = this.lastExecutedScriptLocation();
    if (saveData.simulatedFrom) {
      this._simulation = "success";
      this._simulateFlow = saveData.simulatedFrom;
    }
  }

  /**
   * Loads a save into the game, or refuses it with nothing of the game changed:
   * everything that can fail is read before anything changes. The save must
   * carry a story (one written while the story could not save, which
   * `buildSave` stores as an empty story, is refused), a state for every module
   * the game has, each an object, as `save` writes them, and a runtime record
   * of the shape `toJSON` writes (`RuntimeState.read`), and the story must
   * place it (`ProgramStory.checkSave`). What a module's state holds is the
   * module's to read. Then the story loads, which puts itself back, line in
   * progress included, when it fails past the placement, and ends the line in
   * progress when it succeeds; only then does a waiting preview go, and the
   * modules and the runtime record load, which cannot fail.
   */
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
      // The executed record's positions, written durably (`buildSave`),
      // placed in this program; one it cannot place is dropped, as a save's
      // count whose symbol cannot be placed is.
      runtime.pathsExecutedThisFrame = RecencySet.from(
        this.placedExecuted(program.root, runtime.pathsExecutedThisFrame.toArray()),
      );
      // A load reads the cells of captured variables anew, under the ids
      // the save gave them, so a data breakpoint that still holds the cell
      // the save noted for its data id (`buildSave`), which the note's tag
      // names, binds to the cell the load read under that id, and that cell
      // takes the tag. A watch of the same data id holding another cell, of
      // another closure, say, is not the watch the save noted. Any other
      // watch's pointer reaches no variable of the loaded story, and the
      // watch holds no binding until a frame named by its scope runs.
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

  /**
   * Restores checkpoint `index` in place: the story's image of the beat, and
   * the module state and runtime collections saved beside it. Within a
   * session an image taken before a compile restores after it for every
   * statement the compile kept, and one that names a statement it emitted
   * again is translated through its saved form (#1429); one that still cannot
   * be placed is unplaced, and nothing changes, so that the caller replays
   * (docs/engine/binary-program.md, sections 7 and 8). A route's resumption
   * does not translate (`readResumePoint`).
   */
  restoreCheckpoint(index: number): boolean {
    const entry = this._checkpoints.checkpointAt(index);
    const story = this.programStory;
    if (!entry || index < 0) {
      return false;
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
    const saveData = JSON.parse(entry.body) as SaveData;
    for (const k of this._moduleNames) {
      this._modules[k]?.load(saveData.modules[k]);
    }
    // The collections as the session holds them, which no record is
    // written of or read back from (#1758).
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
    // The story is about to stand somewhere else, so it no longer waits on
    // the beat it waited on.
    this._awaiting = null;
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
    this._awaiting = null;

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
    this._awaiting = null;
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
    this._steppingInThroughEntry = false;
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
                // The nearest checkpoint at or before this step. Steps reached
                // before the first capture have none, and must stay undefined:
                // recording -1 made `getCheckpoint` ask the store for index -1
                // (null) instead of reporting "no checkpoint here", so a real
                // absence was indistinguishable from a lookup failure.
                const latestCheckpoint = this._checkpoints.length - 1;
                if (latestCheckpoint >= 0) {
                  step.checkpoint = latestCheckpoint;
                }
                this._plannedRouteStepCursor++;
                if (
                  this._plannedRouteStepCursor ===
                  this._plannedRoute.steps.length - 1
                ) {
                  // What runs from here to the target is the target's own.
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
          // End simulation
          this.endTargetWatch();
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
          } else {
            this._shownBeat = instructions;
          }
          if (
            !this._coordinator.shouldContinue() &&
            this._simulation !== "simulating" &&
            // A load beat is loading and a cutscene beat playing, not waiting
            // for the player.
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
        // The step appends the address of each instruction it runs, a Luau
        // callback's among them, to the log, which the game reads once the step
        // returns: a breakpoint stops the game when its set holds one of them.
        // It appends them to the beat log too, in the continue whose beat shows
        // what they ran, which the game records as the addresses that beat ran
        // (#1686). No call and no string per step.
        const program = this.programStory;
        const log = this._executedLog;
        log.length = 0;
        program.executedLog = log;
        const beatLog = this._beatLog;
        beatLog.length = 0;
        program.beatLog = beatLog;
        // While a data breakpoint is set, the engine reports each write to
        // a bound variable during the step, so the watch hears which
        // binding a write reached. With none it calls nothing.
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
          // A breakpoint is a set of addresses, and a step stops the game when
          // the set holds the address of an instruction it ran. Each
          // instruction of a line has an address of its own, so a breakpoint
          // stops once each time its instruction runs; one inside a Luau
          // callback stops the game once the step that called it returns.
          if (hit) {
            this.notifyHitBreakpoint();
            // DONE - hit breakpoint
            return true;
          }
          // With no traversal asked for, nothing below can stop the game.
          if (traversal === "continue") {
            return false;
          }
          // A step in does not stop inside a function's entry code: it binds
          // the parameters one instruction at a time, so the stop waits for
          // the `EnterBlock` after it, where a function breakpoint stops too,
          // though that runs on the same line (#1743).
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

  /** Resets the story and moves it to an address; `TOP_LEVEL_START` is the
   *  top of the top-level content. */
  jumpTo(address: ProgramAddress) {
    this.discardOpenStoryLine();
    this._story.ResetState();
    this._positions.jumpTo(address);
  }

  /** Resets the story and moves it to the top of a flow named by its
   *  qualified name (a route's start). */
  jumpToFlow(flow: string) {
    this.discardOpenStoryLine();
    this._story.ResetState();
    this._positions.jumpToFlow(flow);
  }

  protected notifyHitBreakpoint() {
    this._announcedStop = true;
    this.connection.emit(
      GameHitBreakpointMessage.type.notification({
        location: this.getDocumentLocation(this._executingLocation),
      }),
    );
  }

  /** Announces a wait for the player at the beat just flushed, at the last
   *  line the beat ran (the record `game/executed` reports, #1686). */
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
      // The record holds addresses while the game runs; a string is a saved
      // position's durable form, which a load places or drops
      // (`placedExecuted`), and names no position here.
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
      // Gated on the state rather than sent whenever it happens to be set, so
      // a reason recorded by an earlier failed simulation can never ride along
      // with a run that succeeded.
      simulationFailure:
        this._simulation === "fail" ? this._simulationFailure : undefined,
      route: this._previewRoute,
    };
  }

  /**
   * The route `route` as the preview reports it: where it starts, the line it
   * ends at, and each decision it made (`routeDecisions`), placed in the
   * scripts. `source` reads the scripts, counting lines from 0: a line's
   * text, which names a forced verdict, and the loops, which tell a clipped
   * loop from a forced verdict. Without it the text is empty and every
   * verdict the route forced is reported forced.
   */
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
    const loops = new Map<number, readonly ScriptLoop[]>();
    const loopsOf =
      source &&
      ((script: number) => {
        let found = loops.get(script);
        if (!found) {
          found = source.loops(this.scriptUri(script));
          loops.set(script, found);
        }
        return found;
      });
    const decisions: PreviewRouteDecision[] = [];
    for (const decision of routeDecisions(route, lineOf, loopsOf)) {
      // A clipped loop is listed at its own first line.
      const location = decision.loop
        ? this.lineLocation(
            this.scriptUri(decision.loop.script),
            decision.loop.line,
          )
        : this.documentLocationOf(decision.site);
      if (!location) {
        continue;
      }
      decisions.push({
        kind: decision.kind,
        location,
        text:
          decision.kind === "auto"
            ? (decision.option ?? "")
            : conditionText(
                source?.lineText(location.uri, location.range.start.line) ??
                  "",
              ),
        ...(decision.meeting !== undefined
          ? { meeting: decision.meeting }
          : {}),
        ...(decision.verdict !== undefined
          ? { verdict: decision.verdict }
          : {}),
        ...(decision.passes !== undefined ? { passes: decision.passes } : {}),
      });
    }
    return { start, target, decisions };
  }

  /** The start of line `line` of the script `uri`. */
  protected lineLocation(uri: string, line: number): DocumentLocation {
    return {
      uri,
      range: {
        start: { line, character: 0 },
        end: { line, character: 0 },
      },
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

  /** The story's globals and the temporaries of a frame by name, for the
   *  editor to evaluate an expression against: each value it can receive
   *  and read into (`isEvaluable`). A table holds the runtime's own objects
   *  and functions, which no message can carry. The frame is `frameId` of
   *  thread `threadId`, numbered as `getTempVariables` and `getStackTrace`
   *  number them (#1740); with neither, or naming a thread or frame the
   *  call stack no longer has, it is the frame that runs. */
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
      // A global as the frame reads it: `GetVariableWithName` reads the
      // running frame's temporaries first, so a named frame reads its own,
      // and the global itself where it has none of that name.
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
        // A temporary bound to a pointer (a variable passed by reference,
        // or one a closure captured) reads the value it points to, as the
        // Temps scope shows it, not the pointer's variable name.
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

  /** The value `name` reads in `element`, a frame of `thread`: its
   *  temporary of that name in the innermost block scope that has one, or
   *  else the global. */
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

  /** Whether `value` is the record `getTableRecord` made of a table, which
   *  the evaluation context leaves out as it left out the table's `Map`. */
  isTableRecord(value: unknown): boolean {
    return (
      typeof value === "object" && value != null && this._tableRecords.has(value)
    );
  }

  getVarVariables(): Variable[] {
    const variables: Variable[] = [];
    const variableState = this._story.state.variablesState;
    for (const name of variableState["_globalVariables"].keys()) {
      // A name with a `$` after its first character is the compiler's own
      // (the cell a method of a define written in a function reads a local
      // of that function through, `__cell$…`), which no author wrote; a
      // scoped define's key starts with its `$` and is shown.
      if (name.indexOf("$") > 0) {
        continue;
      }
      // The global itself: a temporary of the same name shadows it for the
      // story, and the Temps scope shows that temporary (#1727).
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
    // A temporary's scope is the identity of the frame it is a temporary of
    // (`DebugFrame.scope`), which keeps two anonymous functions apart.
    const programScope = this._story.debugFrames(thread?.threadIndex ?? 0)?.[
      frameIndex
    ]?.scope;
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
          // or one a closure captured) shows the value it points to, in the
          // frames of the thread it belongs to (#1667).
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

  /**
   * The value `pointer` leads to, read in the frames of `thread`. A closed
   * pointer holds its value. An open one names a frame by its
   * `contextIndex` (1 for the outermost, 0 for the globals, -1 for the
   * frame on top) and the block scope that binds the name by its
   * `scopeIndex`, as `VariablesState.ValueAtVariablePointer` reads them;
   * that reads the frames of the thread that runs, which another thread's
   * frame at the same index is not (#1667). A pointer that leads to
   * another is followed.
   */
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
        // No temporary of the name in that frame: a pointer at the globals,
        // or at the frame on top, reads the global; one at any other frame
        // reads nothing, as `VariablesState.GetRawVariableWithName` does.
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
      // A table lists its keys in the order `getTableRecord` gave them; a
      // record's own enumeration would put every integer key first.
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

  /** One level of a Luau table as the Variables view reads it: a record of
   *  its entries, with `_tableRecords` keeping its keys in order, the array
   *  part first, then its other keys as the table holds them. A nested table
   *  stays the runtime's table until the view shows it (`getVariableInfo`
   *  converts it then), so a deep or cyclic table costs one level per
   *  expansion. */
  getTableRecord(table: ObjectValue): Record<string, unknown> {
    // No prototype, so a key such as `__proto__` is an own entry like any
    // other rather than a call of an inherited setter.
    const record: Record<string, unknown> = Object.create(null);
    const entries = table.value ?? new Map<string, unknown>();
    // The array part is the keys 1, 2, 3, ... up to the first hole, as
    // `ipairs` reads it (`arrayPortion` in the runtime's MethodDispatch);
    // every other key follows in the order the table holds them.
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
    // A table nested in a table shown before is converted as it is shown.
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
      // A thread is named by the frame it runs.
      const name = this._story.debugFrames(threadId)?.at(-1)?.name;
      threads.push({
        id: threadId,
        name: name || "<unknown thread>",
      });
    }
    return threads;
  }

  /** The story's stack trace: each frame named from its symbol, at the line
   *  of the address it stands at (`ProgramStory.debugFrames`). */
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
    // The protocol counts startFrame and levels from the top (running)
    // frame, the last of frames, and reads a levels of 0 or none as the rest
    // of the stack. Each frame keeps its index from the outermost end as its
    // id, which scopes, variables and evaluate look frames up by.
    const top = frames.length - 1 - Math.max(0, startFrame);
    const bottom = levels ? Math.max(0, top - levels + 1) : 0;
    // A frame that stands at no address is the one running after a load,
    // which keeps no last instruction: it stands where the game last ran,
    // or where the runtime record the save carried last ran.
    const ran =
      this._executingLocation && this._executingLocation[0] >= 0
        ? this._executingLocation
        : this.lastExecutedScriptLocation();
    // The frame that runs stands on the beat the game waits on, which is
    // not where its last instruction stands when the beat's continue went
    // on to cut the next line (#1756).
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
      previewAddress != null ? previewAddress : true;
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
  async preview(
    file: string,
    line: number,
    /** Where a preview with no route runs from, when not the point's own
     *  address: the line above it that shows a beat (#1606). */
    runFrom?: ProgramAddress,
    /** The point's address, when it is not the one its line resolves to
     *  (`setStartFrom`). */
    address?: ProgramAddress,
  ): Promise<ProgramAddress | null> {
    if (this._state === "running") {
      // Don't preview while running
      return null;
    }
    const previewAddress =
      address ?? this.locator.addressAt(file, line, { beat: "last" });
    if (previewAddress == null) {
      // A preview call takes over a waiting preview whether or not its
      // point resolves; with no beat to gate, nothing waits, so an
      // abandoned pin goes now.
      this.cancelPreview();
      this.module.assets.releaseAbandonedGates();
      // A pure UI-only project (e.g. a `layout` with only reactive `{bindings}`)
      // has no narrative path to preview: every path-located flow is a synthetic
      // `__binding$*` evaluator, and those are excluded from preview candidates.
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
    this._previewFrom = address === undefined ? { file, line } : { file, line, address };
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
      this.runPreview(runFrom ?? previewAddress);
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
      // A composed display is on the page once it has been sent, and the
      // pictures its gate pins stay resident until then (#1820).
      this.module.ui.afterCompose(() => gate.release());
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

  /** Where the last address the runtime record holds a location for
   *  stands. */
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

  /** Where an address stands, as a script index and a range; nothing for an
   *  address the program does not hold. */
  scriptLocationOf(
    address: ProgramAddress | null | undefined,
  ): ScriptLocation | undefined {
    return Game.scriptLocationIn(
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

  /** Where a flow named by its qualified name (a route's start) is declared,
   *  as an editor takes a location; nothing for a flow the program does not
   *  declare. */
  flowDocumentLocationOf(flow: string): DocumentLocation | null {
    const program = this._program;
    const location =
      program.knotLocations?.[flow] ||
      program.functionLocations?.[flow] ||
      program.sceneLocations?.[flow] ||
      program.branchLocations?.[flow];
    return location ? this.getDocumentLocation(location) : null;
  }

  /** Where the story that runs `program` stands: the position its last step
   *  ran, which the player's worker names when the story runs away. */
  static storyLocation(
    story: ProgramStory,
    program: SparkProgram,
  ): DocumentLocation | null {
    const positions = storyPositions(story, program);
    const scripts = Object.keys(program?.scripts ?? {});
    // The position its last step ran, or, after an image was restored and
    // before a step has run, where it stands.
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
