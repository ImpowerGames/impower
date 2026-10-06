import { Container } from "../inkjs/engine/Container";
import { debugFileName } from "../compiler/utils/debugFileName";
import { ControlCommand } from "../inkjs/engine/ControlCommand";
import { DebugMetadata } from "../inkjs/engine/DebugMetadata";
import { ErrorType, type RaisedError } from "../inkjs/engine/Error";
import {
  EXECUTION_WATCH_STEPS,
  executionWatch,
} from "../inkjs/engine/ExecutionWatch";
import { InkList } from "../inkjs/engine/InkList";
import { NativeFunctionCall } from "../inkjs/engine/NativeFunctionCall";
import { InkObject } from "../inkjs/engine/Object";
import { cleanOutputWhitespace } from "../inkjs/engine/outputWhitespace";
import { PushPopType } from "../inkjs/engine/PushPop";
import type { Simulator } from "../inkjs/engine/Simulator";
import { lookupStateAwareStdLib } from "../inkjs/engine/StdLib";
import {
  Story,
  arrangeArgsFor,
  callNativeFunction,
  callValueAsFunction,
  callVariableTarget,
  captureString,
  captureTag,
  extractClosureTarget,
  indexValue,
  isFunctionReference,
  lookupMetamethod,
  normalizeLuauCallArgs,
  oneValue,
  openVariablePointer,
  packTuple,
  popLuauCondition,
  pushStdLibResult,
  readVariable,
  sequenceShuffleIndex,
  shortCircuitDecides,
  spreadCallArgs,
  storeIndex,
  tableFromPairs,
  tryInvokeStdLibMarkerValue,
  unpackTuple,
  type FunctionTarget,
} from "../inkjs/engine/Story";
import {
  StepLimitExceeded,
  StoryException,
} from "../inkjs/engine/StoryException";
import { StringBuilder } from "../inkjs/engine/StringBuilder";
import { Tag } from "../inkjs/engine/Tag";
import { asOrThrows } from "../inkjs/engine/TypeAssertion";
import {
  AbstractValue,
  BoolValue,
  DivertTargetValue,
  FloatValue,
  IntValue,
  NullValue,
  ObjectValue,
  StringValue,
  SymbolRef,
  SymbolValue,
  Value,
  ValueType,
  VariablePointerValue,
} from "../inkjs/engine/Value";
import { VariableAssignment } from "../inkjs/engine/VariableAssignment";
import type { VariablesState } from "../inkjs/engine/VariablesState";
import { Void } from "../inkjs/engine/Void";
import { BinaryProgramReader } from "./BinaryProgramReader";
import { readSave, writeSave, type SaveHeader } from "./ProgramSave";
import {
  ImageTracker,
  ProgramImages,
  captureImage,
  restoreImage,
  type ProgramImage,
} from "./ProgramImages";
import {
  CALL_ARGS_UNKNOWN,
  CALL_DISCARD,
  CALL_TUNNEL,
  CHOICE_CONDITION,
  CHOICE_DECISION,
  CHOICE_INVISIBLE_DEFAULT,
  CHOICE_ONCE,
  CHOICE_ONLY,
  CHOICE_START,
  DONE_HOLD,
  COUNT_TURNS,
  ConstValue,
  JUMP_DECISION,
  JUMP_LUAU,
  KEEP_OR,
  LEAVE_CONTINUE,
  NUM_FLOAT,
  Op,
  SET_DECLARE,
  SET_GLOBAL,
  SET_VARARGS,
  auxOf,
  flagsOf,
  opOf,
} from "./ProgramInstructions";
import type { ProgramRoot, SequenceRow } from "./ProgramRoot";
import {
  ROOT_FLOW_NAME,
  SymbolKind,
  UNDEFINED_KIND,
  countIdOf,
  isAnonymousSymbol,
} from "./ProgramSymbols";
import {
  ProgramChoice,
  ProgramStoryState,
  blockStackOf,
  type BlockEntry,
  type ProgramPosition,
  type SuspendedLineEnd,
} from "./ProgramStoryState";
import {
  ADDRESS_OFFSETS,
  ANCHOR_STATEMENT,
  BLOCK_LOOP,
  BLOCK_PASS_SCOPE,
  B_BREAK,
  B_RESUME,
  HEADER_WORDS,
  blockField,
  blockFlags,
  blockScopes,
  chunkId,
  codeWords,
  exportCount,
  exportSymbol,
  lineRowAt,
  lineRowField,
  type StatementChunk,
} from "./StatementChunk";

/** What a caller needs to place a runtime path the current engine's path
 *  locations name (`SparkProgram.pathLocations` and `scripts`). */
export interface ProgramPathLocations {
  /** Where the content a path names starts: its script, and the line and
   *  column, counting from 0. A line can hold several beats and statements,
   *  and the column tells them apart. */
  locate(path: string): { uri: string; line: number; column: number } | undefined;
}

type ErrorHandler = (
  message: string,
  type: ErrorType,
  source?: unknown,
  raised?: RaisedError | null,
) => void;

/** The function a symbol names, as the call handlers the two engines share
 *  read it (`FunctionTarget`): where its entry code starts, and what its
 *  entry binds, which the leading `SetVar`s of that code say. */
class SymbolTarget implements FunctionTarget {
  constructor(
    readonly symbol: number,
    readonly entry: ProgramPosition,
    readonly variadic: boolean,
    readonly bindings: number,
  ) {}
}

/** An instruction that ran: its chunk's sequence and entry, and its
 *  offset. */
interface RunningInstruction {
  sequence: SequenceRow;
  entry: number;
  offset: number;
}

// What a callback suspends of the step that calls it, and gets back when it
// returns (`ProgramStory.CallLuauFunction`).
interface SuspendedStep {
  depth: number;
  evalHeight: number;
  position: ProgramPosition | null;
  blocks: BlockEntry[];
  output: InkObject[];
  lineEnd: SuspendedLineEnd;
  pause: boolean;
  running: RunningInstruction | null;
}

/**
 * `ProgramStory` runs a program's statement chunks with an integer cursor
 * (docs/engine/binary-program.md, sections 3, 5, 6, 9 and 10): an eval stack,
 * the value operations of the current engine (`Story`'s shared handlers),
 * native functions and operators through `NativeFunctionCall`, variables
 * through `VariablesState`, block statements whose bodies it enters and
 * leaves through a block stack, calls of functions in frames that return to
 * the instruction after the call, jumps to symbols that rebuild the block
 * stack where they land and count the flows they enter, tunnels in frames
 * that return onward, threads that fork the call stack, the visits and turns
 * of every counted symbol in typed arrays, decisions the route simulator can
 * force, and a continue that returns at its line's newline.
 *
 * It presents the members of the current engine's `Story` that a `Game` uses
 * to create a game from a compile, continue, read a beat's display
 * instructions, run a preview compile's program and evaluate a function
 * (`HasFunction`, `EvaluateFunction`), and the members the builtins read
 * (`CallLuauFunction`, `CallLuauFunctionProtected`, `CallStackTrace`, ...),
 * under the same names, and the choices a `choose` block raises
 * (`currentChoices`, `ChooseChoiceIndex`). What it does not present yet
 * belongs to later slices of #692: images and saves across compiles (#699),
 * addresses (#700) and the debugger (#702).
 *
 * Each engine keeps its own copy of the current engine's story of the same
 * compile (`ProgramRoot.runtimeStory`, `Story.CopyWithOwnState`), which runs
 * nothing: its `VariablesState` holds this engine's globals, and its call
 * stack this engine's frames, whose scopes hold the temporaries and whose
 * open upvalues close as the current engine's do. `ResetState` runs the
 * program's declaration sequences against those globals. Engines built from
 * one root share its chunks and nothing they write.
 */
export class ProgramStory {
  collapseWhitespace = true;
  processEscapes = true;

  onError: ErrorHandler | null = null;
  onDidContinue: (() => void) | null = null;
  onMakeChoice: ((choice: unknown) => void) | null = null;
  onEvaluateCondition: ((value: boolean) => void) | null = null;
  /** Called with the address of the content that ran, once addresses reach
   *  the game (#700). */
  onExecute: ((path: string | undefined) => void) | null = null;
  onChoosePathString: ((path: string, args: unknown[]) => void) | null = null;

  /** Formats the message the `error` builtin raises, as the current engine's
   *  `Story.errorMessageFormatter` does; it reads `currentDebugMetadata`. */
  errorMessageFormatter?: (story: any, message: string) => string;

  /** Forces the verdict of a decision (a `JumpIfFalse` with the decision
   *  flag), keyed by the decision's address (`addressOf`). */
  simulator: Simulator | null = null;
  /** When set, a continue stops before it evaluates a decision, and
   *  `pausedBeforeCondition` names the decision's address. */
  pauseBeforeEvaluatingConditions = false;
  pausedBeforeCondition: string | null = null;

  /** Every instruction this story has run. */
  stepCount = 0;
  /** The `stepCount` past which a step throws `StepLimitExceeded`. */
  stepLimit: number | null = null;
  /** How many declaration chunks this story has run. */
  declarationsRun = 0;

  protected _state!: ProgramStoryState;
  protected _reader: BinaryProgramReader;
  // The value a `Str` pushes, made once per string of the program table:
  // values are never written after they are made, so pushing one again
  // allocates nothing. The same holds for the function value a `Sym` pushes.
  protected _strings: StringValue[] = [];
  protected _symbols = new Map<number, SymbolValue>();
  // The function each symbol names, found once.
  protected _targets = new Map<number, SymbolTarget | null>();
  // The native function of each `Native` operand, and the assignment of each
  // `SetVar` operand, made once.
  protected _natives = new Map<number, NativeFunctionCall>();
  protected _assignments = new Map<number, VariableAssignment>();
  protected _asyncContinueActive = false;
  protected _recursiveContinueCount = 0;
  protected _stateIsPristine = false;
  protected _runtimeStory: Story;

  /** The pristine copies the images of this engine read, shared with the
   *  engines of the programs before and after it in one game, so that an
   *  image one took restores into the next (`restore`). */
  readonly images: ProgramImages;
  /** What the write barrier marked since this engine's last capture or
   *  restore. */
  protected _tracker: ImageTracker;
  /** Whether the engine keeps images: the write barrier hears every write
   *  from the first capture or restore on. */
  protected _imagesOn = false;
  /** Whether each continue that starts a line keeps the image of the beat
   *  before it (`captureBeat`), which a game that checkpoints its beats or
   *  saves at a menu sets. */
  keepBeatImages = false;

  constructor(
    readonly root: ProgramRoot,
    protected _paths: ProgramPathLocations | null = null,
    options: { images?: ProgramImages } = {},
  ) {
    this._reader = new BinaryProgramReader(root);
    this._runtimeStory =
      root.runtimeStory?.CopyWithOwnState() ??
      new Story(new Container(), null, null);
    this.images = options.images ?? new ProgramImages();
    this._tracker = new ImageTracker(this.images);
    this.ResetState();
  }

  // ------------------------------------------------------------------ images

  /** Turns on the write barrier of the engine's images
   *  (docs/engine/binary-program.md, section 7). The first capture after it
   *  is a keyframe. */
  enableImages(): void {
    if (!this._imagesOn) {
      this._imagesOn = true;
      this.attachImages();
    }
  }

  // The barrier on the state's counts, globals, tables and cells, from a
  // keyframe on.
  protected attachImages(): void {
    const state = this._state;
    state.images = this._tracker;
    state.variablesState.imageBarrier = this._tracker;
    state.callStack.cellBarrier = this._tracker.cell;
    this._tracker.reset(null);
  }

  /** An image of the state as it stands: a delta on the image last taken
   *  or restored, or a keyframe when `keyframe` is set or there is none
   *  since a reset or a load. A route search takes one at each fork. */
  capture(keyframe = false): ProgramImage {
    this.enableImages();
    const image = captureImage(this._state, this._tracker, this, keyframe);
    this.notMovedSince(image);
    return image;
  }

  // The image the state last was, and whether it has moved since: a step,
  // a choice taken, a path chosen, a call stack reset, or a write the
  // barrier marked.
  protected _stillImage: ProgramImage | null = null;
  protected _stillAtStep = -1;

  protected notMovedSince(image: ProgramImage | null): void {
    this._stillImage = image;
    this._stillAtStep = this.stepCount;
  }

  // The image the state is, when nothing moved it since it was taken or
  // restored, which a continue that starts a line keeps rather than taking
  // another.
  protected stillImage(): ProgramImage | null {
    const tracker = this._tracker;
    const image = this._stillImage;
    return image &&
      tracker.base === image &&
      this._stillAtStep === this.stepCount &&
      tracker.tables.size === 0 &&
      tracker.cells.size === 0 &&
      tracker.globals.size === 0 &&
      tracker.counts.size === 0
      ? image
      : null;
  }

  /** The image of the current beat (section 7): the state as it stands
   *  after a continue that ended at its line's newline, after a choice was
   *  taken, or at the start of a flow; and after a continue that ended with
   *  choices raised and no newline, the image of the beat before it, which
   *  holds none of those choices, so that restoring it and continuing raises
   *  them again, their conditions' effects with them. */
  captureBeat(keyframe = false): ProgramImage {
    const held = this._state.beatImage;
    if (held && !keyframe) {
      return held;
    }
    return this.capture(keyframe);
  }

  /** Restores an image in place, which this engine or the engine of an
   *  earlier program of the same game (`images`) took; or returns false and
   *  changes nothing when a position it holds names a chunk or a sequence
   *  this engine's root no longer holds, so that the caller replays
   *  (section 8). */
  restore(image: ProgramImage): boolean {
    // As a load of a state's JSON, a restore runs between the steps of an
    // asynchronous continue, which a route search drives.
    this.enableImages();
    if (!restoreImage(this._state, this._tracker, this, image)) {
      return false;
    }
    this.notMovedSince(image);
    this._stateIsPristine = false;
    this._state.beatImage = null;
    return true;
  }

  /** The header of the last save `loadSave` read, or nothing. */
  loadedSaveHeader: SaveHeader | null = null;

  /**
   * The durable save of the current beat (docs/engine/binary-program.md,
   * sections 7 and 8): the image `captureBeat` gives, every position in the
   * saved form, with a header naming the format's version, the engine's
   * and `gameVersion`, the game's own (`GameConfiguration.version`). At a
   * menu it is the beat before the menu and holds none of the menu's
   * choices, which needs `keepBeatImages` set while the story ran.
   */
  toSave(gameVersion = ""): string {
    this.IfAsyncWeCant("save");
    const held = this._state.beatImage;
    if (!held) {
      if (!this.canContinue && this._state.currentChoices.length > 0) {
        throw new Error(
          "A save at a menu holds the beat before it, which the story keeps only while keepBeatImages is set.",
        );
      }
      return writeSave(this._state, gameVersion);
    }
    return this.saveOfImage(held, gameVersion)!;
  }

  /** The durable save of an image this engine, or the engine of an earlier
   *  program of the same game, took (`toSave`): the image is put in place to
   *  be written, and the state as it stands put back. Nothing, and nothing
   *  changed, when the image names a position this engine's root does not
   *  hold. */
  saveOfImage(image: ProgramImage, gameVersion = ""): string | null {
    this.IfAsyncWeCant("save");
    const held = this._state.beatImage;
    const live = this.capture();
    if (!this.restore(image)) {
      return null;
    }
    try {
      return writeSave(this._state, gameVersion);
    } finally {
      this.restore(live);
      this._state.beatImage = held;
    }
  }

  /**
   * Loads a durable save `toSave` wrote, into this engine's program, and
   * returns its header. The program must have every statement the save's
   * positions name, unchanged: a save that cannot be placed so is refused
   * (`SaveRefused`), naming the flow, and the state is left as it was. A
   * save of a newer format version is refused, and one of an older version
   * goes through its migration.
   */
  loadSave(json: string): SaveHeader {
    this.IfAsyncWeCant("load a save");
    const header = readSave(this._state, json, (symbol) =>
      this.symbolValue(symbol),
    );
    this._stateIsPristine = false;
    this.loadedSaveHeader = header;
    return header;
  }

  // ------------------------------------------------------------- the surface

  get state(): ProgramStoryState {
    return this._state;
  }

  get variablesState(): VariablesState {
    return this._state.variablesState;
  }

  get listDefinitions() {
    return this._runtimeStory.listDefinitions;
  }

  get structDefinitions() {
    return this._runtimeStory.structDefinitions;
  }

  get canContinue(): boolean {
    return this._state.canContinue;
  }

  get asyncContinueComplete(): boolean {
    return !this._asyncContinueActive;
  }

  get currentText(): string | null {
    this.IfAsyncWeCant("call currentText since it's a work in progress");
    return this._state.currentText;
  }

  get currentTags(): string[] {
    this.IfAsyncWeCant("call currentTags since it's a work in progress");
    return this._state.currentTags;
  }

  get currentDisplayInstructions(): ObjectValue[] {
    this.IfAsyncWeCant(
      "call currentDisplayInstructions since it's a work in progress",
    );
    return this._state.currentDisplayInstructions;
  }

  /** The choices waiting to be taken, without the invisible defaults, each
   *  with its index among them (`Story.currentChoices`). */
  get currentChoices(): ProgramChoice[] {
    const choices: ProgramChoice[] = [];
    for (const choice of this._state.currentChoices) {
      if (!choice.isInvisibleDefault) {
        choice.index = choices.length;
        choices.push(choice);
      }
    }
    return choices;
  }

  get continueShowedSomething(): boolean {
    return (
      Boolean(this.currentText) || this.currentDisplayInstructions.length > 0
    );
  }

  get currentErrors() {
    return this._state.currentErrors;
  }

  get currentWarnings() {
    return this._state.currentWarnings;
  }

  get hasError(): boolean {
    return this._state.hasError;
  }

  get hasWarning(): boolean {
    return this._state.hasWarning;
  }

  get stateIsPristine(): boolean {
    return this._stateIsPristine;
  }

  /** A fresh state: the story copy's, with no global initialized, then the
   *  program's declaration chunks run in the order the current engine's
   *  `global decl` container initializes the globals in. */
  ResetState(): void {
    this.IfAsyncWeCant("ResetState");
    const reactiveDepsEnabled =
      this._state?.variablesState?.reactiveDepsEnabled ?? false;
    this._runtimeStory.ResetState(false);
    const variablesState = this._runtimeStory.state.variablesState;
    variablesState.reactiveDepsEnabled = reactiveDepsEnabled;
    this._state = new ProgramStoryState(
      this.root,
      variablesState,
      (text) => this.CleanOutputWhitespace(text),
      () => {
        this._stateIsPristine = false;
      },
      this._runtimeStory.state.callStack,
    );
    this.runDeclarations();
    variablesState.SnapshotDefaultGlobals();
    const start = this.root.flowNamed(ROOT_FLOW_NAME);
    this._state.position = start ? { sequence: start, entry: 0, offset: 0 } : null;
    if (this._imagesOn) {
      this.attachImages();
    }
    this._stateIsPristine = true;
  }

  ResetErrors(): void {
    this._state.ResetErrors();
  }

  ResetCallstack(): void {
    this.IfAsyncWeCant("ResetCallstack");
    this._stateIsPristine = false;
    this._stillImage = null;
    this._state.ForceEnd();
  }

  Continue(): string | null {
    this.ContinueInternal();
    return this.currentText;
  }

  ContinueAsync(): void {
    this.ContinueInternal(true);
  }

  ContinueMaximally(): string {
    this.IfAsyncWeCant("ContinueMaximally");
    const sb = new StringBuilder();
    while (this.canContinue) {
      sb.Append(this.Continue());
    }
    return sb.toString();
  }

  CancelAsyncContinue(): void {
    if (this._recursiveContinueCount > 0) {
      throw new Error(
        "Can't CancelAsyncContinue from inside a Continue. Only a caller that " +
          "is about to replace the story state may cancel, and it must do so " +
          "between continues.",
      );
    }
    if (!this._asyncContinueActive) {
      return;
    }
    this._state.didSafeExit = false;
    this._state.variablesState.CompleteVariableObservation();
    this._asyncContinueActive = false;
  }

  /** Moves to the start of a flow, named by its qualified name (the top-level
   *  content's flow is `""` or `"0"`), or to the statement a runtime path of
   *  the current engine's path locations falls in, inside the blocks that
   *  hold it. */
  ChoosePathString(path: string, resetCallstack = true, args: unknown[] = []): void {
    this.IfAsyncWeCant("call ChoosePathString right now");
    if (this.onChoosePathString !== null) this.onChoosePathString(path, args);
    if (args.length > 0) {
      throw new StoryException(
        "A flow of the binary program takes no arguments yet.",
      );
    }
    const target = this.placePath(path);
    if (!target) {
      throw new StoryException(`Path not found: '${path}'`);
    }
    // The flows the choice enters are counted from the flow the last
    // instruction ran in, which a save keeps, or from none when the call
    // stack is reset, as the current engine's `ChoosePath` counts them from
    // its thread's previous pointer after the turn it starts.
    const left = resetCallstack ? -1 : this._state.previousFlow;
    if (resetCallstack) {
      this.ResetCallstack();
    }
    // Changing direction drops the choices waiting (`SetChosenPath`).
    this._state.generatedChoices.length = 0;
    this._state.beatImage = null;
    this._stillImage = null;
    this._state.DiscardLineEnd();
    this._stateIsPristine = false;
    this._state.currentTurnIndex += 1;
    this.land(target.position, this._state.blockStack);
    this.countEntered(target.position.sequence, left);
    this.countLabelsAbove(target.position);
    if (target.symbol !== undefined) {
      this.enterStart(target.symbol, target.position.sequence);
    }
    this._state.didSafeExit = false;
  }

  ChooseChoiceIndex(choiceIdx: number): void {
    const choices = this.currentChoices;
    if (choiceIdx < 0 || choiceIdx >= choices.length) {
      throw new Error("choice out of range");
    }
    this.ChooseChoice(choices[choiceIdx]!);
  }

  /** Takes a choice (`Story.ChooseChoice`): the story runs on from the
   *  choice's entry in the thread it was raised in, a new turn, and the flows
   *  the entry is in that the flow last run in is not are counted
   *  (docs/engine/binary-program.md, section 5). */
  ChooseChoice(choice: ProgramChoice): void {
    if (this.onMakeChoice !== null) this.onMakeChoice(choice);
    const left = this._state.previousFlow;
    // What a choice leads to starts a new box, so no line before the choice
    // is one a `..` after it joins.
    this._state.lineJoinable = false;
    // The state after the choice is a beat of its own, which holds the
    // choice taken.
    this._state.beatImage = null;
    this.takeChoice(choice, left, true);
  }

  /** Runs on from `choice`'s entry, counting the flows it enters from the
   *  flow `left`, in a new turn when `newTurn` is set. */
  protected takeChoice(choice: ProgramChoice, left: number, newTurn: boolean): void {
    const state = this._state;
    this._stateIsPristine = false;
    this._stillImage = null;
    state.TakeChoice(choice);
    if (newTurn) {
      state.currentTurnIndex += 1;
    }
    this.countEntered(choice.target.sequence, left);
  }

  /** Takes the first choice when every choice waiting is an invisible
   *  default, as the current engine does when the flow can no longer
   *  continue (`Story.TryFollowDefaultInvisibleChoice`): in the same turn,
   *  entered from the flow it was raised in. */
  protected tryFollowDefaultInvisibleChoice(): boolean {
    const all = this._state.currentChoices;
    const invisible = all.filter((choice) => choice.isInvisibleDefault);
    if (invisible.length === 0 || all.length > invisible.length) {
      return false;
    }
    const choice = invisible[0]!;
    this.takeChoice(choice, choice.previousFlow, false);
    return true;
  }

  /** Whether a scene or a function declared at the top level has the name,
   *  as the current engine finds a knot by name (`Story.HasFunction`). */
  HasFunction(functionName: string): boolean {
    try {
      return this.FlowValueNamed(functionName) !== null;
    } catch (e) {
      return false;
    }
  }

  /** Runs the function or scene declared at the top level under
   *  `functionName` with `args` from outside the story, in a frame of its own
   *  that ends when the function returns or the scene ends, collecting the
   *  text it writes against an output of its own, as the current engine's
   *  `Story.EvaluateFunction` does: its result is what the function returns,
   *  as a JS value. */
  EvaluateFunction(
    functionName: string,
    args: any[] = [],
    returnTextOutput = false,
  ): any {
    this.IfAsyncWeCant("evaluate a function");
    if (functionName == null) {
      throw new Error("Function is null");
    } else if (functionName == "" || functionName.trim() == "") {
      throw new Error("Function is empty or white space.");
    }
    const found = this.FlowValueNamed(functionName);
    const target = found
      ? (this.targetOf(found.ref.symbol) ?? this.sceneTargetOf(found.ref.symbol))
      : null;
    if (!target) {
      throw new Error("Function doesn't exist: '" + functionName + "'");
    }
    const state = this._state;
    const outputStreamBefore = [...state.outputStream];
    const lineEnd = state.SuspendLineEnd();
    state.ResetOutput();

    this.enter(
      target,
      PushPopType.FunctionEvaluationFromGame,
      state.evaluationStack.length,
    );
    // A scene with no content of its own runs its first branch, which it
    // enters from the scene, as the current engine's knot diverts to its
    // first stitch; the scene itself is not counted, as the current engine
    // counts no container a host's evaluation starts in.
    const scene = found ? this.root.flow(found.ref.symbol) : undefined;
    if (scene && target.entry.sequence !== scene) {
      this.countEntered(target.entry.sequence, scene.flow);
    }
    this.passArguments(args);
    // A function takes the host's arguments as a call gives them
    // (`arrangeArgsFor`); a scene, which binds nothing, takes them as they
    // are, as on the current engine.
    if (target.bindings > 0) {
      arrangeArgsFor(this, target, args?.length ?? 0);
    }

    const stringOutput = new StringBuilder();
    while (this.canContinue) {
      stringOutput.Append(this.Continue());
    }
    const textOutput = stringOutput.toString();

    state.ResetOutput(outputStreamBefore);
    state.ResumeLineEnd(lineEnd);

    const result = this.completeFunctionEvaluation();
    return returnTextOutput ? { returned: result, output: textOutput } : result;
  }

  /**
   * Calls a function value from inside a step, as a builtin that takes a
   * function does (`table.sort`'s comparator, a metamethod, `gsub`'s
   * replacement), and returns what it left on the eval stack, as the current
   * engine's `Story.CallLuauFunction` does: the call enters the function in a
   * frame of its own and steps until that frame returns, against an output of
   * its own, and the step that called it resumes where it was.
   */
  CallLuauFunction(fnValue: AbstractValue, args: AbstractValue[]): AbstractValue[] {
    if (fnValue instanceof VariablePointerValue) {
      const resolved = this._state.variablesState.GetVariableWithName(
        fnValue.variableName,
      ) as AbstractValue | null;
      if (resolved == null) {
        throw new StoryException(
          "CallLuauFunction: variable pointer references unresolved variable",
        );
      }
      return this.CallLuauFunction(resolved, args);
    }

    // A builtin referenced first-class runs directly.
    const stdlibResults = tryInvokeStdLibMarkerValue(this, fnValue, args);
    if (stdlibResults != null) return stdlibResults;

    const state = this._state;
    const suspended = this.suspendStep();
    try {
      // Lua call-site semantics: extra arguments are discarded and missing
      // ones are nil.
      const callArgs = normalizeLuauCallArgs(this, fnValue, args);
      let target: FunctionTarget | null;
      if (fnValue instanceof ObjectValue) {
        for (const a of callArgs) state.PushEvaluationStack(a);
        target = extractClosureTarget(fnValue, this);
        if (target == null) {
          for (let i = 0; i < callArgs.length; i++) state.PopEvaluationStack();
          // A table whose metatable has `__call` is called through it.
          const callHandler = lookupMetamethod(fnValue, "__call");
          if (callHandler != null && !(callHandler instanceof NullValue)) {
            return this.CallLuauFunction(callHandler, [fnValue, ...args]);
          }
          throw new StoryException(
            "CallLuauFunction: ObjectValue is not a closure (missing `__closure_fn`)",
          );
        }
      } else if (isFunctionReference(fnValue)) {
        for (const a of callArgs) state.PushEvaluationStack(a);
        target = this.FunctionTargetOf(fnValue);
      } else {
        throw new StoryException(
          `CallLuauFunction: expected a function value, got ${fnValue}`,
        );
      }
      if (target == null) {
        throw new StoryException(
          "CallLuauFunction: could not resolve function value to a path",
        );
      }
      this.EnterFunction(target);
      // Bounded, counting the steps of callbacks nested inside this one,
      // which all run inside one of its own steps.
      const MAX_STEPS = 100000;
      const firstStep = this.stepCount;
      while (
        state.callStack.elements.length > suspended.depth &&
        state.position !== null
      ) {
        this.Step();
        if (this.stepCount - firstStep > MAX_STEPS) {
          throw new StoryException(
            "CallLuauFunction: callback exceeded step limit (possible infinite loop)",
          );
        }
      }
      const results: AbstractValue[] = [];
      while (state.evaluationStack.length > suspended.evalHeight) {
        results.unshift(state.PopEvaluationStack() as AbstractValue);
      }
      return results;
    } finally {
      this.resumeStep(suspended, false);
    }
  }

  /**
   * The protected form of `CallLuauFunction`, which `pcall` and `xpcall`
   * call, as the current engine's `Story.CallLuauFunctionProtected` does: an
   * error the function raises, thrown or added, is trapped and taken off the
   * story's errors, and returned as the call's error message.
   */
  CallLuauFunctionProtected(
    fnValue: AbstractValue,
    args: AbstractValue[],
  ): { ok: boolean; values: AbstractValue[]; errorMessage?: string } {
    if (fnValue instanceof VariablePointerValue) {
      const resolved = this._state.variablesState.GetVariableWithName(
        fnValue.variableName,
      ) as AbstractValue | null;
      if (resolved == null) {
        return {
          ok: false,
          values: [],
          errorMessage: "pcall: variable pointer references unresolved variable",
        };
      }
      return this.CallLuauFunctionProtected(resolved, args);
    }

    const state = this._state;
    // A builtin referenced first-class runs directly, with what it raises
    // trapped.
    if (
      fnValue instanceof ObjectValue &&
      (fnValue.value as Map<string, AbstractValue>)?.get("__stdlib_fn") != null
    ) {
      const errCountBefore = state.currentErrors?.length ?? 0;
      try {
        const values = tryInvokeStdLibMarkerValue(this, fnValue, args);
        if (values != null) {
          const errsNow = state.currentErrors;
          if (errsNow && errsNow.length > errCountBefore) {
            const msg = errsNow[errCountBefore]!;
            errsNow.length = errCountBefore;
            return { ok: false, values: [], errorMessage: msg };
          }
          return { ok: true, values };
        }
      } catch (e) {
        if (e instanceof StoryException) {
          const errsNow = state.currentErrors;
          if (errsNow && errsNow.length > errCountBefore) {
            errsNow.length = errCountBefore;
          }
          return { ok: false, values: [], errorMessage: e.message };
        }
        throw e;
      }
    }

    const savedErrorCount = state.currentErrors?.length ?? 0;
    const suspended = this.suspendStep();
    let trappedError: string | null = null;
    try {
      const callArgs = normalizeLuauCallArgs(this, fnValue, args);
      let target: FunctionTarget | null;
      if (fnValue instanceof ObjectValue) {
        for (const a of callArgs) state.PushEvaluationStack(a);
        target = extractClosureTarget(fnValue, this);
        if (target == null) {
          for (let i = 0; i < callArgs.length; i++) state.PopEvaluationStack();
          const callHandler = lookupMetamethod(fnValue, "__call");
          if (callHandler != null && !(callHandler instanceof NullValue)) {
            return this.CallLuauFunctionProtected(callHandler, [fnValue, ...args]);
          }
          return {
            ok: false,
            values: [],
            errorMessage:
              "pcall: target ObjectValue is not a closure (missing `__closure_fn`)",
          };
        }
      } else if (isFunctionReference(fnValue)) {
        for (const a of callArgs) state.PushEvaluationStack(a);
        target = this.FunctionTargetOf(fnValue);
      } else {
        return {
          ok: false,
          values: [],
          errorMessage: `pcall: expected a function value, got ${fnValue}`,
        };
      }
      if (target == null) {
        return {
          ok: false,
          values: [],
          errorMessage: "pcall: could not resolve function value to a path",
        };
      }
      this.EnterFunction(target);

      // Bounded as in `CallLuauFunction`, nested callbacks' steps included.
      const MAX_STEPS = 100000;
      const firstStep = this.stepCount;
      while (
        state.callStack.elements.length > suspended.depth &&
        state.position !== null
      ) {
        try {
          this.Step();
        } catch (e) {
          if (e instanceof StoryException) {
            trappedError = e.message;
            break;
          }
          throw e;
        }
        // A builtin can add an error without throwing it.
        const errs = state.currentErrors;
        if (errs && errs.length > savedErrorCount) {
          trappedError = errs[savedErrorCount]!;
          errs.length = savedErrorCount;
          break;
        }
        if (this.stepCount - firstStep > MAX_STEPS) {
          trappedError =
            "pcall: callback exceeded step limit (possible infinite loop)";
          break;
        }
      }

      const errs2 = state.currentErrors;
      if (errs2 && errs2.length > savedErrorCount) {
        if (trappedError == null) trappedError = errs2[savedErrorCount]!;
        errs2.length = savedErrorCount;
      }

      if (trappedError != null) {
        return { ok: false, values: [], errorMessage: trappedError };
      }

      const results: AbstractValue[] = [];
      while (state.evaluationStack.length > suspended.evalHeight) {
        results.unshift(state.PopEvaluationStack() as AbstractValue);
      }
      // A function that returns nothing leaves a `Void`, which pcall reads
      // as no value.
      while (results.length > 0 && results[0] instanceof Void) {
        results.shift();
      }
      return { ok: true, values: results };
    } finally {
      this.resumeStep(suspended, true);
    }
  }

  /** The value a read of `name` gives when no variable has that name but a
   *  scene or a function declared at the top level does: the symbol value of
   *  its flow, as the current engine gives a divert target to its knot
   *  (`Story.FlowValueNamed`), or null. */
  FlowValueNamed(name: string): SymbolValue | null {
    const symbol = this.root.table.symbolIds.get(name);
    if (symbol === undefined) {
      return null;
    }
    const kind = this.root.flow(symbol)?.kind;
    return kind === SymbolKind.Scene || kind === SymbolKind.Function
      ? this.symbolValue(symbol)
      : null;
  }

  /** The function a function value names for the shared call handlers: the
   *  entry of a symbol value's function in the root, or null for any other
   *  value and for a symbol the root defines no function for. */
  FunctionTargetOf(value: unknown): FunctionTarget | null {
    if (!(value instanceof SymbolValue)) {
      return null;
    }
    const symbol = this.symbolIn(value.ref);
    return symbol === undefined ? null : this.targetOf(symbol);
  }

  /** Enters `target`, a function the shared call handlers found
   *  (`FunctionTargetOf`), in a new function frame that returns to the
   *  position after the call. */
  EnterFunction(target: FunctionTarget): void {
    this.enter(target as SymbolTarget, PushPopType.Function);
  }

  /** The stack trace `debug.traceback` prints, as the current engine's call
   *  stack prints it: each call frame from the outermost, with the function
   *  it runs, named by its symbol, or for the flow's own frame, the flow's
   *  name. */
  CallStackTrace(): string {
    const sb = new StringBuilder();
    sb.AppendFormat("=== THREAD {0}/{1} {2}===\n", 1, 1, "(current) ");
    const elements = this._state.callStack.elements;
    for (let i = 0; i < elements.length; i++) {
      if (elements[i]!.type == PushPopType.Function) sb.Append("  [FUNCTION] ");
      else sb.Append("  [TUNNEL] ");
      const name = this.CallFramePath(i);
      if (name !== null) {
        sb.Append("<SOMEWHERE IN ");
        sb.Append(name);
        sb.AppendLine(">");
      }
    }
    return sb.toString();
  }

  /** How many call frames there are, for `debug.info`. */
  CallFrameCount(): number {
    return this._state.callStack.elements.length;
  }

  /** The name of call frame `index`, counting from the outermost, as
   *  `debug.info` names a frame: the name of the function a call frame runs,
   *  or for the flow's own frame, the name of the flow it is in (`0` for the
   *  top-level content, as the current engine's path of that container
   *  reads); null for a frame with no position. */
  CallFramePath(index: number): string | null {
    const state = this._state;
    const elements = state.callStack.elements;
    const element = elements[index];
    if (!element) {
      return null;
    }
    const above = elements[index + 1];
    const position =
      index === elements.length - 1
        ? state.position
        : above
          ? (state.frameOf(above)?.returnTo ?? null)
          : null;
    if (!position) {
      return null;
    }
    const frame = state.frameOf(element);
    if (frame) {
      return this.root.labelOf(frame.symbol);
    }
    const flow = position.sequence.flow;
    if (flow < 0) {
      return "global decl";
    }
    const name = this.root.labelOf(flow);
    return name === ROOT_FLOW_NAME ? "0" : name;
  }

  /** The source of the instruction running, or of the last one that ran, as
   *  debug metadata: its script's name and its lines, counting from 1. */
  get currentDebugMetadata(): DebugMetadata | null {
    const where = this.sourceOfRunning();
    if (!where) {
      return null;
    }
    const dm = new DebugMetadata();
    dm.fileName = where.file;
    dm.startLineNumber = where.startLine + 1;
    dm.endLineNumber = where.endLine + 1;
    return dm;
  }

  IfAsyncWeCant(activityStr: string): void {
    if (this._asyncContinueActive) {
      throw new Error(
        "Can't " +
          activityStr +
          ". Story is in the middle of a ContinueAsync(). Make more ContinueAsync() calls or a single Continue() call beforehand.",
      );
    }
  }

  /** Raises a runtime error at the instruction running, which ends the story
   *  (`Story.Error`). */
  Error(message: string, useEndLineNumber = false): never {
    const e = new StoryException(message);
    e.useEndLineNumber = useEndLineNumber;
    throw e;
  }

  /** Raises `message` in place of `cause`, an error a callback raised,
   *  keeping where the callback raised it (`Story.ErrorFrom`). */
  ErrorFrom(message: string, cause: unknown): never {
    const e = new StoryException(message);
    if (cause instanceof StoryException) {
      e.raisedPath = cause.raisedPath;
    }
    throw e;
  }

  Warning(message: string): void {
    this.AddError(message, true);
  }

  /** Records an error or warning at the instruction running, prefixed with
   *  its script and line as the current engine prefixes it
   *  (`Story.AddError`). */
  AddError(message: string, isWarning = false, useEndLineNumber = false): void {
    // The raised record keeps the text without the prefix, and no path: the
    // instruction running is a chunk's word, which no runtime path names.
    const raised: RaisedError = { message, path: null };
    const where = this.sourceOfRunning();
    const kind = isWarning ? "WARNING" : "ERROR";
    if (where) {
      const line = useEndLineNumber ? where.endLine : where.startLine;
      message = `RUNTIME ${kind}: '${where.file}' line ${line + 1}: ${message}`;
    } else {
      message = `RUNTIME ${kind}: ${message}`;
    }
    this._state.AddError(message, isWarning, raised);
    if (!isWarning) this._state.ForceEnd();
  }

  CleanOutputWhitespace(str: string): string {
    return cleanOutputWhitespace(
      str,
      this.processEscapes,
      this.collapseWhitespace,
    );
  }

  /** The address of the instruction at `offset` of the statement `chunk`,
   *  which names a decision to the route simulator. */
  static addressOf(chunk: StatementChunk, offset: number): string {
    return String(chunkId(chunk) * ADDRESS_OFFSETS + offset);
  }

  // ------------------------------------------------------------ continuing

  /** `stepAtATime` runs one instruction and stays in an asynchronous
   *  continue; otherwise the story runs to the end of the current line
   *  (`Story.ContinueInternal`). */
  ContinueInternal(stepAtATime = false): void {
    this._stateIsPristine = false;
    this._recursiveContinueCount++;
    const state = this._state;
    if (!this._asyncContinueActive) {
      this._asyncContinueActive = stepAtATime;
      if (!this.canContinue) {
        this._recursiveContinueCount--;
        throw new Error(
          "Can't continue - should check canContinue before calling Continue",
        );
      }
      // The state at the start of a line is the beat before it, which a
      // continue that ends with choices raised and no newline leaves as the
      // image of its beat (`captureBeat`).
      if (this.keepBeatImages && this._recursiveContinueCount == 1) {
        state.beatImage = this.stillImage() ?? this.capture();
      }
      state.didSafeExit = false;
      // The step the last continue cut off after its line ended starts this
      // one, with whether its own line still waits for its newline.
      const carried = state.TakeCarriedStep();
      state.ResetOutput(carried?.output ?? null);
      state.lineEndPending = carried?.lineEndPending ?? false;
      state.outputCut = null;
      if (this._recursiveContinueCount == 1) {
        state.variablesState.StartVariableObservation();
      }
    } else if (this._asyncContinueActive && !stepAtATime) {
      this._asyncContinueActive = false;
    }

    // Carried output that ends its line is a line already written, and this
    // continue returns it without stepping.
    let outputStreamEndsInNewline =
      !state.inStringEvaluation && state.outputStreamEndsInNewline;
    while (!outputStreamEndsInNewline && this.canContinue) {
      try {
        outputStreamEndsInNewline = this.ContinueSingleStep();
      } catch (e) {
        if (!(e instanceof StoryException)) {
          this._recursiveContinueCount--;
          throw e;
        }
        this.AddError(e.message, undefined, e.useEndLineNumber);
        break;
      }
      if (this.pausedBeforeCondition !== null || this._asyncContinueActive) {
        break;
      }
    }

    state.CarryOutputPastCut();

    // A continue that ended at its newline, or with the flow ended and no
    // choice waiting, leaves the state as it stands as its beat's image; one
    // that ended with choices raised leaves the image of the beat before it.
    if (
      outputStreamEndsInNewline ||
      (!this.canContinue && state.currentChoices.length === 0)
    ) {
      state.beatImage = null;
    }
    if (outputStreamEndsInNewline || !this.canContinue) {
      state.didSafeExit = false;
      if (this._recursiveContinueCount == 1) {
        state.variablesState.CompleteVariableObservation();
      }
      this._asyncContinueActive = false;
      if (this.onDidContinue !== null) this.onDidContinue();
    }

    this._recursiveContinueCount--;
    this.reportErrors();
    // A route simulation takes the choice its route forces at the menu, as
    // the current engine does, asked by the address of the instruction that
    // stopped the flow.
    const running = this._running;
    if (
      this.simulator &&
      running &&
      !this.canContinue &&
      state.currentChoices.length > 0
    ) {
      const chunk = running.sequence.arrays.chunks[running.entry];
      if (chunk) {
        const forcedSource = this.simulator.forceChoice(
          ProgramStory.addressOf(chunk, running.offset),
        );
        const forced = state.currentChoices.find(
          (choice) => choice.sourcePath === forcedSource,
        );
        if (forced) {
          this.ChooseChoice(forced);
        }
      }
    }
  }

  /** Hands the errors and warnings the continue raised to `onError`, or
   *  throws the first when no handler is set (`Story.ContinueInternal`). */
  protected reportErrors(): void {
    const state = this._state;
    if (!state.hasError && !state.hasWarning) {
      return;
    }
    if (this.onError !== null) {
      if (state.hasError) {
        const raised = state.raisedErrors;
        state.currentErrors!.forEach((err, i) => {
          this.onError!(err, ErrorType.Error, null, raised[i] ?? null);
        });
      }
      if (state.hasWarning) {
        const raised = state.raisedWarnings;
        state.currentWarnings!.forEach((err, i) => {
          this.onError!(err, ErrorType.Warning, null, raised[i] ?? null);
        });
      }
      this.ResetErrors();
    } else {
      const first = state.hasError
        ? state.currentErrors![0]!
        : state.currentWarnings![0]!;
      throw new StoryException(
        `Ink had errors or warnings. It is strongly suggested that you assign an error handler to story.onError. The first issue was: ${first}`,
      );
    }
  }

  /** Runs one instruction, and returns true when it ended this continue's
   *  line (`Story.ContinueSingleStep`). */
  ContinueSingleStep(): boolean {
    this.Step();
    const state = this._state;
    if (state.outputCut !== null) {
      if (this.canContinue) return true;
      state.CloseOutputCut();
    }
    if (!this.canContinue && !state.callStack.elementIsEvaluateFromGame) {
      this.tryFollowDefaultInvisibleChoice();
    }
    return !state.inStringEvaluation && state.outputStreamEndsInNewline;
  }

  /** Runs the instruction at the position. A body whose sequence runs out
   *  resumes its owner at the block's resume offset first; a flow's sequence
   *  that runs out ends the flow as `Done` does: the compiler ends every flow
   *  that does not end itself with a `-> DONE`, and the top-level content
   *  with a `done`. */
  Step(): void {
    const state = this._state;
    const position = state.position;
    if (!position) {
      return;
    }
    const chunk = this.fetch(position);
    if (
      chunk &&
      this.pauseBeforeEvaluatingConditions &&
      this.pausesAt(chunk, position.offset)
    ) {
      // Stopped before the decision: nothing is consumed and the position
      // does not move. A decision the route simulator forces is not one to
      // stop at: a route search that forked at it runs on through it with
      // the verdict it forces, which it asks by the decision's address, as
      // the current engine's search asks by the path it stands at.
      const address = ProgramStory.addressOf(chunk, position.offset);
      if (!this.simulator?.willForceCondition(address)) {
        this.pausedBeforeCondition = address;
        return;
      }
    }
    this.pausedBeforeCondition = null;
    this.stepCount++;
    if (this.stepLimit !== null && this.stepCount > this.stepLimit) {
      throw new StepLimitExceeded();
    }
    if ((this.stepCount & (EXECUTION_WATCH_STEPS - 1)) === 0) {
      executionWatch.listener?.(this);
    }
    if (!chunk) {
      this.done();
      return;
    }
    this.execute(position, chunk);
    // A statement whose last instruction ran rests at the start of the next.
    const current = state.position;
    if (current) {
      const chunks = current.sequence.arrays.chunks;
      if (
        current.entry < chunks.length &&
        current.offset >= codeWords(chunks[current.entry]!)
      ) {
        current.entry += 1;
        current.offset = 0;
      }
    }
  }

  // --------------------------------------------------------------- internals

  /** The chunk the position is in, after moving past the end of each
   *  statement and each body the position has reached the end of, closing
   *  the pass scope of a body that runs in one (`BLOCK_PASS_SCOPE`); nothing
   *  when the flow has run out. */
  protected fetch(position: ProgramPosition): StatementChunk | undefined {
    const state = this._state;
    for (;;) {
      const chunks = position.sequence.arrays.chunks;
      while (
        position.entry < chunks.length &&
        position.offset >= codeWords(chunks[position.entry]!)
      ) {
        position.entry += 1;
        position.offset = 0;
      }
      const chunk = chunks[position.entry];
      if (chunk) {
        return chunk;
      }
      const top = state.blockStack.pop();
      if (!top) {
        return undefined;
      }
      const owner = top.sequence.arrays.chunks[top.entry]!;
      if (blockFlags(owner, top.block) & BLOCK_PASS_SCOPE) {
        state.frame?.PopScope(state.callStack.cellBarrier);
      }
      position.sequence = top.sequence;
      position.entry = top.entry;
      position.offset = blockField(owner, top.block, B_RESUME);
    }
  }

  // Whether the instruction at `offset` is a decision: a conditional's jump,
  // or a choice with a condition.
  protected pausesAt(chunk: StatementChunk, offset: number): boolean {
    const w0 = chunk[HEADER_WORDS + offset]!;
    const op = opOf(w0);
    return (
      (op === Op.JumpIfFalse && (flagsOf(w0) & JUMP_DECISION) !== 0) ||
      (op === Op.Choice && (flagsOf(w0) & CHOICE_DECISION) !== 0)
    );
  }

  /**
   * `Choice` (`Story.ProcessChoice`): pops the condition, the choice-only
   * text and the start text, each with the tags below it, as the flags say,
   * and raises a choice unless the condition is false or a once-only
   * choice's count, the symbol of the `Visit` its entry opens with, is not
   * zero. The choice holds a copy of the current thread, its entry `arg`
   * words past the instruction (the position has moved past it), and the
   * blocks the entry is inside; its identity is the instruction's address.
   */
  protected raiseChoice(
    chunk: StatementChunk,
    position: ProgramPosition,
    flags: number,
    arg: number,
  ): void {
    const state = this._state;
    const at = position.offset - 2;
    let show = true;
    if (flags & CHOICE_CONDITION) {
      if (flags & CHOICE_DECISION && this.simulator) {
        const forced = this.simulator.forceCondition(
          ProgramStory.addressOf(chunk, at),
        );
        // A null verdict means the route says nothing about this choice, so
        // the evaluated value stands.
        if (forced != null) {
          state.PopEvaluationStack();
          state.PushEvaluationStack(new IntValue(forced ? 1 : 0));
        }
      }
      const value = state.PopEvaluationStack();
      const truthy = this.isTruthy(value);
      if (this.onEvaluateCondition) {
        this.onEvaluateCondition(truthy);
      }
      if (!truthy) {
        show = false;
      }
    }
    const tags: string[] = [];
    const choiceOnly = flags & CHOICE_ONLY ? this.popChoiceText(tags) : "";
    const start = flags & CHOICE_START ? this.popChoiceText(tags) : "";
    const entry = position.offset + arg;
    if (flags & CHOICE_ONCE) {
      const w0 = chunk[HEADER_WORDS + entry];
      if (w0 === undefined || opOf(w0) !== Op.Visit) {
        this.Error("A choice's entry does not count it.");
      }
      if (state.VisitCount(this.countId(chunk[HEADER_WORDS + entry + 1]!)) > 0) {
        show = false;
      }
    }
    if (!show) {
      return;
    }
    const choice = new ProgramChoice(
      { sequence: position.sequence, entry: position.entry, offset: entry },
      state.blockStack.slice(),
      chunk,
      position.sequence.flow,
    );
    choice.sourcePath = ProgramStory.addressOf(chunk, at);
    choice.isInvisibleDefault = (flags & CHOICE_INVISIBLE_DEFAULT) !== 0;
    choice.threadAtGeneration = state.ForkChoiceThread();
    choice.tags = tags.reverse();
    choice.text = this.CleanOutputWhitespace(start + choiceOnly);
    state.generatedChoices.push(choice);
  }

  /** Pops a choice's captured text, and the tags below it into `tags`
   *  (`Story.PopChoiceStringAndTags`). */
  protected popChoiceText(tags: string[]): string {
    const state = this._state;
    const text = asOrThrows(state.PopEvaluationStack(), StringValue);
    while (state.PeekEvaluationStack() instanceof Tag) {
      tags.push((state.PopEvaluationStack() as Tag).text);
    }
    return text.value ?? "";
  }

  /** Runs the instruction at the position, which `fetch` found in `chunk`. */
  protected execute(position: ProgramPosition, chunk: StatementChunk): void {
    const state = this._state;
    this._running = {
      sequence: position.sequence,
      entry: position.entry,
      offset: position.offset,
    };
    state.previousFlow = position.sequence.flow;
    const at = HEADER_WORDS + position.offset;
    const w0 = chunk[at]!;
    const arg = chunk[at + 1]!;
    const flags = flagsOf(w0);
    position.offset += 2;
    switch (opOf(w0)) {
      case Op.LineStart:
        break;
      case Op.Text:
        state.PushToOutputStream(new StringValue(this.root.table.strings[arg]!));
        break;
      case Op.Newline:
        state.PushToOutputStream(new StringValue("\n"));
        break;
      case Op.BeginTag:
        state.PushToOutputStream(ControlCommand.BeginTag());
        break;
      case Op.EndTag:
        if (state.inStringEvaluation) {
          // A tag inside a choice's text goes with the choice.
          captureTag(this, (text) => this.CleanOutputWhitespace(text));
        } else {
          state.PushToOutputStream(ControlCommand.EndTag());
        }
        break;
      case Op.Out: {
        // Functions may evaluate to Void, in which case nothing is output.
        if (state.evaluationStack.length > 0) {
          const output = state.PopEvaluationStack();
          if (!(output instanceof Void)) {
            state.PushToOutputStream(new StringValue(output.toString()));
          }
        }
        break;
      }
      case Op.BeginString:
        state.PushToOutputStream(ControlCommand.BeginString());
        break;
      case Op.EndString:
        state.PushEvaluationStack(captureString(state));
        break;
      case Op.Str:
        state.PushEvaluationStack(
          (this._strings[arg] ??= new StringValue(this.root.table.strings[arg]!)),
        );
        break;
      case Op.Int:
        state.PushEvaluationStack(new IntValue(arg));
        break;
      case Op.Num: {
        const value = this.root.table.numbers[arg]!;
        state.PushEvaluationStack(
          flags & NUM_FLOAT ? new FloatValue(value) : new IntValue(value),
        );
        break;
      }
      case Op.Const:
        state.PushEvaluationStack(constValue(auxOf(w0)));
        break;
      case Op.Sym:
        state.PushEvaluationStack(this.symbolValue(arg));
        break;
      case Op.VarPtr:
        state.PushEvaluationStack(
          openVariablePointer(state.callStack, this.root.table.strings[arg]!),
        );
        break;
      case Op.MakeTable: {
        const stack = state.evaluationStack;
        const between = stack.splice(stack.length - arg * 2, arg * 2);
        state.PushEvaluationStack(tableFromPairs(between, 0));
        break;
      }
      case Op.Dup:
        state.PushEvaluationStack(state.PeekEvaluationStack()!);
        break;
      case Op.Pop:
        state.PopEvaluationStack();
        break;
      case Op.Pack:
        packTuple(this, arg);
        break;
      case Op.Unpack:
        unpackTuple(this, arg);
        break;
      case Op.Index: {
        const key = state.PopEvaluationStack();
        const base = state.PopEvaluationStack();
        state.PushEvaluationStack(indexValue(this, base, key));
        break;
      }
      case Op.StoreIndex: {
        const value = state.PopEvaluationStack();
        const key = state.PopEvaluationStack();
        const base = state.PopEvaluationStack();
        storeIndex(this, base, key, value);
        break;
      }
      case Op.GetVar:
        state.PushEvaluationStack(
          readVariable(this, this.root.table.strings[arg]!),
        );
        break;
      case Op.SetVar: {
        let value = state.PopEvaluationStack();
        // A variable holds one value: a multiple value keeps its first, and
        // a call that returned none gives nil (`oneValue`), except in a
        // variadic function's `...` local, which keeps it whole.
        if (!(flags & SET_VARARGS)) {
          value = oneValue(value);
        }
        state.variablesState.Assign(this.assignment(arg, flags), value);
        break;
      }
      case Op.Native: {
        const func = this.native(arg, auxOf(w0));
        const params = state.PopEvaluationStack(func.numberOfParameters);
        state.PushEvaluationStack(
          callNativeFunction(this, func, params) as InkObject,
        );
        break;
      }
      case Op.JumpIfKeep:
        if (shortCircuitDecides(this, flags & KEEP_OR ? "or" : "and")) {
          position.offset += arg;
        }
        break;
      case Op.JumpIfFalse:
        if (!this.condition(chunk, position.offset - 2, flags)) {
          position.offset += arg;
        }
        break;
      case Op.Jump:
        position.offset += arg;
        break;
      case Op.BeginScope:
        state.frame?.PushScope();
        break;
      case Op.EndScope:
        state.frame?.PopScope(state.callStack.cellBarrier);
        break;
      case Op.EnterBlock: {
        const body = this.root.body(chunk, arg);
        if (!body) {
          this.Error(`The program has no body for block ${arg} of the statement.`);
        }
        state.blockStack.push({
          sequence: position.sequence,
          entry: position.entry,
          block: arg,
        });
        position.sequence = body;
        position.entry = 0;
        position.offset = 0;
        break;
      }
      case Op.Leave:
        this.leave((flags & LEAVE_CONTINUE) !== 0);
        break;
      case Op.Call: {
        if (flags & CALL_TUNNEL) {
          this.callTunnel(arg);
          break;
        }
        const target = this.targetOf(arg);
        if (!target) {
          this.Error("Divert target not found.");
        }
        // The arguments the call wrote, arranged for the function's
        // parameters, as a static call's are.
        arrangeArgsFor(this, target, auxOf(w0));
        this.EnterFunction(target);
        break;
      }
      case Op.CallVar: {
        if (flags & CALL_TUNNEL) {
          this.callTunnel(
            this.symbolOfVariable(this.root.table.strings[arg]!),
          );
          break;
        }
        const target = callVariableTarget(
          this,
          this.root.table.strings[arg]!,
          auxOf(w0),
        );
        if (target !== null) {
          this.EnterFunction(target);
        }
        break;
      }
      case Op.CallValue: {
        const count = auxOf(w0);
        callValueAsFunction(this, count === CALL_ARGS_UNKNOWN ? -1 : count);
        break;
      }
      case Op.Return:
        this.returnFromFunction();
        break;
      case Op.CallStd:
        this.callStd(
          this.root.table.strings[arg]!,
          auxOf(w0),
          (flags & CALL_DISCARD) !== 0,
        );
        break;
      case Op.Done:
        // The end of a `choose` block's presentation stops only for a choice
        // the block raised.
        if (
          flags & DONE_HOLD &&
          !state.generatedChoices.some((choice) => choice.chunk === chunk)
        ) {
          break;
        }
        this.done();
        break;
      case Op.Choice:
        this.raiseChoice(chunk, position, flags, arg);
        break;
      case Op.End:
        state.ForceEnd();
        break;
      case Op.JumpSym:
        this.jumpTo(arg);
        break;
      case Op.JumpVar:
        this.jumpTo(this.symbolOfVariable(this.root.table.strings[arg]!));
        break;
      case Op.TunnelReturn:
        this.tunnelReturn();
        break;
      case Op.Thread:
        // The fork runs on from here, and the original resumes past the
        // fork's jump when the fork ends.
        state.ForkThread({
          sequence: position.sequence,
          entry: position.entry,
          offset: position.offset + arg,
        });
        break;
      case Op.Visit:
        state.Visit(this.countId(arg));
        break;
      case Op.GetCount:
        state.PushEvaluationStack(
          new IntValue(state.VisitCount(this.countId(arg))),
        );
        break;
      case Op.CountOf:
        this.countOf((flags & COUNT_TURNS) !== 0);
        break;
      case Op.VisitIndex:
        state.PushEvaluationStack(
          new IntValue(state.VisitCount(this.countId(arg)) - 1),
        );
        break;
      case Op.ShuffleIndex:
        this.shuffleIndex(arg);
        break;
      case Op.Tag:
        state.PushToOutputStream(new Tag(this.root.table.strings[arg]!));
        break;
      default:
        this.Error(`unknown instruction ${opOf(w0)}`);
    }
  }

  /** Pops a condition and tests it: by Luau truthiness for an `if`
   *  expression, and otherwise as the current engine tests a conditional
   *  divert's condition. A decision's verdict is the route simulator's when
   *  it forces one, and the story reports every decision's verdict. */
  protected condition(
    chunk: StatementChunk,
    offset: number,
    flags: number,
  ): boolean {
    const state = this._state;
    if (flags & JUMP_LUAU) {
      return popLuauCondition(this);
    }
    if (flags & JUMP_DECISION && this.simulator) {
      const forced = this.simulator.forceCondition(
        ProgramStory.addressOf(chunk, offset),
      );
      // A null verdict means the route says nothing about this decision, so
      // the evaluated value stands.
      if (forced != null) {
        state.PopEvaluationStack();
        state.PushEvaluationStack(new IntValue(forced ? 1 : 0));
      }
    }
    const value = state.PopEvaluationStack();
    const truthy = this.isTruthy(value);
    if (flags & JUMP_DECISION && this.onEvaluateCondition) {
      this.onEvaluateCondition(truthy);
    }
    return truthy;
  }

  /** A condition's truth as the current engine tests a conditional divert's
   *  (`Story.IsTruthy`): a function value is refused, named as the current
   *  engine names its divert target. */
  protected isTruthy(obj: InkObject): boolean {
    if (obj instanceof Value) {
      if (obj instanceof DivertTargetValue || obj instanceof SymbolValue) {
        const target =
          obj instanceof SymbolValue ? obj.ref.label : obj.targetPath;
        this.Error(
          "Shouldn't use a divert target (to " +
            target +
            ") as a conditional value. Did you intend a function call 'likeThis()' or a read count check 'likeThis'? (no arrows)",
        );
      }
      return obj.isTruthy;
    }
    return false;
  }

  /** Leaves the blocks up to the nearest loop body and resumes its owner at
   *  the block's break offset, or at its resume offset for a `continue`. */
  protected leave(isContinue: boolean): void {
    const state = this._state;
    const position = state.position!;
    for (let top = state.blockStack.pop(); top; top = state.blockStack.pop()) {
      const owner = top.sequence.arrays.chunks[top.entry]!;
      if (blockFlags(owner, top.block) & BLOCK_LOOP) {
        position.sequence = top.sequence;
        position.entry = top.entry;
        position.offset = blockField(
          owner,
          top.block,
          isContinue ? B_RESUME : B_BREAK,
        );
        return;
      }
    }
    this.Error(`${isContinue ? "continue" : "break"} outside a loop`);
  }

  /** The function value of `symbol`, made once. It holds the symbol's name,
   *  or nothing for an anonymous symbol, and prints as the current engine
   *  prints the divert target of the function's container. */
  protected symbolValue(symbol: number): SymbolValue {
    let value = this._symbols.get(symbol);
    if (!value) {
      const table = this.root.table;
      value = new SymbolValue(
        new SymbolRef(
          symbol,
          this.root.generation,
          isAnonymousSymbol(table, symbol) ? null : table.symbols[symbol]!,
          this.root.labelOf(symbol),
        ),
      );
      this._symbols.set(symbol, value);
    }
    return value;
  }

  /** The id in this root's table of the symbol `ref` names: its own id when
   *  it was made in this root's table generation, and otherwise the id the
   *  reseeds since then gave it (`ProgramRoot.symbolFrom`). A symbol whose id
   *  here names a symbol with another name, as the id of a value a save of
   *  another program holds can, or one the reseeds dropped, is the symbol of
   *  its name, when it has one. */
  protected symbolIn(ref: SymbolRef): number | undefined {
    const table = this.root.table;
    const id =
      ref.generation === this.root.generation
        ? ref.symbol
        : this.root.symbolFrom(ref.symbol, ref.generation);
    if (
      id !== undefined &&
      (ref.name === null
        ? isAnonymousSymbol(table, id)
        : table.symbols[id] === ref.name)
    ) {
      return id;
    }
    return ref.name === null ? undefined : table.symbolIds.get(ref.name);
  }

  /** The function `symbol` names in the root, or null when the root defines
   *  none: its entry, and what the `SetVar`s its entry code starts with bind,
   *  the first of which binds the last parameter. */
  protected targetOf(symbol: number): SymbolTarget | null {
    let target = this._targets.get(symbol);
    if (target === undefined) {
      target = null;
      const entry = this.root.functionEntry(symbol);
      if (entry) {
        const chunk = entry.sequence.arrays.chunks[entry.entry]!;
        let bindings = 0;
        let variadic = false;
        for (let at = entry.offset; at < codeWords(chunk); at += 2) {
          const w0 = chunk[HEADER_WORDS + at]!;
          if (opOf(w0) !== Op.SetVar) {
            break;
          }
          if (bindings === 0) {
            variadic = (flagsOf(w0) & SET_VARARGS) !== 0;
          }
          bindings += 1;
        }
        target = new SymbolTarget(symbol, entry, variadic, bindings);
      }
      this._targets.set(symbol, target);
    }
    return target;
  }

  /** The scene `symbol` names, run from the start of its flow, as the
   *  current engine runs a knot a host evaluates as a function; or null when
   *  `symbol` names no scene. A scene binds no parameters. */
  protected sceneTargetOf(symbol: number): SymbolTarget | null {
    const flow = this.root.flow(symbol);
    if (flow?.kind !== SymbolKind.Scene) {
      return null;
    }
    // A scene with no content of its own runs its first branch.
    const start = this.root.startOf(symbol);
    const branch =
      start >= 0 && flow.arrays.chunks.length === 0
        ? this.root.place(start)
        : undefined;
    return new SymbolTarget(
      symbol,
      branch ?? { sequence: flow, entry: 0, offset: 0 },
      false,
      0,
    );
  }

  /** Pushes a call frame of `type` that returns to the position, inside the
   *  blocks the position is inside, and moves to `target`'s entry, where the
   *  frame is inside no block yet. */
  protected enter(target: SymbolTarget, type: PushPopType, evalHeight = 0): void {
    const state = this._state;
    // A call counts the function it enters, unless it is made from inside
    // that function, as a jump counts a flow (section 5).
    if (type == PushPopType.Function) {
      const caller = state.frame ? state.frameOf(state.frame) : undefined;
      if (caller?.symbol !== target.symbol) {
        state.Visit(this.countId(target.symbol));
      }
    }
    state.PushFrame(
      type,
      { returnTo: state.position, blocks: state.blockStack, symbol: target.symbol },
      evalHeight,
    );
    state.position = {
      sequence: target.entry.sequence,
      entry: target.entry.entry,
      offset: target.entry.offset,
    };
    state.blockStack = [];
  }

  /** `Return`: leaves the value on top as the function's result, pops the
   *  function's frame and resumes its caller where the call left it. A frame
   *  a host's evaluation pushed ends the evaluation and stays, for
   *  `completeFunctionEvaluation` to pop. A return outside a function is the
   *  current engine's error. */
  protected returnFromFunction(): void {
    const state = this._state;
    const callStack = state.callStack;
    const element = callStack.currentElement!;
    if (element.type == PushPopType.FunctionEvaluationFromGame) {
      state.position = null;
      state.didSafeExit = true;
      return;
    }
    if (element.type != PushPopType.Function || !callStack.canPop) {
      let expected =
        element.type == PushPopType.Function
          ? "function return statement (return)"
          : "tunnel onwards statement (->->)";
      if (!callStack.canPop) {
        expected = "end of flow (-> END or choice)";
      }
      this.Error(
        "Found function return statement (return), when expected " + expected,
      );
    }
    const frame = state.PopCallStack();
    state.position = frame?.returnTo ?? null;
    state.blockStack = frame?.blocks ?? [];
  }

  /** Pops the frame of a host's evaluation and returns what the function
   *  returned as a JS value (`StoryState.CompleteFunctionEvaluationFromGame`). */
  protected completeFunctionEvaluation(): unknown {
    const state = this._state;
    const element = state.callStack.currentElement!;
    if (element.type != PushPopType.FunctionEvaluationFromGame) {
      throw new Error(
        "Expected external function evaluation to be complete. Stack trace: " +
          this.CallStackTrace(),
      );
    }
    const height = element.evaluationStackHeightWhenPushed;
    let returnedObj: InkObject | null = null;
    while (state.evaluationStack.length > height) {
      const poppedObj = state.PopEvaluationStack();
      if (returnedObj === null) returnedObj = poppedObj;
    }
    const frame = state.PopCallStack(PushPopType.FunctionEvaluationFromGame);
    state.position = frame?.returnTo ?? null;
    state.blockStack = frame?.blocks ?? [];
    if (returnedObj) {
      if (returnedObj instanceof Void) return null;
      const returnVal = asOrThrows(returnedObj, Value);
      // A function value is returned as the text of its target.
      if (returnVal.valueType == ValueType.DivertTarget) {
        return "-> " + returnVal.valueObject.toString();
      }
      return returnVal.valueObject;
    }
    return null;
  }

  /** Pushes a host's arguments (`StoryState.PassArgumentsToEvaluationStack`):
   *  a runtime value as it is, and a number, string, boolean or list as the
   *  value it makes. */
  protected passArguments(args: any[] | null): void {
    if (args === null) {
      return;
    }
    for (const arg of args) {
      if (arg instanceof InkObject) {
        this._state.PushEvaluationStack(arg);
        continue;
      }
      if (
        !(
          typeof arg === "number" ||
          typeof arg === "string" ||
          typeof arg === "boolean" ||
          arg instanceof InkList
        )
      ) {
        throw new Error(
          "ink arguments when calling EvaluateFunction / ChoosePathStringWithParameters must be" +
            "number, string, bool or InkList. Argument was " +
            (arg == null ? "null" : arg.constructor.name),
        );
      }
      this._state.PushEvaluationStack(Value.Create(arg)!);
    }
  }

  /** What a callback suspends of the step that calls it: the frames, the
   *  eval stack's height, the position and its blocks, the output and its
   *  line end, the pause before decisions (the decisions a route forces are
   *  the story's, not a callback's) and the instruction running. */
  protected suspendStep(): SuspendedStep {
    const state = this._state;
    const suspended: SuspendedStep = {
      depth: state.callStack.elements.length,
      evalHeight: state.evaluationStack.length,
      position: state.position,
      blocks: state.blockStack,
      output: [...state.outputStream],
      lineEnd: state.SuspendLineEnd(),
      pause: this.pauseBeforeEvaluatingConditions,
      running: this._running,
    };
    state.ResetOutput();
    this.pauseBeforeEvaluatingConditions = false;
    return suspended;
  }

  /** Resumes the step a callback suspended, popping the frames the callback
   *  left when it raised an error and, for a protected call, what it left on
   *  the eval stack. */
  protected resumeStep(suspended: SuspendedStep, dropValues: boolean): void {
    const state = this._state;
    while (state.callStack.elements.length > suspended.depth) {
      state.PopCallStack();
    }
    if (dropValues) {
      while (state.evaluationStack.length > suspended.evalHeight) {
        state.PopEvaluationStack();
      }
    }
    state.position = suspended.position;
    state.blockStack = suspended.blocks;
    state.ResetOutput(suspended.output);
    state.ResumeLineEnd(suspended.lineEnd);
    this.pauseBeforeEvaluatingConditions = suspended.pause;
    this._running = suspended.running;
  }

  /** The runtime assignment `SetVar`'s operands describe, made once. */
  protected assignment(name: number, flags: number): VariableAssignment {
    const mask = SET_DECLARE | SET_GLOBAL | SET_VARARGS;
    const key = name * 8 + (flags & mask);
    let assignment = this._assignments.get(key);
    if (!assignment) {
      assignment = new VariableAssignment(
        this.root.table.strings[name]!,
        (flags & SET_DECLARE) !== 0,
        (flags & SET_VARARGS) !== 0,
      );
      assignment.isGlobal = (flags & SET_GLOBAL) !== 0;
      this._assignments.set(key, assignment);
    }
    return assignment;
  }

  /** The native function `Native`'s operands name, made once. */
  protected native(name: number, arity: number): NativeFunctionCall {
    const key = name * 0x10000 + arity;
    let func = this._natives.get(key);
    if (!func) {
      func = NativeFunctionCall.CallWithName(this.root.table.strings[name]!, arity);
      this._natives.set(key, func);
    }
    return func;
  }

  /** `Done`, or a flow that runs out: ends a forked thread, whose original
   *  resumes where the fork left it, or with no thread to end, stops the
   *  flow with a safe exit (`Story.StopFlowInThread`). */
  protected done(): void {
    const state = this._state;
    if (state.canPopThread) {
      state.PopThread();
      return;
    }
    state.position = null;
    state.blockStack = [];
    state.didSafeExit = true;
  }


  /** Moves to `target` in the current frame (docs/engine/binary-program.md,
   *  section 5): the frame's block stack is rebuilt from the root's sequence
   *  and chunk tables, and its scope depth becomes the target's. The scopes
   *  of the blocks the target shares with `from`, the blocks the frame stood
   *  in before (nothing for a new frame or a reset one), keep their
   *  bindings; the scopes past them are closed, and the scopes of the blocks
   *  the target enters are opened, as many as each owner has open where it
   *  enters its block, and as many as the target's chunk has opened before
   *  the target. */
  protected land(target: ProgramPosition, from: readonly BlockEntry[]): void {
    const state = this._state;
    const blocks = blockStackOf(this.root, target.sequence);
    if (!blocks) {
      this.Error("The position is in a block the program no longer has.");
    }
    state.position = {
      sequence: target.sequence,
      entry: target.entry,
      offset: target.offset,
    };
    state.blockStack = blocks;
    const frame = state.frame;
    if (frame) {
      const scopesOf = (block: BlockEntry) =>
        blockScopes(block.sequence.arrays.chunks[block.entry]!, block.block);
      let shared = 0;
      let kept = 1;
      while (
        shared < blocks.length &&
        shared < from.length &&
        sameBlock(blocks[shared]!, from[shared]!)
      ) {
        kept += scopesOf(blocks[shared]!);
        shared += 1;
      }
      while (frame.temporaryScopes.length > kept) {
        frame.PopScope(state.callStack.cellBarrier);
      }
      let scopes = 1;
      for (const block of blocks) {
        scopes += scopesOf(block);
      }
      const chunk = target.sequence.arrays.chunks[target.entry];
      if (chunk) {
        scopes += scopesBefore(chunk, target.offset);
      }
      // The scopes past the shared blocks are opened. A shared block's count
      // is the most its owner can have open, which a `choose` block's entry
      // has fewer of when a branch gating an earlier choice did not run
      // (section 4): the frame's own are kept as they are, and no empty one
      // is opened in their place, as the current engine opens none.
      for (let open = kept; open < scopes; open += 1) {
        frame.PushScope();
      }
    }
  }

  /** `JumpSym`: moves to where `symbol` is defined, counting the flows the
   *  jump enters from the position it left, or raises the current engine's
   *  error for a target the program does not define, with the jump's line. */
  protected jumpTo(
    symbol: number,
    left: SequenceRow | null = this._running?.sequence ?? null,
  ): void {
    const place = this.root.place(symbol);
    if (!place) {
      this.Error("Divert target not found.");
    }
    this.land(place, this._state.blockStack);
    this.countEntered(place.sequence, left?.flow ?? -1);
    this.countLabelsAbove(place);
    this.enterStart(symbol, place.sequence);
  }

  /** A jump to a label counts too the labels written right before it with
   *  nothing between, as the current engine's does: its weave nests a label
   *  as the first content of the label before it, and a divert counts each
   *  label container it enters at its start
   *  (`Story.VisitChangedContainersDueToDivert`). A statement with no code
   *  and no export (`const`, `store`) is nothing between: the current engine
   *  makes no runtime object of it, so its weave nests the labels around it
   *  all the same. */
  protected countLabelsAbove(place: ProgramPosition): void {
    const chunks = place.sequence.arrays.chunks;
    if (place.offset !== 0 || !isLabelChunk(chunks[place.entry])) {
      return;
    }
    for (let entry = place.entry - 1; entry >= 0; entry -= 1) {
      const chunk = chunks[entry];
      if (isEmptyChunk(chunk)) {
        continue;
      }
      if (!isLabelChunk(chunk)) {
        return;
      }
      this._state.Visit(this.countId(exportSymbol(chunk!, 0)));
    }
  }

  /** A scene with no content of its own before its first branch enters that
   *  branch when it is entered, as the current engine's knot diverts to its
   *  first stitch; the branch is entered from the scene. */
  protected enterStart(symbol: number, at: SequenceRow): void {
    const start = this.root.startOf(symbol);
    if (start < 0 || at.arrays.chunks.length > 0) {
      return;
    }
    const branch = this.root.place(start);
    if (branch) {
      this.land(branch, this._state.blockStack);
      this.countEntered(branch.sequence, at.flow);
    }
  }

  /** The flow entry rule (docs/engine/binary-program.md, section 5): a flow
   *  counts when it is entered from outside it, wherever the jump lands, and
   *  a jump from inside a flow does not count it again. The flows a position
   *  is in are its sequence's flow and, for a branch, its scene; each one the
   *  target is in and the flow `left` (a symbol, or -1 for none) is not gets
   *  a visit. */
  protected countEntered(target: SequenceRow, left: number): void {
    const was = this.flowsOf(left);
    for (const flow of this.flowsOf(target.flow)) {
      if (!was.includes(flow)) {
        this._state.Visit(this.countId(flow));
      }
    }
  }

  // A flow and, for a branch, its scene.
  protected flowsOf(flow: number): number[] {
    if (flow < 0) {
      return [];
    }
    const parent = this.root.parentOf(flow);
    return parent >= 0 ? [flow, parent] : [flow];
  }

  /** The count id of `symbol` in the root's table, or -1. */
  protected countId(symbol: number): number {
    return countIdOf(this.root.table, symbol);
  }

  /** A tunnel call (`Call` or `CallVar` with the tunnel flag): pushes a
   *  tunnel frame that returns after the call, inside the blocks the call
   *  stands in, and moves to where `symbol` is defined, counting the flows
   *  it enters. */
  protected callTunnel(symbol: number): void {
    const state = this._state;
    const left = this._running?.sequence ?? null;
    const place = this.root.place(symbol);
    if (!place) {
      this.Error("Divert target not found.");
    }
    state.PushFrame(PushPopType.Tunnel, {
      returnTo: state.position,
      blocks: state.blockStack,
      symbol,
    });
    this.land(place, []);
    this.countEntered(place.sequence, left?.flow ?? -1);
    this.countLabelsAbove(place);
    this.enterStart(symbol, place.sequence);
  }

  /** `TunnelReturn`: pops a tunnel frame and resumes its caller after the
   *  tunnel call, or with a symbol value on the stack, jumps to it from the
   *  tunnel; a frame that is no tunnel's raises the current engine's error
   *  (`PopTunnel`). */
  protected tunnelReturn(): void {
    const state = this._state;
    const value = state.PopEvaluationStack();
    const override = value instanceof SymbolValue ? value : null;
    if (!override && !(value instanceof Void)) {
      this.Error("Expected void if ->-> doesn't override target");
    }
    const callStack = state.callStack;
    const element = callStack.currentElement!;
    if (element.type == PushPopType.FunctionEvaluationFromGame) {
      state.position = null;
      state.didSafeExit = true;
      return;
    }
    if (element.type != PushPopType.Tunnel || !callStack.canPop) {
      let expected =
        element.type == PushPopType.Function
          ? "function return statement (return)"
          : "tunnel onwards statement (->->)";
      if (!callStack.canPop) {
        expected = "end of flow (-> END or choice)";
      }
      this.Error(
        "Found tunnel onwards statement (->->), when expected " + expected,
      );
    }
    const frame = state.PopCallStack();
    state.position = frame?.returnTo ?? null;
    state.blockStack = frame?.blocks ?? [];
    if (override) {
      const symbol = this.symbolIn(override.ref);
      if (symbol === undefined) {
        this.Error("Divert target not found.");
      }
      // The onward jump leaves from the caller the frame returned to, as
      // the current engine's divert after `PopTunnel` does.
      this.jumpTo(symbol, state.position?.sequence ?? null);
    }
  }

  /** The symbol the variable `name` holds as a symbol value, for a jump or a
   *  tunnel to it, or the current engine's error for anything else. */
  protected symbolOfVariable(name: string): number {
    const value = this._state.variablesState.GetVariableWithName(name);
    if (value == null) {
      this.Error(
        "Tried to divert using a target from a variable that could not be found (" +
          name +
          ")",
      );
    }
    if (value instanceof SymbolValue) {
      const symbol = this.symbolIn(value.ref);
      if (symbol === undefined) {
        this.Error("Divert target not found.");
      }
      return symbol;
    }
    let message =
      "Tried to divert to a target from a variable, but the variable (" +
      name +
      ") didn't contain a divert target, it ";
    if (value instanceof IntValue && value.value == 0) {
      message += "was empty/null (the value 0).";
    } else {
      message += "contained '" + value + "'.";
    }
    this.Error(message);
  }

  /** `CountOf`: pops a symbol value and pushes its visits, or the turns
   *  since its last visit, as the current engine's `ReadCount` and
   *  `TurnsSince` do. */
  protected countOf(turns: boolean): void {
    const state = this._state;
    const target = state.PopEvaluationStack();
    if (!(target instanceof SymbolValue)) {
      const note =
        target instanceof IntValue
          ? ". Did you accidentally pass a read count ('knot_name') instead of a target ('-> knot_name')?"
          : "";
      this.Error(
        "TURNS_SINCE / READ_COUNT expected a divert target (knot, stitch, label name), but saw " +
          target +
          note,
      );
    }
    const symbol = this.symbolIn(target.ref);
    let count: number;
    if (symbol !== undefined && this.root.kindOf(symbol) !== UNDEFINED_KIND) {
      const id = this.countId(symbol);
      count = turns ? state.TurnsSince(id) : state.VisitCount(id);
    } else {
      count = turns ? -1 : 0;
      this.Warning(
        "Failed to find container for " +
          (turns ? "TURNS_SINCE" : "READ_COUNT") +
          " lookup at " +
          target.ref.label,
      );
    }
    state.PushEvaluationStack(new IntValue(count));
  }

  /** `ShuffleIndex`: pops the element count and the sequence's index and
   *  pushes the arm the alternator `symbol` shuffles to, seeded from its
   *  symbol's name and the story seed (`sequenceShuffleIndex`). */
  protected shuffleIndex(symbol: number): void {
    const state = this._state;
    const elements = state.PopEvaluationStack();
    if (!(elements instanceof IntValue) || elements.value === null) {
      this.Error("expected number of elements in sequence for shuffle index");
    }
    const index = state.PopEvaluationStack();
    const count = index instanceof IntValue ? (index.value ?? 0) : 0;
    state.PushEvaluationStack(
      new IntValue(
        sequenceShuffleIndex(
          this.root.labelOf(symbol),
          count,
          elements.value,
          state.storySeed,
        ),
      ),
    );
  }

  /** Runs the program's declaration chunks, in the order the root gives,
   *  against the globals. An error stops the run, as it stops the current
   *  engine's `global decl` container, and is reported as a continue's. An
   *  initializer that calls a function steps into it, and a chunk's run ends
   *  when its own frame has run its last instruction. No decision pauses the
   *  run: the decisions a route forces are the story's. */
  protected runDeclarations(): void {
    const state = this._state;
    const pause = this.pauseBeforeEvaluatingConditions;
    this.pauseBeforeEvaluatingConditions = false;
    const depth = state.callStack.elements.length;
    for (const chunk of this.root.initialization) {
      const at = this.root.position(chunkId(chunk));
      if (!at) {
        // The root places every declaration chunk it lists. One it cannot
        // place stops the run as an initializer's error does, as `EnterBlock`
        // raises a body the root does not hold, rather than leaving its
        // globals unassigned.
        state.position = null;
        this.AddError(
          `The program has no place for declaration chunk ${chunkId(chunk)}.`,
        );
        break;
      }
      state.position = { sequence: at.sequence, entry: at.entry, offset: 0 };
      state.blockStack = [];
      // Whether the declaration's own frame stands past the chunk's code,
      // which a step that runs its last instruction leaves at the next
      // entry of the declaration sequence.
      const finished = (): boolean => {
        const p = state.position;
        return (
          p === null ||
          (state.callStack.elements.length <= depth &&
            (p.sequence !== at.sequence ||
              p.entry !== at.entry ||
              p.offset >= codeWords(chunk)))
        );
      };
      try {
        while (!finished()) {
          this.Step();
        }
        this.declarationsRun += 1;
      } catch (e) {
        if (!(e instanceof StoryException)) {
          throw e;
        }
        this.AddError(e.message, undefined, e.useEndLineNumber);
        break;
      }
      if (state.hasError) {
        break;
      }
    }
    this.pauseBeforeEvaluatingConditions = pause;
    state.position = null;
    state.blockStack = [];
    state.evaluationStack.length = 0;
    this.reportErrors();
  }

  /** Calls a state-aware builtin as the current engine's `RunStdLibFunction`
   *  does, with this story as the story it is given. */
  protected callStd(name: string, arity: number, discard: boolean): void {
    const entry = lookupStateAwareStdLib(name);
    if (!entry) {
      this.Error(`Unknown stdlib function '${name}'`);
    }
    const args: any[] = [];
    for (let i = 0; i < arity; i++) {
      args.unshift(this._state.PopEvaluationStack());
    }
    spreadCallArgs(args);
    const result = entry.fn(this as unknown as Story, args);
    if (discard) {
      return;
    }
    pushStdLibResult(this, result);
  }

  /** The script and lines of the instruction running, or of the last one
   *  that ran: the line table row that covers it, counted from its
   *  statement's first line or from the end of the statement's body it
   *  follows. The script is named as the compiler names it in debug
   *  metadata, by its file name without the extension. */
  protected sourceOfRunning():
    | { file: string; startLine: number; endLine: number }
    | undefined {
    const running = this._running;
    if (!running) {
      return undefined;
    }
    const { sequence, entry, offset } = running;
    const chunk = sequence.arrays.chunks[entry];
    if (!chunk) {
      return undefined;
    }
    const row = lineRowAt(chunk, offset);
    if (row < 0) {
      return undefined;
    }
    const anchor = lineRowField(chunk, row, 1);
    const base =
      anchor === ANCHOR_STATEMENT
        ? this.root.lineOf(sequence, entry)
        : this.root.blockEndLine(sequence, entry, anchor);
    return {
      file: debugFileName(sequence.uri) ?? "",
      startLine: base + lineRowField(chunk, row, 2),
      endLine: base + lineRowField(chunk, row, 4),
    };
  }

  /** The instruction the last step ran. */
  protected _running: RunningInstruction | null = null;

  /** The position a path names: a flow by its qualified name, the top-level
   *  content's flow as `""` or `"0"`, or the content a path's location starts
   *  at. A line can hold several statements (tags written after inline text)
   *  and several beats (a `>` break), which the location's column tells
   *  apart: of the statements that start on the line the statement holding
   *  the location starts on, the last one that starts at or before the
   *  location, and in it the last `LineStart` at or before the location, or
   *  the statement's start when none is (a continuation, which joins the beat
   *  before it, or tags). */
  protected placePath(
    path: string,
  ): { position: ProgramPosition; symbol?: number } | undefined {
    const name = path === "0" ? ROOT_FLOW_NAME : path;
    const symbol = this.root.table.symbolIds.get(name);
    const kind = symbol === undefined ? UNDEFINED_KIND : this.root.kindOf(symbol);
    // A flow, or a label, by its qualified name.
    if (
      symbol !== undefined &&
      kind !== UNDEFINED_KIND &&
      kind !== SymbolKind.Alternator
    ) {
      const place = this.root.place(symbol);
      if (place) {
        return { position: place, symbol };
      }
    }
    const position = this.placeLocation(path);
    return position ? { position } : undefined;
  }

  /** The position the content a path's location starts at. */
  protected placeLocation(path: string): ProgramPosition | undefined {
    const location = this._paths?.locate(path);
    if (!location) {
      return undefined;
    }
    const at = this.root.statementAt(location.uri, location.line);
    if (!at) {
      return undefined;
    }
    const sequence = at.sequence;
    const atOrBefore = (range: { startLine: number; startColumn: number } | null) =>
      range !== null &&
      (range.startLine < location.line ||
        (range.startLine === location.line && range.startColumn <= location.column));
    // The statements that start on the same line as the one holding the
    // location, which the line starts alone cannot order.
    const line = this.root.lineOf(sequence, at.entry);
    let first = at.entry;
    while (first > 0 && this.root.lineOf(sequence, first - 1) === line) {
      first -= 1;
    }
    let entry = first;
    for (let e = first + 1; e <= at.entry; e++) {
      if (atOrBefore(this._reader.rangeAt(sequence, e, 0))) {
        entry = e;
      }
    }
    const chunk = sequence.arrays.chunks[entry]!;
    let offset = 0;
    for (const instruction of this._reader.instructions(chunk)) {
      if (
        instruction.op === Op.LineStart &&
        atOrBefore(this._reader.rangeAt(sequence, entry, instruction.offset))
      ) {
        offset = instruction.offset;
      }
    }
    return { sequence, entry, offset };
  }
}

/** Whether `chunk` is a `label` statement's: its code the one `Visit` of the
 *  symbol it exports. */
const isLabelChunk = (chunk: StatementChunk | undefined): boolean =>
  !!chunk &&
  codeWords(chunk) === 2 &&
  opOf(chunk[HEADER_WORDS]!) === Op.Visit &&
  exportCount(chunk) === 1 &&
  exportSymbol(chunk, 0) === chunk[HEADER_WORDS + 1];

/** Whether `chunk` runs nothing and defines nothing: a declaration whose
 *  value the declaration sequence sets (`const`, `store`). */
const isEmptyChunk = (chunk: StatementChunk | undefined): boolean =>
  !!chunk && codeWords(chunk) === 0 && exportCount(chunk) === 0;

/** Whether two block stack entries name one block of one owner. */
const sameBlock = (a: BlockEntry, b: BlockEntry): boolean =>
  a.sequence.id === b.sequence.id && a.entry === b.entry && a.block === b.block;

/** The scopes `chunk`'s code opens before `offset`: its `BeginScope`s less
 *  its `EndScope`s, read once in order (docs/engine/binary-program.md,
 *  section 1). */
const scopesBefore = (chunk: StatementChunk, offset: number): number => {
  let scopes = 0;
  for (let at = 0; at < offset && at < codeWords(chunk); at += 2) {
    const op = opOf(chunk[HEADER_WORDS + at]!);
    if (op === Op.BeginScope) {
      scopes += 1;
    } else if (op === Op.EndScope) {
      scopes -= 1;
    }
  }
  return Math.max(0, scopes);
};

const constValue = (aux: number): InkObject => {
  switch (aux) {
    case ConstValue.Void:
      return new Void();
    case ConstValue.True:
      return new BoolValue(true);
    case ConstValue.False:
      return new BoolValue(false);
    default:
      return new NullValue();
  }
};
