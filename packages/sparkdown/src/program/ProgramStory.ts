import { debugFileName } from "../compiler/utils/debugFileName";
import { ControlCommand } from "../runtime/ControlCommand";
import { DebugMetadata } from "../runtime/DebugMetadata";
import { ErrorType, type RaisedError } from "../runtime/Error";
import {
  EXECUTION_WATCH_STEPS,
  executionWatch,
} from "../runtime/ExecutionWatch";
import { InkList } from "../runtime/InkList";
import { NativeFunctionCall } from "../runtime/NativeFunctionCall";
import { InkObject } from "../runtime/Object";
import { cleanOutputWhitespace } from "../runtime/outputWhitespace";
import { PushPopType } from "../runtime/PushPop";
import type { Simulator } from "../runtime/Simulator";
import { lookupStateAwareStdLib } from "../runtime/StdLib";
import { arrangeArgsFor, callNativeFunction, callValueAsFunction, callVariableTarget, captureString, captureTag, extractClosureTarget, indexValue, isFunctionReference, lookupMetamethod, normalizeLuauCallArgs, oneValue, openVariablePointer, packTuple, popLuauCondition, pushStdLibResult, readVariable, sequenceShuffleIndex, shortCircuitDecides, spreadCallArgs, storeIndex, tableFromPairs, tryInvokeStdLibMarkerValue, unpackTuple, type FunctionTarget } from "../runtime/evaluation";
import {
  StepLimitExceeded,
  StoryException,
} from "../runtime/StoryException";
import { StringBuilder } from "../runtime/StringBuilder";
import { Tag } from "../runtime/Tag";
import { asOrThrows } from "../runtime/TypeAssertion";
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
} from "../runtime/Value";
import { VariableAssignment } from "../runtime/VariableAssignment";
import { VariablesState } from "../runtime/VariablesState";
import { CallStack } from "../runtime/CallStack";
import type { ListDefinitionsOrigin } from "../runtime/ListDefinitionsOrigin";
import type { StructDefinitionTable } from "../runtime/StructDefinition";
import { Void } from "../runtime/Void";
import { BinaryProgramReader } from "./BinaryProgramReader";
import {
  BEAT_WAITED,
  checkSave,
  readSave,
  translateChoiceAddress,
  translatePositional,
  writeSave,
  type BeatRecord,
  type SaveHeader,
  type SaveReport,
} from "./ProgramSave";
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
  JUMP_ARGUMENTS,
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
  SET_INITIALIZE,
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
  readableSymbolLabel,
} from "./ProgramSymbols";
import {
  ProgramChoice,
  ProgramStoryState,
  blockStackOf,
  scopeDepthAt,
  type BlockEntry,
  type ProgramFrame,
  type ProgramPosition,
  type SuspendedLineEnd,
} from "./ProgramStoryState";
import {
  addressOf,
  chunkOfAddress,
  offsetOfAddress,
  ANCHOR_STATEMENT,
  BLOCK_FUNCTION,
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
  type ProgramChunk,
} from "./ProgramChunk";
import type { DebugFrame, StoryEngine, StoryErrorHandler } from "./StoryEngine";

/** The function a symbol names, as the call handlers the two engines share
 *  read it (`FunctionTarget`): where its entry code starts, and what its
 *  entry binds, which the leading `SetVar`s of that code say. */
/** What the entry code at `offset` of `chunk` binds: the `SetVar`s it starts
 *  with, the first of which binds the last parameter, and whether that one
 *  is a variadic flow's or function's `...`. */
const entryBindings = (
  chunk: ProgramChunk,
  offset: number,
): { bindings: number; variadic: boolean } => {
  let bindings = 0;
  let variadic = false;
  for (let at = offset; at < codeWords(chunk); at += 2) {
    const w0 = chunk[HEADER_WORDS + at]!;
    if (opOf(w0) !== Op.SetVar) {
      break;
    }
    if (bindings === 0) {
      variadic = (flagsOf(w0) & SET_VARARGS) !== 0;
    }
    bindings += 1;
  }
  return { bindings, variadic };
};

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

/**
 * The beats a game passed, which a rewind restores and a save writes
 * (docs/engine/binary-program.md, section 7): the image of each beat, with
 * its flags and the decisions taken at it, the newest last, at most `limit`
 * of them (`GameConfiguration.rewindBeats`). The engines of one game share
 * it, as they share their images, so a checkpoint's beat stays in it across
 * a compile.
 */
export class BeatHistory {
  readonly records: BeatRecord[] = [];
  /** Whether the newest record is the image of the beat a continue just
   *  ended, which the image the next continue starts from replaces (the
   *  same beat, with whatever the host wrote since). */
  provisional = false;
  /** The root the decisions' addresses are in: that of the engine that
   *  holds the history now, which translates them when it is handed on
   *  (`translateTo`). */
  root: ProgramRoot | null = null;

  constructor(public limit = 128) {}

  /** Puts the decisions' addresses in `root`, each translated through its
   *  saved form in the root they were in (`translateChoiceAddress`); a
   *  decision whose choice `root` no longer holds is forgotten, as a save
   *  would leave it out. Each record names the root its decisions are in
   *  (`BeatRecord.root`), which it keeps once the history no longer holds
   *  it, so that a checkpoint of its beat still reads them. */
  translateTo(root: ProgramRoot): void {
    const from = this.root;
    this.root = root;
    for (const record of this.records) {
      translateDecisions(record, root, from);
    }
  }

  get newest(): BeatRecord | undefined {
    return this.records[this.records.length - 1];
  }

  /** Adds the image of a beat, unless it is the newest's. */
  push(image: ProgramImage, flags: number, provisional = false): BeatRecord {
    const newest = this.newest;
    if (newest?.image === image) {
      this.provisional &&= provisional;
      return newest;
    }
    if (newest && this.provisional) {
      // The beat the last continue ended, as the next one starts from it.
      (newest as { image: ProgramImage }).image = image;
      image.beat = newest;
      this.provisional = provisional;
      return newest;
    }
    // The beat of an image the history no longer holds (evicted, or
    // forgotten by a rewind or a reset), taken again from that image as a
    // restore left it, keeps its flags and decisions (`ProgramImage.beat`).
    const was = image.beat as BeatRecord | undefined;
    const record: BeatRecord = {
      image,
      flags: flags | (was?.flags ?? 0),
      decisions: [...(was?.decisions ?? [])],
      ...(was?.root ? { root: was.root } : {}),
    };
    if (this.root) {
      translateDecisions(record, this.root, this.root);
    }
    image.beat = record;
    this.records.push(record);
    if (this.records.length > Math.max(1, this.limit)) {
      this.records.splice(0, this.records.length - Math.max(1, this.limit));
    }
    this.provisional = provisional;
    return record;
  }

  /** The record whose image is `image`, or nothing. */
  recordOf(image: ProgramImage): BeatRecord | undefined {
    for (let i = this.records.length - 1; i >= 0; i -= 1) {
      if (this.records[i]!.image === image) return this.records[i];
    }
    return undefined;
  }

  /** The records up to the one whose image is `image`, or nothing. */
  upTo(image: ProgramImage): BeatRecord[] | undefined {
    for (let i = this.records.length - 1; i >= 0; i -= 1) {
      if (this.records[i]!.image === image) return this.records.slice(0, i + 1);
    }
    return undefined;
  }

  /** Forgets the records after `image`, as a rewind to it does: the
   *  record of its beat and those before, the image the record's again when
   *  the next continue took the beat once more (`push`), or, for an image
   *  of no record (a checkpoint taken after a choice, or one of a
   *  playthrough a reset or another rewind left), the records taken before
   *  it. The records are one line of play, each taken after the one before
   *  (`ProgramImage.id` grows as images are taken), and a record a rewind or
   *  a reset forgets never comes back, so a record taken before the image
   *  is a beat that led to it; one taken after it is not, whatever line of
   *  play it belongs to. */
  truncateTo(image: ProgramImage): void {
    for (let i = this.records.length - 1; i >= 0; i -= 1) {
      const record = this.records[i]!;
      if (record.image === image || record === image.beat) {
        (record as { image: ProgramImage }).image = image;
        this.records.length = i + 1;
        this.provisional = false;
        return;
      }
    }
    let kept = 0;
    while (kept < this.records.length) {
      const taken = this.records[kept]!.image;
      if (taken.images !== image.images || taken.id >= image.id) break;
      kept += 1;
    }
    this.records.length = kept;
    this.provisional = false;
  }

  /** Gives the record of `was` the image `now`, the same beat taken
   *  again. */
  replaceImage(was: ProgramImage, now: ProgramImage): void {
    const record = this.recordOf(was);
    if (record) {
      (record as { image: ProgramImage }).image = now;
      now.beat = record;
    }
  }

  /** Puts `records` in place of the history, as a load seeds it. */
  replace(records: readonly BeatRecord[], provisional: boolean): void {
    this.records.length = 0;
    this.records.push(...records.slice(-Math.max(1, this.limit)));
    for (const record of this.records) {
      record.image.beat = record;
      if (this.root) record.root ??= this.root;
    }
    this.provisional = provisional;
  }
}

/** Puts `record`'s decisions in `root`, from the root they are in (the
 *  record's, or else `from`); a decision whose choice `root` no longer
 *  holds is forgotten. */
const translateDecisions = (record: BeatRecord, root: ProgramRoot, from: ProgramRoot | null): void => {
  const was = record.root ?? from;
  record.root = root;
  if (!was || was === root) {
    return;
  }
  const decisions = record.decisions.flatMap((address) => translateChoiceAddress(root, was, address) ?? []);
  record.decisions.length = 0;
  record.decisions.push(...decisions);
};

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
 * the value operations the two engines share (`runtime/evaluation.ts`),
 * native functions and operators through `NativeFunctionCall`, variables
 * through `VariablesState`, block statements whose bodies it enters and
 * leaves through a block stack, calls of functions in frames that return to
 * the instruction after the call, jumps to symbols that rebuild the block
 * stack where they land and count the flows they enter, tunnels in frames
 * that return onward, threads that fork the call stack, the visits and turns
 * of every counted symbol in typed arrays, decisions the route simulator can
 * force, and a continue that returns at its line's newline.
 *
 * It presents the members of the object engine's `Story` (deleted in #705) that a `Game` uses
 * to create a game from a compile, continue, read a beat's display
 * instructions, run a preview compile's program and evaluate a function
 * (`HasFunction`, `EvaluateFunction`), and the members the builtins read
 * (`CallLuauFunction`, `CallLuauFunctionProtected`, `CallStackTrace`, ...),
 * under the same names, and the choices a `choose` block raises
 * (`currentChoices`, `ChooseChoiceIndex`). What it does not present yet
 * belongs to later slices of #692: images and saves across compiles (#699),
 * addresses (#700) and the debugger (#702).
 *
 * Each reset gives the engine a call stack of its own (`CallStack.ForProgram`)
 * and a `VariablesState` over it with the story's lists and constants
 * (`ProgramRoot.tables`), as the object engine's state built them: the
 * globals hold this engine's variables, and the call stack this engine's
 * frames, whose scopes hold the temporaries and whose open upvalues close as
 * the object engine's did. `ResetState` runs the
 * program's declaration sequences against those globals. Engines built from
 * one root share its chunks and nothing they write.
 */
export class ProgramStory implements StoryEngine {
  collapseWhitespace = true;
  processEscapes = true;

  onError: StoryErrorHandler | null = null;
  onDidContinue: (() => void) | null = null;
  onMakeChoice: ((choice: ProgramChoice) => void) | null = null;
  onEvaluateCondition: ((value: boolean) => void) | null = null;
  /** Called with the address of each instruction as it runs
   *  (docs/engine/binary-program.md, section 9, The Story surface), when
   *  set: the game keeps the addresses a beat ran, as it keeps the paths the
   *  object engine's `onExecute` named. */
  onExecute: ((address: number) => void) | null = null;
  /** When set, each instruction's address is appended to it as it runs,
   *  the instructions of a Luau callback the step calls included: what a
   *  game reads after each step it takes to find a breakpoint's, with no
   *  call per step (#702). */
  executedLog: number[] | null = null;
  /** When set, the same addresses are appended to it in the continue whose
   *  beat shows what they ran: what a game reads to keep the addresses a
   *  beat ran. An instruction that runs while a line end waits is held
   *  until the line ends; when something shows first, the cut carries its
   *  step, and those addresses, to the next continue, which appends them
   *  as it starts (#1686). */
  beatLog: number[] | null = null;
  onChoosePathString: ((path: string, args: unknown[]) => void) | null = null;

  /** Formats the message the `error` builtin raises, as the object engine's
   *  `Story.errorMessageFormatter` did; it reads `currentDebugMetadata`. */
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
   *  before it (`captureBeat`), and the history of the beats it passes
   *  (`beats`), which a game that checkpoints its beats, saves or rewinds
   *  sets. */
  keepBeatImages = false;
  /** The beats the story passed, which a rewind restores and a save writes
   *  the last `saveHistory` of (docs/engine/binary-program.md, section 7). */
  readonly history: BeatHistory;
  /** How many beats a save holds (`GameConfiguration.saveHistory`). */
  saveHistory: number;
  /** The beat whose menu a choice was just taken at, until the next
   *  continue: a save then is that beat with the choice. */
  protected _chosenAt: BeatRecord | null = null;
  /** The address of the `Choice` taken there. */
  protected _chosenAddress = -1;
  /** The menu's beat and the choice taken at it, when the line the story
   *  last started began just after that choice, which a save taken while
   *  the line is in progress writes (`toSave`). */
  protected _lineChosenAt: { record: BeatRecord; address: number } | null = null;
  /** The record of the beat this engine's state is at, until the story
   *  moves on (a step, a jump, a reset, a load, a choice): after a restore,
   *  the restored beat (the history's newest record, or the record an image
   *  the history no longer holds keeps, `ProgramImage.beat`); after a
   *  continue that ended a beat, that beat. An image taken of the state
   *  then, however it was taken, is that beat (`adoptBeat`). An engine a
   *  history was handed to has none until it restores or ends a beat: the
   *  history's newest record is then another engine's state. */
  protected _currentBeat: BeatRecord | null = null;
  /** The `stepCount` `_currentBeat` was set at. */
  protected _currentAtStep = -1;

  constructor(
    readonly root: ProgramRoot,
    options: {
      images?: ProgramImages;
      history?: BeatHistory;
      saveHistory?: number;
      rewindBeats?: number;
    } = {},
  ) {
    this._reader = new BinaryProgramReader(root);
    this.history = options.history ?? new BeatHistory(options.rewindBeats ?? 128);
    if (options.rewindBeats !== undefined) {
      this.history.limit = options.rewindBeats;
    }
    // A history handed on by the engine of the program before names its
    // decisions in this root from now on. Its newest record is no longer the
    // beat a continue of this engine ended, which this engine's next
    // continue or save would take again (`BeatHistory.provisional`): this
    // engine stands at no beat of it until it restores one.
    this.history.translateTo(root);
    if (options.history) {
      this.history.provisional = false;
    }
    this.saveHistory = options.saveHistory ?? 16;
    this.images = options.images ?? new ProgramImages();
    this._tracker = new ImageTracker(this.images);
    // The first state, which leaves a history handed on by the engine of
    // the program before as it is.
    this.resetState();
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
   *  since a reset or a load. A route search takes one at each fork. It is
   *  no beat's image: the image of the current beat, which its history
   *  record, its flags and a save of it follow, is `captureBeat`'s. */
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
    if (!held) {
      // The image the beat's history record holds, when nothing moved the
      // state since; a keyframe of that state is the same beat, which takes
      // the record's place, or the beat a restored image's record was.
      const still = this.stillImage();
      const image = (!keyframe && still) || this.capture(keyframe);
      this.adoptBeat(image, still);
      // Just after a choice: the beat before its menu with the choice, which
      // a durable save of the image writes (`saveOfImage`), so that a load
      // raises the menu again and is unplaced when the choice is not
      // offered (section 7).
      if (this._chosenAt) {
        image.afterChoice = { menu: this._chosenAt.image, address: this._chosenAddress };
      }
      return image;
    }
    if (!keyframe) {
      return held;
    }
    // A keyframe of the beat before the menu: that beat is put in place to
    // be taken whole, and the state as it stands put back.
    const live = this.capture();
    this.restoreInPlace(held);
    const image = this.capture(true);
    this.restoreInPlace(live);
    this._state.beatImage = image;
    this.history.replaceImage(held, image);
    return image;
  }

  /** Restores an image in place, which this engine or the engine of an
   *  earlier program of the same game (`images`) took. A position that names
   *  a chunk or a sequence this engine's root no longer holds is translated
   *  through its saved form in the root it was taken in (section 8, Within a
   *  session), unless `translate` is false, as a route's resumption asks;
   *  when a position still cannot be placed, it returns false and changes
   *  nothing, so that the caller replays. The history keeps the beats that
   *  led to the image and forgets those after it (`BeatHistory.truncateTo`).
   *  An image taken just after a choice (`ProgramImage.afterChoice`) is the
   *  state after that choice again, which a save writes as the beat before
   *  its menu with the choice, as it does when the choice was just taken. */
  restore(image: ProgramImage, translate = true): boolean {
    if (!this.restoreInPlace(image, translate)) {
      return false;
    }
    // A rewind forgets the beats after the image.
    this.history.truncateTo(image);
    this._currentBeat = (image.beat as BeatRecord | undefined) ?? null;
    this._currentAtStep = this.stepCount;
    const after = image.afterChoice;
    if (after) {
      // The menu's record, which a keyframe taken of it since may hold
      // under another image (`captureBeat`), or one of its own when the
      // history no longer holds it; the choice's address in this root.
      const menu = after.menu;
      const chosen = this.choiceHere(image);
      this._chosenAt =
        this.history.records.find((record) => record.image === menu || record === menu.beat) ??
        this.recordFor(menu, chosen);
      this._chosenAddress = chosen ?? -1;
    } else {
      this._chosenAt = null;
    }
    return true;
  }

  // Restores an image without touching the history of beats.
  protected restoreInPlace(image: ProgramImage, translate = true): boolean {
    // As a load of a state's JSON, a restore runs between the steps of an
    // asynchronous continue, which a route search drives.
    this.enableImages();
    if (
      !restoreImage(
        this._state,
        this._tracker,
        this,
        image,
        translate ? this.translator : undefined,
      )
    ) {
      return false;
    }
    this.notMovedSince(image);
    this._stateIsPristine = false;
    this._state.beatImage = null;
    return true;
  }

  /** Places the positions of an image an engine of an earlier program of
   *  the same game took, whose chunks this engine's root no longer holds,
   *  through their saved form in the root they were taken in
   *  (docs/engine/binary-program.md, section 8, Within a session). */
  protected readonly translator = (image: ProgramImage) => {
    const engine = image.engine;
    if (!(engine instanceof ProgramStory) || engine.root === this.root) {
      return undefined;
    }
    return translatePositional(
      this._state,
      engine.root,
      image.positional,
      image.generation,
    );
  };

  /** Whether `restore` would place `image` in this engine's root: false
   *  for an image of another game's engines, or one that names a chunk or a
   *  sequence the root does not hold and its saved form cannot place, or,
   *  with `translate` false, that names one the root does not hold at all.
   *  Changes nothing. */
  canRestore(image: ProgramImage, translate = true): boolean {
    return (
      image.images === this.images &&
      (this._state.placePositional(image.positional) !== undefined ||
        (translate && this.translator(image) !== undefined))
    );
  }

  /** The beats the story passed, from the oldest, each with its image, its
   *  flags and the decisions taken at it (`BeatHistory`). */
  get beats(): readonly BeatRecord[] {
    return this.history.records;
  }

  /** Sets the flags of the current beat (`BEAT_WAITED`,
   *  `BEAT_REWIND_FLOOR`, `BEAT_DECISIONS_FIXED`), which its image and a save
   *  carry. */
  setBeatFlags(flags: number): void {
    // This engine's current beat (after a restore, the restored beat, which
    // the history may no longer hold), or at a menu, the beat before it;
    // never the history's newest record as such, which may be the beat
    // another engine ended.
    const held = this._state.beatImage;
    const current =
      this.currentBeat() ??
      (held ? (this.history.recordOf(held) ?? (held.beat as BeatRecord | undefined)) : undefined);
    if (current) {
      current.flags = flags;
    }
  }

  // The beat this engine's state is at (`_currentBeat`), while no step has
  // run since it was set: a step (the next continue's, or an asynchronous
  // continue's a restore came between) moves the story on from it.
  protected currentBeat(): BeatRecord | null {
    return this._currentBeat && this._currentAtStep === this.stepCount ? this._currentBeat : null;
  }

  // Makes `image`, taken of the state as it stands, the image of the beat
  // the state is at: the current beat (after a restore, the restored beat;
  // after a continue that ended a beat, that beat, which the host may have
  // written to since), and otherwise the beat of the image the state still
  // is (`still`), when nothing moved it. A recapture (a keyframe, after a
  // host's write, an image of another engine that this one cannot take a
  // delta on) is the same beat, which takes the place of that beat's image
  // when the beat is the history's newest, as the next continue would, so
  // that the next continue takes it once.
  protected adoptBeat(image: ProgramImage, still: ProgramImage | null): void {
    const beat = this.currentBeat() ?? (still?.beat as BeatRecord | undefined);
    if (!beat || image.beat === beat) {
      return;
    }
    image.beat = beat;
    if (this.history.newest === beat) {
      (beat as { image: ProgramImage }).image = image;
    }
  }

  /** The header of the last save `loadSave` read, or nothing. */
  loadedSaveHeader: SaveHeader | null = null;
  /** How the last save `loadSave` read was placed, or nothing. */
  loadedSaveReport: SaveReport | null = null;

  /**
   * The durable save of the current beat (docs/engine/binary-program.md,
   * sections 7 and 8): the last `saveHistory` beats of the history, the
   * current one newest, every position in the saved form, with a header
   * naming the format's version, the engine's and `gameVersion`, the game's
   * own (`GameConfiguration.version`). At a menu the newest beat is the beat
   * before the menu and holds none of the menu's choices, which needs
   * `keepBeatImages` set while the story ran; after a choice was taken it is
   * that beat with the choice, which a load takes again.
   */
  toSave(gameVersion = ""): string {
    const held = this._state.beatImage;
    if (held && this._asyncContinueActive) {
      // A line in progress, which a stop at a breakpoint or at the execution
      // step ceiling leaves, is no beat. With `keepBeatImages` set the line
      // started from the image of the beat before it, which the save is, and
      // the line is put back still in progress (`saveOf`); without it there
      // is no beat to write, and the guard below refuses (#1693). A line that
      // started just after a choice was taken is saved as a save before it
      // would be: the menu's beat with the choice, which a load takes again
      // only when the choice is still offered.
      this.IfInsideContinueWeCant("save");
      const chosen = this._lineChosenAt;
      if (chosen) {
        const records = this.history.upTo(chosen.record.image) ?? [chosen.record];
        const save = this.saveOf(records, chosen.address < 0 ? undefined : chosen.address, gameVersion);
        if (save) {
          return save;
        }
      }
      return this.saveOf(this.history.upTo(held) ?? [this.recordFor(held)], undefined, gameVersion)!;
    }
    this.IfAsyncWeCant("save");
    if (held) {
      return this.saveOf(this.history.upTo(held) ?? [this.recordFor(held)], undefined, gameVersion)!;
    }
    if (this._chosenAt) {
      // The menu's beat with the beats before it, or alone when a restore
      // put back an image whose menu the history no longer holds.
      const records = this.history.upTo(this._chosenAt.image) ?? [this._chosenAt];
      const save = this.saveOf(records, this._chosenAddress < 0 ? undefined : this._chosenAddress, gameVersion);
      if (save) {
        return save;
      }
    }
    if (!this.canContinue && this._state.currentChoices.length > 0) {
      throw new Error(
        "A save at a menu holds the beat before it, which the story keeps only while keepBeatImages is set.",
      );
    }
    const still = this.stillImage();
    const live = still ?? this.capture();
    this.adoptBeat(live, still);
    const records =
      this.history.upTo(live) ??
      (this.history.provisional && this.keepBeatImages
        ? (this.history.push(live, BEAT_WAITED, true), this.history.upTo(live)!)
        : [...this.history.records, this.recordFor(live)]);
    return this.saveOf(records, undefined, gameVersion)!;
  }

  // A record for an image that is no beat of the history: the flags and
  // decisions of the beat it was taken at, when the history held that beat
  // once (`ProgramImage.beat`, which the image keeps when the history
  // forgets it), its decisions put in this root, with `chosen`.
  protected recordFor(image: ProgramImage, chosen?: number): BeatRecord {
    const beat = image.beat as BeatRecord | undefined;
    const record: BeatRecord = { image, flags: beat?.flags ?? 0, decisions: [...(beat?.decisions ?? [])] };
    if (beat) {
      const engine = image.engine;
      translateDecisions(record, this.root, beat.root ?? (engine instanceof ProgramStory ? engine.root : this.root));
    }
    if (chosen !== undefined && !record.decisions.includes(chosen)) {
      record.decisions.push(chosen);
    }
    return record;
  }

  /** The durable save of an image this engine, or the engine of an earlier
   *  program of the same game, took (`toSave`): the image's beat alone, as a
   *  checkpoint's full save is, or with `withHistory` the beats of the
   *  history up to it; for an image taken just after a choice
   *  (`ProgramImage.afterChoice`), the beat before its menu with the choice,
   *  as `toSave` writes one. Each image is put in place to be written, and
   *  the state as it stands put back. Nothing, and nothing changed, when the
   *  image names a position this engine's root cannot place. */
  saveOfImage(image: ProgramImage, gameVersion = "", withHistory = false): string | null {
    // The image is written, not the state, so a line in progress, which a
    // stop at the execution step ceiling or at a breakpoint leaves, does not
    // stand in the way: an image holds that line's positional state as a
    // route search's does, and the line is put back still in progress
    // (`saveOf`) (#1693).
    this.IfInsideContinueWeCant("save");
    const after = image.afterChoice;
    const beat = after ? after.menu : image;
    const chosen = this.choiceHere(image);
    const record = this.history.recordOf(beat) ?? this.recordFor(beat, chosen);
    return this.saveOf(withHistory ? (this.history.upTo(beat) ?? [record]) : [record], chosen, gameVersion);
  }

  // The address in this root of the choice taken just before `image`
  // (`ProgramImage.afterChoice`), which the engine that took the image named
  // in its own root, translated as the image's positions are; nothing when
  // this root no longer holds the choice, which a save then leaves out, so
  // that a load raises the menu again.
  protected choiceHere(image: ProgramImage): number | undefined {
    const after = image.afterChoice;
    if (!after || after.address < 0) {
      return undefined;
    }
    const engine = image.engine;
    return translateChoiceAddress(
      this.root,
      engine instanceof ProgramStory ? engine.root : this.root,
      after.address,
    );
  }

  // Writes the last `saveHistory` of `records`, without the oldest this
  // engine can no longer restore, or nothing when it cannot restore the
  // newest.
  protected saveOf(
    records: readonly BeatRecord[],
    chosen: number | undefined,
    gameVersion: string,
  ): string | null {
    const last = records.slice(-Math.max(1, this.saveHistory));
    let first = last.length;
    while (first > 0 && this.canRestore(last[first - 1]!.image)) {
      first -= 1;
    }
    const beats = last.slice(first);
    if (beats.length === 0) {
      return null;
    }
    const held = this._state.beatImage;
    // The image the state is, when nothing moved it, which stays the image
    // the next continue takes the beat from, its beat's record with it.
    const live = this.stillImage() ?? this.capture();
    try {
      return writeSave(this._state, gameVersion, beats, chosen, (image) =>
        this.restoreInPlace(image),
      );
    } finally {
      this.restoreInPlace(live);
      this._state.beatImage = held;
    }
  }

  /**
   * Loads a durable save `toSave` wrote, into this engine's program, and
   * returns its header (docs/engine/binary-program.md, section 8). Each
   * position is placed by its saved form in the program as it is now, and
   * the load takes the newest beat whose frames are all placed exactly, or
   * else the newest placed at all, with the state that beat had; the beats
   * up to it become the story's history. A save taken after a choice was
   * made runs the continue that raises the menu again and takes the choice
   * its part matches, or stays at the menu when none does. A save none of
   * whose beats can be placed is refused (`SaveRefused`), naming the flow,
   * and the state is left as it was. A save of a newer format version is
   * refused, and one of an older version goes through its migration.
   * `loadedSaveReport` says how the save was placed.
   */
  loadSave(json: string): SaveHeader {
    if (this._recursiveContinueCount > 0) {
      throw new Error("Can't load a save from inside a Continue.");
    }
    // A save is placed before anything changes; one that fails past that,
    // on a malformed value, puts back the state as it stood, with a line in
    // progress still in progress. A load that succeeds ends the line.
    this.enableImages();
    const held = this._state.beatImage;
    const before = this.capture();
    const records: BeatRecord[] = [];
    let load: ReturnType<typeof readSave>;
    try {
      load = readSave(
        this._state,
        json,
        (symbol) => this.symbolValue(symbol),
        (flags, decisions) => {
          records.push({ image: this.capture(), flags, decisions });
        },
      );
    } catch (e) {
      this.restoreInPlace(before);
      this._state.beatImage = held;
      throw e;
    }
    this.CancelAsyncContinue();
    this._stateIsPristine = false;
    this._chosenAt = null;
    this._currentBeat = null;
    this.notMovedSince(records[records.length - 1]?.image ?? null);
    const report = load.report;
    if (load.chosen !== undefined && records.length > 0) {
      // The choice is recorded again as it is taken.
      const menu = records[records.length - 1]!;
      const index = menu.decisions.lastIndexOf(load.chosen);
      if (index >= 0) menu.decisions.splice(index, 1);
      this.history.replace(records, false);
      this.Continue();
      const choice = this._state.currentChoices.find(
        (c) => Number(c.sourcePath) === load.chosen,
      );
      if (choice) {
        this.ChooseChoice(choice);
        report.chosen = "taken";
      } else {
        this.restoreInPlace(menu.image);
        report.chosen = "unplaced";
        report.exact = false;
        report.warnings.push("The choice made after the saved beat is not offered by its menu now.");
      }
    } else {
      this.history.replace(records, true);
      // The loaded beat is this engine's.
      this._currentBeat = this.history.newest ?? null;
      this._currentAtStep = this.stepCount;
    }
    this.loadedSaveHeader = load.header;
    this.loadedSaveReport = report;
    return load.header;
  }

  /**
   * Loads an image this engine's root took in place of a load of the save
   * `saveOfImage` writes of it, without writing the save or reading it
   * (#1758): the state is the image's, a line in progress ends, and the
   * history holds the image's beat alone, with the flags and decisions a
   * save of it writes, under an image of its own, as a load captures each
   * beat it reads, so that the beats after it record nothing into the
   * image's own record. The state loaded is the image's, the state the
   * story stood in at that beat, where a load of the save holds the save's
   * reconstruction of it on the declarations' current run: a define's
   * properties other than `store` ones, and the tables the story shares,
   * follow the image (the maintainer's decision on #1758). Answers false,
   * with nothing changed, for an image taken just after a choice, which a
   * load takes again by raising the menu (`loadSave`), and for one that
   * names a chunk or a sequence this root does not hold as it is, which a
   * load places through its saved form: the caller loads its save instead.
   */
  loadImage(image: ProgramImage): boolean {
    if (this._recursiveContinueCount > 0) {
      throw new Error("Can't load a save from inside a Continue.");
    }
    const engine = image.engine;
    if (
      image.afterChoice ||
      !(engine instanceof ProgramStory) ||
      engine.root !== this.root ||
      !this.canRestore(image, false)
    ) {
      return false;
    }
    // The record a save of the image writes (`saveOfImage`).
    const beat = this.history.recordOf(image) ?? (image.beat as BeatRecord | undefined);
    const flags = beat?.flags ?? 0;
    const decisions = [...(beat?.decisions ?? [])];
    if (!this.restoreInPlace(image, false)) {
      return false;
    }
    this.CancelAsyncContinue();
    this._chosenAt = null;
    const loaded = this.capture();
    this.history.replace([{ image: loaded, flags, decisions }], true);
    // The loaded beat is this engine's.
    this._currentBeat = this.history.newest ?? null;
    this._currentAtStep = this.stepCount;
    return true;
  }

  /** Throws what `loadSave` would refuse a save for (`SaveRefused`): a
   *  format version this engine does not read, another engine's save, or a
   *  save none of whose beats this program can place. Changes nothing. */
  checkSave(json: string): void {
    checkSave(this._state, json);
  }

  // ------------------------------------------------------------- the surface

  get state(): ProgramStoryState {
    return this._state;
  }

  get variablesState(): VariablesState {
    return this._state.variablesState;
  }

  get listDefinitions(): ListDefinitionsOrigin | null {
    return this.root.tables?.listDefinitions ?? null;
  }

  get structDefinitions(): StructDefinitionTable {
    return this.root.tables?.structDefinitions ?? {};
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

  // A menu counts as something shown, as on the object engine's `Story`: a
  // `choose` block with no caption raises its choices from a continue that
  // returns no text and no display instruction (binary-program.md sections 4
  // and 7), and the game queues a beat only when a continue showed something.
  get continueShowedSomething(): boolean {
    return (
      Boolean(this.currentText) ||
      this.currentDisplayInstructions.length > 0 ||
      this.currentChoices.length > 0
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

  /** A fresh state: a call stack of the engine's own and its variables
   *  (`CallStack.ForProgram`, `ProgramRoot.tables`), with no global
   *  initialized, then the program's declaration chunks run in the order the
   *  object engine's `global decl` container initialized the globals in. */
  /** Resets the story to its initial state, a fresh playthrough, whose
   *  history of beats starts empty. */
  ResetState(): void {
    this.resetState();
    this.history.replace([], false);
  }

  protected resetState(): void {
    this.IfAsyncWeCant("ResetState");
    const reactiveDepsEnabled =
      this._state?.variablesState?.reactiveDepsEnabled ?? false;
    const callStack = CallStack.ForProgram();
    const variablesState = new VariablesState(callStack, this.listDefinitions);
    variablesState.constantNames = new Set(this.root.tables?.constantNames ?? []);
    variablesState.reactiveDepsEnabled = reactiveDepsEnabled;
    this._state = new ProgramStoryState(
      this.root,
      variablesState,
      (text) => this.CleanOutputWhitespace(text),
      () => {
        this._stateIsPristine = false;
      },
      callStack,
    );
    // A state loaded in place (`LoadJson`, a route search's port) stands
    // at no beat this engine took.
    this._state.onBeginLoad = () => {
      this._currentBeat = null;
    };
    this.runDeclarations();
    variablesState.SnapshotDefaultGlobals();
    // A global written from outside the story (`variablesState[name] = v`)
    // leaves the state no longer the one this reset built, as the deleted object
    // engine's `VariableStateDidChangeEvent` records (#1692). Registered after
    // the declarations run, whose own writes are part of the reset; the
    // `_stateIsPristine = true` below comes later still. Each reset gets a
    // fresh `VariablesState`, so the callbacks do not accumulate.
    variablesState.ObserveVariableChange(() => {
      this._stateIsPristine = false;
    });
    const start = this.root.flowNamed(ROOT_FLOW_NAME);
    this._state.position = start ? { sequence: start, entry: 0, offset: 0 } : null;
    if (this._imagesOn) {
      this.attachImages();
    }
    this._chosenAt = null;
    this._currentBeat = null;
    this._stateIsPristine = true;
  }

  ResetErrors(): void {
    this._state.ResetErrors();
  }

  ResetCallstack(): void {
    this.IfAsyncWeCant("ResetCallstack");
    this._stateIsPristine = false;
    this._stillImage = null;
    // The story ended: no longer the state just after a choice.
    this._chosenAt = null;
    this._currentBeat = null;
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
   *  content's flow is `""` or `"0"`), or of a label; a position in the
   *  source is chosen by its address (`ChooseAddress`). The host's arguments
   *  go on the stack as they are, for the entry of a flow that takes
   *  parameters to bind, as the object engine's `ChoosePathString` passed
   *  them to the knot it chose. */
  ChoosePathString(path: string, resetCallstack = true, args: any[] = []): void {
    this.IfAsyncWeCant("call ChoosePathString right now");
    if (this.onChoosePathString !== null) this.onChoosePathString(path, args);
    const target = this.placeName(path);
    if (!target) {
      throw new StoryException(`Path not found: '${path}'`);
    }
    this.choose(target, resetCallstack, args);
  }

  /** Moves to an address (`ProgramRoot.addressAt`), inside the blocks that
   *  hold it, with the scopes their owners have open there: the beat a line
   *  starts, which is where PLAY from the line starts and the route to a
   *  preview of it ends (docs/engine/binary-program.md, section 8). */
  ChooseAddress(address: number, resetCallstack = true): void {
    this.IfAsyncWeCant("call ChooseAddress right now");
    const at = Number.isInteger(address)
      ? this.root.position(chunkOfAddress(address))
      : undefined;
    const chunk = at?.sequence.arrays.chunks[at.entry];
    const offset = offsetOfAddress(address);
    if (!at || !chunk || offset >= Math.max(1, codeWords(chunk))) {
      throw new StoryException(`Address not found: ${address}`);
    }
    this.choose(
      { position: { sequence: at.sequence, entry: at.entry, offset } },
      resetCallstack,
    );
  }

  protected choose(
    target: { position: ProgramPosition; symbol?: number },
    resetCallstack: boolean,
    args: any[] = [],
  ): void {
    // The flows the choice enters are counted from the flow the last
    // instruction ran in, which a save keeps, or from none when the call
    // stack is reset, as the object engine's `ChoosePath` counted them from
    // its thread's previous pointer after the turn it started.
    const left = resetCallstack ? -1 : this._state.previousFlow;
    if (resetCallstack) {
      this.ResetCallstack();
    }
    // Changing direction drops the choices waiting (`SetChosenPath`), and
    // the state is no longer the one just after a choice.
    this._state.generatedChoices.length = 0;
    this._state.beatImage = null;
    this._stillImage = null;
    this._chosenAt = null;
    this._currentBeat = null;
    this._state.DiscardLineEnd();
    this.passArguments(args);
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
    // The decision, by the address of the choice's `Choice`, beside the beat
    // before the menu (docs/engine/binary-program.md, section 7).
    const held = this._state.beatImage;
    const record = held ? this.history.recordOf(held) : undefined;
    if (record) {
      record.decisions.push(Number(choice.sourcePath));
    }
    this._chosenAt = record ?? null;
    this._currentBeat = null;
    this._chosenAddress = Number(choice.sourcePath);
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
   *  default, as the object engine did when the flow could no longer
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
   *  as the object engine found a knot by name (`Story.HasFunction`). */
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
   *  text it writes against an output of its own, as the object engine's
   *  `Story.EvaluateFunction` did: its result is what the function returns,
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
    // enters from the scene, as the object engine's knot diverted to its
    // first stitch; the scene itself is not counted, as the object engine
    // counted no container a host's evaluation started in.
    const scene = found ? this.root.flow(found.ref.symbol) : undefined;
    if (scene && target.entry.sequence !== scene) {
      this.countEntered(target.entry.sequence, scene.flow);
    }
    this.passArguments(args);
    // A function takes the host's arguments as a call gives them
    // (`arrangeArgsFor`), and so does a scene that takes parameters, for
    // what its entry binds (`sceneTargetOf`); a scene that takes none takes
    // them as they are, as the object engine did.
    if (target.bindings > 0) {
      arrangeArgsFor(this, target, args?.length ?? 0);
    }

    // The host's evaluation runs no beat of the story: its continues take no
    // beat images and push no history records, and the beat the story
    // stood at stays its beat, as after a host's write.
    const beat = this.currentBeat();
    const held = state.beatImage;
    const keep = this.keepBeatImages;
    this.keepBeatImages = false;
    const stringOutput = new StringBuilder();
    try {
      while (this.canContinue) {
        stringOutput.Append(this.Continue());
      }
    } finally {
      this.keepBeatImages = keep;
    }
    const textOutput = stringOutput.toString();

    state.ResetOutput(outputStreamBefore);
    state.ResumeLineEnd(lineEnd);

    const result = this.completeFunctionEvaluation();
    state.beatImage = held;
    this._currentBeat = beat;
    this._currentAtStep = this.stepCount;
    return returnTextOutput ? { returned: result, output: textOutput } : result;
  }

  /**
   * Calls a function value from inside a step, as a builtin that takes a
   * function does (`table.sort`'s comparator, a metamethod, `gsub`'s
   * replacement), and returns what it left on the eval stack, as the deleted object
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
    } catch (e) {
      // The running instruction is restored to the caller's below, so an
      // error the callback raised keeps the address of the instruction that
      // raised it. An error from a callback nested inside this one already
      // carries its own.
      if (e instanceof StoryException && e.raisedAddress == null) {
        e.raisedAddress = this.runningAddress() ?? null;
      }
      throw e;
    } finally {
      this.resumeStep(suspended, false);
    }
  }

  /**
   * The protected form of `CallLuauFunction`, which `pcall` and `xpcall`
   * call, as the object engine's `Story.CallLuauFunctionProtected` did: an
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
   *  its flow, as the object engine gave a divert target to its knot
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

  /** The stack trace `debug.traceback` prints, as the object engine's call
   *  stack printed it: each call frame from the outermost, with the function
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
   *  top-level content, as the object engine's path of that container
   *  read); null for a frame with no position. */
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
      return readableSymbolLabel(this.root.labelOf(frame.symbol));
    }
    return this.flowName(position.sequence.flow);
  }

  /** The name a frame that runs no function shows: the name of the flow it
   *  stands in, `0` for the top-level content, as the object engine's path
   *  of that container read, and `global decl` for a declaration. An
   *  included script's top-level content runs in the top level's frame
   *  (`IncludeEntry`), so its flow shows `0` too. */
  flowName(flow: number): string {
    if (flow < 0) {
      return "global decl";
    }
    if (this.root.kindOf(flow) === SymbolKind.Root) {
      return "0";
    }
    const name = this.root.labelOf(flow);
    return name === ROOT_FLOW_NAME ? "0" : name;
  }

  /**
   * The frames view the debugger reads (docs/engine/binary-program.md,
   * section 9, The Story surface): the call frames of the thread whose
   * index is `threadIndex`, outermost first, or nothing for a thread the
   * call stack does not have. Each is named from the symbol of the function
   * or tunnel it runs, or, for the flow's own frame, from the flow it stands
   * in (`CallFramePath`), and stands at an address: the frame that runs at
   * the instruction that ran last, or -1 when none has since a reset or a
   * load (a suspended thread's at where it resumes), and a frame below
   * another at the call that pushed the one above, as the object engine's
   * elements named the pointers they last ran. Its call stack element holds
   * its temporaries.
   */
  debugFrames(threadIndex: number): DebugFrame[] | undefined {
    const state = this._state;
    const thread = state.callStack.ThreadWithIndex(threadIndex);
    if (!thread) {
      return undefined;
    }
    const current = thread === state.callStack.currentThread;
    const top = current ? state.position : state.resumeOf(thread);
    const elements = thread.callstack;
    const frames: DebugFrame[] = [];
    for (let i = 0; i < elements.length; i += 1) {
      const element = elements[i]!;
      const above = elements[i + 1];
      let at: ProgramPosition | null;
      let address = -1;
      if (above) {
        // The caller resumes after its call, which is the instruction
        // before the position it returns to.
        at = state.frameOf(above)?.returnTo ?? null;
        const chunk = at?.sequence.arrays.chunks[at.entry];
        if (at && chunk) {
          address = addressOf(chunkId(chunk), Math.max(0, at.offset - 2));
        }
      } else {
        at = top;
        if (current) {
          // Nothing has run since a reset or a load, which a save does not
          // keep the last instruction across, when it is -1.
          address = state.previousAddress;
        } else {
          const chunk = at?.sequence.arrays.chunks[at.entry];
          if (at && chunk) {
            address = addressOf(chunkId(chunk), at.offset);
          }
        }
      }
      const frame = state.frameOf(element);
      const symbol = frame ? frame.symbol : (at?.sequence.flow ?? -1);
      frames.push({
        type: element.type,
        symbol,
        name: frame
          ? readableSymbolLabel(this.root.labelOf(frame.symbol))
          : this.flowName(symbol),
        scope: frame ? this.root.labelOf(frame.symbol) : this.flowName(symbol),
        address,
        element,
      });
    }
    return frames;
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

  // Refuses what cannot run from inside a continue, such as a callback the
  // continue is running, where the state is mid-instruction; between the
  // steps of an asynchronous continue it can.
  protected IfInsideContinueWeCant(activityStr: string): void {
    if (this._recursiveContinueCount > 0) {
      throw new Error("Can't " + activityStr + " from inside a Continue.");
    }
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
      e.raisedAddress = cause.raisedAddress;
    }
    throw e;
  }

  Warning(message: string): void {
    this.AddError(message, true);
  }

  /** Records an error or warning at the instruction running, prefixed with
   *  its script and line as the object engine prefixed it
   *  (`Story.AddError`). An error a callback raised names the instruction
   *  that raised it (`StoryException.raisedAddress`) for where it was
   *  raised; the prefix names the instruction running, as the deleted object
   *  engine's names the content its pointer stands at. */
  AddError(
    message: string,
    isWarning = false,
    useEndLineNumber = false,
    raisedAddress: number | null = null,
  ): void {
    // The raised record keeps the text without the prefix, and no path: the
    // instruction running is a chunk's word, which no runtime path names. It
    // keeps that instruction's address, which `ForceEnd` below forgets
    // before the error is reported.
    const raised: RaisedError = { message, path: null };
    const address = raisedAddress ?? this.runningAddress();
    if (address !== undefined) {
      raised.address = address;
    }
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

  /** The address of the instruction running, or of the last one that ran,
   *  or undefined when none has. */
  protected runningAddress(): number | undefined {
    const running = this._running;
    const chunk = running?.sequence.arrays.chunks[running.entry];
    return running && chunk ? addressOf(chunkId(chunk), running.offset) : undefined;
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
  static addressOf(chunk: ProgramChunk, offset: number): string {
    return String(addressOf(chunkId(chunk), offset));
  }

  /** The address of the instruction that ran last, which a route step is
   *  known by and a beat's execution record holds, or -1 when none has run
   *  since a reset (docs/engine/binary-program.md, section 9, The Story
   *  surface, `previousAddress`). */
  get previousAddress(): number {
    return this._state.previousAddress;
  }

  /** The addresses the story will come back to, from the outermost thread
   *  in: where each thread a fork suspended resumes, where each frame of the
   *  current thread returns to, and the position, as the object engine's
   *  call stack named them by the pointer of each element. */
  stackAddresses(): number[] {
    return this._state.stackAddresses();
  }

  /** The address of the instruction that runs next, or -1 when the flow
   *  has run out. */
  get currentAddress(): number {
    const position = this._state.position;
    const chunk = position?.sequence.arrays.chunks[position.entry];
    return position && chunk ? addressOf(chunkId(chunk), position.offset) : -1;
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
        const still = this.stillImage();
        state.beatImage = still ?? this.capture();
        this.adoptBeat(state.beatImage, still);
        this.history.push(state.beatImage, 0);
        this._lineChosenAt = this._chosenAt
          ? { record: this._chosenAt, address: this._chosenAddress }
          : null;
        this._chosenAt = null;
      }
      if (this._recursiveContinueCount == 1) {
        // The story moves on from the beat a restore left.
        this._currentBeat = null;
      }
      state.didSafeExit = false;
      // The step the last continue cut off after its line ended starts this
      // one, with whether its own line still waits for its newline.
      const carried = state.TakeCarriedStep();
      state.ResetOutput(carried?.output ?? null);
      state.lineEndPending = carried?.lineEndPending ?? false;
      state.outputCut = null;
      // The carried step's instructions ran for this beat. What a continue
      // that did not end left held is dropped with it.
      state.TakeHeldAddresses();
      if (carried) this.logBeat(carried.addresses);
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
        this.AddError(
          e.message,
          undefined,
          e.useEndLineNumber,
          e.raisedAddress,
        );
        // The step that raised the error ran for the beat it ends.
        this.logBeat(state.TakeHeldAddresses());
        break;
      }
      if (this.pausedBeforeCondition !== null || this._asyncContinueActive) {
        break;
      }
    }

    state.CarryOutputPastCut();
    // A line end still waiting when the continue ends, as a caption's does
    // when its choices are raised, ends with this beat, and so does the
    // step a cut closed with no next continue to carry it to.
    if (outputStreamEndsInNewline || !this.canContinue) {
      this.logBeat(state.TakeHeldAddresses());
    }

    // A continue that ended at its newline, or with the flow ended and no
    // choice waiting, leaves the state as it stands as its beat's image; one
    // that ended with choices raised leaves the image of the beat before it.
    if (
      outputStreamEndsInNewline ||
      (!this.canContinue && state.currentChoices.length === 0)
    ) {
      state.beatImage = null;
    }
    const endedBeat =
      state.beatImage === null &&
      (outputStreamEndsInNewline || !this.canContinue);
    if (outputStreamEndsInNewline || !this.canContinue) {
      state.didSafeExit = false;
      if (this._recursiveContinueCount == 1) {
        state.variablesState.CompleteVariableObservation();
      }
      this._asyncContinueActive = false;
      if (this.onDidContinue !== null) this.onDidContinue();
    }
    // The beat the continue ended, which the next continue starts from.
    if (
      endedBeat &&
      this.keepBeatImages &&
      this._recursiveContinueCount == 1 &&
      this.pausedBeforeCondition === null
    ) {
      // A continue a restore came between the steps of, which ran no step
      // since, ended the restored beat itself.
      const ended = this.capture();
      this.adoptBeat(ended, null);
      // The beat this engine's state is at, until the story moves on.
      this._currentBeat = this.history.push(ended, BEAT_WAITED, true);
      this._currentAtStep = this.stepCount;
    }

    this._recursiveContinueCount--;
    this.reportErrors();
    // A route simulation takes the choice its route forces at the menu, as
    // the object engine did, asked by the address of the instruction that
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
      // the object engine's search asked by the path it stood at.
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
    const address = addressOf(chunkId(chunk), position.offset);
    state.previousAddress = address;
    if (this.onExecute !== null) this.onExecute(address);
    if (this.executedLog !== null) this.executedLog.push(address);
    if (state.holdsAddresses) {
      state.heldAddresses.push(address);
    } else if (this.beatLog !== null) {
      this.beatLog.push(address);
    }
    state.lineEndJoined = false;
    this.execute(position, chunk);
    // A line end that stopped waiting with nothing cut, as a join that
    // continues the line does, keeps what it held in this beat, the joining
    // instruction's own address with it, even when the joining line leaves
    // a line end waiting of its own. Inside a callback a held step calls,
    // the step's hold decides.
    if (
      state.heldAddresses.length > 0 &&
      state.outputCut === null &&
      !state.holdsInherited &&
      (state.lineEndJoined || !state.lineEndPending)
    ) {
      this.logBeat(state.TakeHeldAddresses());
    }
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

  /** Appends `addresses` to `beatLog`, when it is set. */
  protected logBeat(addresses: readonly number[]): void {
    const log = this.beatLog;
    if (log === null) return;
    for (const address of addresses) log.push(address);
  }

  /** The chunk the position is in, after moving past the end of each
   *  statement and each body the position has reached the end of, closing
   *  the pass scope of a body that runs in one (`BLOCK_PASS_SCOPE`); nothing
   *  when the flow has run out. */
  protected fetch(position: ProgramPosition): ProgramChunk | undefined {
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
  protected pausesAt(chunk: ProgramChunk, offset: number): boolean {
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
    chunk: ProgramChunk,
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
  protected execute(position: ProgramPosition, chunk: ProgramChunk): void {
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
        const table = tableFromPairs(between, 0);
        if (this._imagesOn && table instanceof ObjectValue) {
          // No image taken before it reaches it (`ImageTracker.made`).
          this._tracker.made(table);
        }
        state.PushEvaluationStack(table);
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
        // A function's body starts with its parameters bound: the eval
        // stack's height there is the frame's at every statement boundary
        // (docs/engine/binary-program.md, section 1), which a load that
        // places the frame after a statement cuts the stack to (section 8).
        if (blockFlags(chunk, arg) & BLOCK_FUNCTION && state.frame) {
          state.frame.evaluationStackHeightWhenPushed =
            state.evaluationStack.length;
        }
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
          if (!(flags & JUMP_ARGUMENTS)) {
            this.padVariadicFlow(arg);
          }
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
        if (!(flags & JUMP_ARGUMENTS)) {
          this.padVariadicFlow(arg);
        }
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
   *  expression, and otherwise as the object engine tested a conditional
   *  divert's condition. A decision's verdict is the route simulator's when
   *  it forces one, and the story reports every decision's verdict. */
  protected condition(
    chunk: ProgramChunk,
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

  /** A condition's truth as the object engine tested a conditional divert's
   *  (`Story.IsTruthy`): a function value is refused, named as the object
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
   *  or nothing for an anonymous symbol, and prints as the object engine
   *  printed the divert target of the function's container. */
  protected symbolValue(symbol: number): SymbolValue {
    let value = this._symbols.get(symbol);
    if (!value) {
      const table = this.root.table;
      value = new SymbolValue(
        new SymbolRef(
          symbol,
          this.root.generation,
          isAnonymousSymbol(table, symbol) ? null : table.symbols[symbol]!,
          readableSymbolLabel(this.root.labelOf(symbol)),
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
        const { bindings, variadic } = entryBindings(
          entry.sequence.arrays.chunks[entry.entry]!,
          entry.offset,
        );
        target = new SymbolTarget(symbol, entry, variadic, bindings);
      }
      this._targets.set(symbol, target);
    }
    return target;
  }

  /** The scene `symbol` names, run from the start of its flow, as a host
   *  evaluates it as a function; or null when `symbol` names no scene. A
   *  scene that takes parameters binds them at its start (`FlowEntry`), and
   *  the target says what its entry binds, so the host's arguments are
   *  arranged for them. */
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
    const first = flow.arrays.chunks[0];
    const { bindings, variadic } =
      branch || !first ? { bindings: 0, variadic: false } : entryBindings(first, 0);
    return new SymbolTarget(
      symbol,
      branch ?? { sequence: flow, entry: 0, offset: 0 },
      variadic,
      bindings,
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
   *  object engine's error. */
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
    this.dropResultOf(frame);
  }

  /** For a frame whose caller a load placed after the statement the call
   *  was made in (`ProgramFrame.dropResult`), drops what it returned and
   *  what its caller had on the eval stack: the caller resumes at a
   *  statement boundary, at its own height. */
  protected dropResultOf(frame: ProgramFrame | undefined): void {
    if (!frame?.dropResult) {
      return;
    }
    const state = this._state;
    const height = state.callStack.currentElement?.evaluationStackHeightWhenPushed ?? 0;
    if (state.evaluationStack.length > height) {
      state.evaluationStack.length = height;
    }
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
      lineEnd: state.SuspendLineEnd(true),
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
    const mask = SET_DECLARE | SET_GLOBAL | SET_VARARGS | SET_INITIALIZE;
    const key = name * 16 + (flags & mask);
    let assignment = this._assignments.get(key);
    if (!assignment) {
      assignment = new VariableAssignment(
        this.root.table.strings[name]!,
        (flags & SET_DECLARE) !== 0,
        (flags & SET_VARARGS) !== 0,
        (flags & SET_INITIALIZE) !== 0,
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
      const scopes = scopeDepthAt(this.root, target, blocks);
      // The scopes past the shared blocks are opened. Every count is exact,
      // inside a `choose` block's entries and bodies too (section 4), so the
      // frame holds the shared blocks' scopes and keeps their bindings.
      for (let open = kept; open < scopes; open += 1) {
        frame.PushScope();
      }
    }
  }

  /** `JumpSym`: moves to where `symbol` is defined, counting the flows the
   *  jump enters from the position it left, or raises the object engine's
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

  /** A divert that passes no arguments to a scene or a branch whose last
   *  parameter is `...` gives it nil for each fixed parameter and an empty
   *  `...`, as the object engine's divert pushed a `PackTuple(0)` for a
   *  variadic target, whether it wrote arguments or not. The divert's chunk
   *  reads no fact about its target, so that it stays the same while the
   *  target disappears and comes back (docs/engine/binary-program.md,
   *  section 2), and the flow's entry says what it binds: the `SetVar`s its
   *  first chunk starts with, the first of which binds the last
   *  parameter. */
  protected padVariadicFlow(symbol: number): void {
    const kind = this.root.kindOf(symbol);
    if (kind !== SymbolKind.Scene && kind !== SymbolKind.Branch) {
      return;
    }
    const place = this.root.place(symbol);
    const chunk = place?.sequence.arrays.chunks[0];
    if (!place || place.entry !== 0 || place.offset !== 0 || !chunk) {
      return;
    }
    const { bindings, variadic } = entryBindings(chunk, 0);
    if (!variadic) {
      return;
    }
    for (let p = 1; p < bindings; p += 1) {
      this._state.PushEvaluationStack(new NullValue());
    }
    packTuple(this, 0);
  }

  /** A jump to a label counts too the labels written right before it with
   *  nothing between, as the object engine's did: its weave nested a label
   *  as the first content of the label before it, and a divert counts each
   *  label container it enters at its start
   *  (`Story.VisitChangedContainersDueToDivert`). A statement with no code
   *  and no export (`const`, `store`) is nothing between: the object engine
   *  made no runtime object of it, so its weave nests the labels around it
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
   *  branch when it is entered, as the object engine's knot diverted to its
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
    // The tunnel's frame stands at the height the stack has once its
    // flow's entry has bound the arguments the call pushed for it.
    const first = place.entry === 0 ? place.sequence.arrays.chunks[0] : undefined;
    const bound =
      first && place.offset === 0 && this.root.flow(symbol) === place.sequence
        ? entryBindings(first, 0).bindings
        : 0;
    state.PushFrame(
      PushPopType.Tunnel,
      {
        returnTo: state.position,
        blocks: state.blockStack,
        symbol,
      },
      Math.max(0, state.evaluationStack.length - bound),
    );
    this.land(place, []);
    this.countEntered(place.sequence, left?.flow ?? -1);
    this.countLabelsAbove(place);
    this.enterStart(symbol, place.sequence);
  }

  /** `TunnelReturn`: pops a tunnel frame and resumes its caller after the
   *  tunnel call, or with a symbol value on the stack, jumps to it from the
   *  tunnel; a frame that is no tunnel's raises the object engine's error
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
    this.dropResultOf(frame);
    if (override) {
      const symbol = this.symbolIn(override.ref);
      if (symbol === undefined) {
        this.Error("Divert target not found.");
      }
      // The onward jump leaves from the caller the frame returned to, as
      // the object engine's divert after `PopTunnel` did.
      this.jumpTo(symbol, state.position?.sequence ?? null);
    }
  }

  /** The symbol the variable `name` holds as a symbol value, for a jump or a
   *  tunnel to it, or the object engine's error for anything else. */
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
   *  since its last visit, as the object engine's `ReadCount` and
   *  `TurnsSince` did. */
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
   *  against the globals. An error stops the run, as it stops the deleted object
   *  engine's `global decl` container, and is reported as a continue's. An
   *  initializer that calls a function steps into it, and a chunk's run ends
   *  when its own frame has run its last instruction. No decision pauses the
   *  run: the decisions a route forces are the story's. */
  protected runDeclarations(): void {
    const state = this._state;
    const pause = this.pauseBeforeEvaluatingConditions;
    this.pauseBeforeEvaluatingConditions = false;
    // The declarations run no story: the game hears none of their
    // instructions, as the object engine's `global decl` container was
    // none of the game's executed paths.
    const onExecute = this.onExecute;
    this.onExecute = null;
    const executedLog = this.executedLog;
    this.executedLog = null;
    const beatLog = this.beatLog;
    this.beatLog = null;
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
        this.AddError(
          e.message,
          undefined,
          e.useEndLineNumber,
          e.raisedAddress,
        );
        break;
      }
      if (state.hasError) {
        break;
      }
    }
    this.pauseBeforeEvaluatingConditions = pause;
    this.onExecute = onExecute;
    this.executedLog = executedLog;
    this.beatLog = beatLog;
    state.position = null;
    state.blockStack = [];
    state.previousAddress = -1;
    state.evaluationStack.length = 0;
    this.reportErrors();
  }

  /** Calls a state-aware builtin as the object engine's `RunStdLibFunction`
   *  did, with this story as the story it is given. */
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
    const result = entry.fn(this, args);
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

  /** The start of the flow or label a qualified name names, the top-level
   *  content's flow as `""` or `"0"`; a position in the source is chosen
   *  by its address (`ChooseAddress`). */
  protected placeName(
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
    return undefined;
  }
}

/** Whether `chunk` is a `label` statement's: its code the one `Visit` of the
 *  symbol it exports. */
const isLabelChunk = (chunk: ProgramChunk | undefined): boolean =>
  !!chunk &&
  codeWords(chunk) === 2 &&
  opOf(chunk[HEADER_WORDS]!) === Op.Visit &&
  exportCount(chunk) === 1 &&
  exportSymbol(chunk, 0) === chunk[HEADER_WORDS + 1];

/** Whether `chunk` runs nothing and defines nothing: a declaration whose
 *  value the declaration sequence sets (`const`, `store`). */
const isEmptyChunk = (chunk: ProgramChunk | undefined): boolean =>
  !!chunk && codeWords(chunk) === 0 && exportCount(chunk) === 0;

/** Whether two block stack entries name one block of one owner. */
const sameBlock = (a: BlockEntry, b: BlockEntry): boolean =>
  a.sequence.id === b.sequence.id && a.entry === b.entry && a.block === b.block;

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
