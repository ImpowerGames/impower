import { debugFileName } from "../compiler/utils/debugFileName";
import { ControlCommand } from "../runtime/ControlCommand";
import { DebugMetadata } from "../runtime/DebugMetadata";
import { ErrorType, type RaisedError } from "../runtime/Error";
import {
  EXECUTION_WATCH_STEPS,
  executionWatch,
} from "../runtime/ExecutionWatch";
import { NativeFunctionCall } from "../runtime/NativeFunctionCall";
import { storyDraws } from "../runtime/StoryRandom";
import { InkObject } from "../runtime/Object";
import { cleanOutputWhitespace } from "../runtime/outputWhitespace";
import { PushPopType } from "../runtime/PushPop";
import type { Simulator } from "../runtime/Simulator";
import type { ProgramAddress } from "../compiler/types/ProgramAddress";
import {
  firstMissingStdLibArg,
  lookupStateAwareStdLib,
  luauTypeOf,
} from "../runtime/StdLib";
import { arrangeArgsFor, callNativeFunction, callValueAsFunction, callVariableTarget, captureString, captureTag, extractClosureTarget, indexValue, isFunctionReference, lookupMetamethod, normalizeLuauCallArgs, oneValue, openVariablePointer, packTuple, popLuauCondition, pushStdLibResult, keepLegacyRootBinding, readVariable, rootGlobalPointer, rootSlotPointer, sequenceShuffleIndex, shortCircuitDecides, spreadCallArgs, storeIndex, tableFromPairs, tryInvokeStdLibMarkerValue, unpackTuple, type FunctionTarget } from "../runtime/evaluation";
import {
  StepLimitExceeded,
  StoryException,
  luauRuntimeError,
} from "../runtime/StoryException";
import { StringBuilder } from "../runtime/StringBuilder";
import { Tag } from "../runtime/Tag";
import { asOrThrows } from "../runtime/TypeAssertion";
import {
  AbstractValue,
  BoolValue,
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
  functionText,
} from "../runtime/Value";
import { VariableAssignment } from "../runtime/VariableAssignment";
import {
  type DeclaredGlobals,
  VariablesState,
} from "../runtime/VariablesState";
import { CallStack } from "../runtime/CallStack";
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
  CALL_METHOD,
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
  NATIVE_CALL_ARGS,
  NUM_FLOAT,
  Op,
  SET_DECLARE,
  ROOT_GLOBAL,
  ROOT_SLOT,
  SET_ROOT_SLOTTED,
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
  START_FLOW_NAME,
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
  flowScopesOf,
  flowSequenceOf,
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

const OPERATOR_NATIVES = new Set([
  NativeFunctionCall.Add,
  NativeFunctionCall.Subtract,
  NativeFunctionCall.Divide,
  NativeFunctionCall.Multiply,
  NativeFunctionCall.Mod,
  NativeFunctionCall.Negate,
  NativeFunctionCall.Equal,
  NativeFunctionCall.Greater,
  NativeFunctionCall.Less,
  NativeFunctionCall.GreaterThanOrEquals,
  NativeFunctionCall.LessThanOrEquals,
  NativeFunctionCall.NotEquals,
  NativeFunctionCall.Not,
  NativeFunctionCall.And,
  NativeFunctionCall.Or,
  NativeFunctionCall.LuauTruthy,
  NativeFunctionCall.Concat,
  NativeFunctionCall.Length,
]);

const TEXT_BUILTINS = new Set([
  "display",
  "__unjoined",
  "plural.category",
  "__def",
  "__defs",
]);

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

interface RunningInstruction {
  sequence: SequenceRow;
  entry: number;
  offset: number;
}

export class BeatHistory {
  readonly records: BeatRecord[] = [];
  provisional = false;
  root: ProgramRoot | null = null;

  constructor(public limit = 128) {}

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

  push(image: ProgramImage, flags: number, provisional = false): BeatRecord {
    const newest = this.newest;
    if (newest?.image === image) {
      this.provisional &&= provisional;
      return newest;
    }
    if (newest && this.provisional) {
      (newest as { image: ProgramImage }).image = image;
      image.beat = newest;
      this.provisional = provisional;
      return newest;
    }
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

  recordOf(image: ProgramImage): BeatRecord | undefined {
    for (let i = this.records.length - 1; i >= 0; i -= 1) {
      if (this.records[i]!.image === image) return this.records[i];
    }
    return undefined;
  }

  upTo(image: ProgramImage): BeatRecord[] | undefined {
    for (let i = this.records.length - 1; i >= 0; i -= 1) {
      if (this.records[i]!.image === image) return this.records.slice(0, i + 1);
    }
    return undefined;
  }

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

  replaceImage(was: ProgramImage, now: ProgramImage): void {
    const record = this.recordOf(was);
    if (record) {
      (record as { image: ProgramImage }).image = now;
      now.beat = record;
    }
  }

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

export type DeclarationIssueListener = (
  declarationChunk: number,
  isWarning: boolean,
  globalIndex: number,
) => void;

export interface CarriedDeclarations {
  readonly declared: DeclaredGlobals;
  readonly globals: ReadonlyMap<string, InkObject>;
}

export type StoryEnding = "fin" | "out" | "error";

export class ProgramStory implements StoryEngine {
  collapseWhitespace = true;
  processEscapes = true;

  onError: StoryErrorHandler | null = null;
  onDidContinue: (() => void) | null = null;
  onMakeChoice: ((choice: ProgramChoice) => void) | null = null;
  onEvaluateCondition: ((value: boolean) => void) | null = null;
  onExecute: ((address: number) => void) | null = null;
  executedLog: number[] | null = null;
  beatLog: number[] | null = null;
  onChoosePathString: ((path: string, args: unknown[]) => void) | null = null;

  errorMessageFormatter?: (story: any, message: string) => string;

  errorCalledByBuiltin = false;

  simulator: Simulator | null = null;
  pauseBeforeEvaluatingConditions = false;
  pausedBeforeCondition: ProgramAddress | null = null;
  pausedConditionValue: boolean | null = null;
  get pausedJumpValue(): boolean | null {
    const position = this._state.position;
    if (this.pausedBeforeCondition === null || !position) {
      return null;
    }
    const chunk = this.fetch(position);
    const w0 = chunk?.[HEADER_WORDS + position.offset];
    if (w0 === undefined || opOf(w0) !== Op.JumpIfFalse || flagsOf(w0) & JUMP_LUAU) {
      return null;
    }
    const value = this._state.evaluationStack.at(-1);
    return value instanceof Value && !(value instanceof SymbolValue)
      ? value.isTruthy
      : null;
  }

  stepCount = 0;
  stepLimit: number | null = null;
  declarationsRun = 0;
  protected _declarationsCarried = false;
  protected _declarationsClean = false;
  protected _onDeclarationIssue?: DeclarationIssueListener;
  protected _declarationRunning: number | null = null;
  protected _declarationDepth = 0;
  protected _declarationGlobals = 0;

  protected _state!: ProgramStoryState;
  protected _reader: BinaryProgramReader;
  protected _strings: StringValue[] = [];
  protected _symbols = new Map<number, SymbolValue>();
  protected _targets = new Map<number, SymbolTarget | null>();
  protected _natives = new Map<number, NativeFunctionCall>();

  callsMade = 0;
  protected _assignments = new Map<number, VariableAssignment>();
  protected _asyncContinueActive = false;
  protected _recursiveContinueCount = 0;
  protected _stateIsPristine = false;

  readonly images: ProgramImages;
  protected _tracker: ImageTracker;
  protected _imagesOn = false;
  keepBeatImages = false;
  readonly history: BeatHistory;
  saveHistory: number;
  protected _chosenAt: BeatRecord | null = null;
  protected _chosenAddress = -1;
  protected _lineChosenAt: { record: BeatRecord; address: number } | null = null;
  protected _currentBeat: BeatRecord | null = null;
  protected _currentAtStep = -1;

  constructor(
    readonly root: ProgramRoot,
    options: {
      images?: ProgramImages;
      history?: BeatHistory;
      saveHistory?: number;
      rewindBeats?: number;
      declarations?: CarriedDeclarations;
      onDeclarationIssue?: DeclarationIssueListener;
    } = {},
  ) {
    this._onDeclarationIssue = options.onDeclarationIssue;
    this._reader = new BinaryProgramReader(root);
    this.history = options.history ?? new BeatHistory(options.rewindBeats ?? 128);
    if (options.rewindBeats !== undefined) {
      this.history.limit = options.rewindBeats;
    }
    this.history.translateTo(root);
    if (options.history) {
      this.history.provisional = false;
    }
    this.saveHistory = options.saveHistory ?? 16;
    this.images = options.images ?? new ProgramImages();
    this._tracker = new ImageTracker(this.images);
    this.resetState(options.declarations);
  }

  declarationsFor(root: ProgramRoot): CarriedDeclarations | null {
    const before = this.root;
    const variables = this._state.variablesState;
    if (
      !this._declarationsClean ||
      root.generation !== before.generation ||
      !sameChunks(before.initialization, root.initialization) ||
      !sameNames(before.tables?.constantNames, root.tables?.constantNames)
    ) {
      return null;
    }
    if (!variables.ConstantsAsDeclared) {
      return null;
    }
    return { declared: variables.Declared, globals: variables.globalEntries };
  }

  protected ownDeclarations(): void {
    if (!this._declarationsCarried) {
      return;
    }
    const run = new ProgramStory(this.root);
    this._state.variablesState.AdoptDeclared(run.variablesState.Declared);
    this._declarationsCarried = false;
  }

  get declarationsCarried(): boolean {
    return this._declarationsCarried;
  }

  enableImages(): void {
    if (!this._imagesOn) {
      this._imagesOn = true;
      this.attachImages();
    }
  }

  protected attachImages(): void {
    const state = this._state;
    state.images = this._tracker;
    state.variablesState.imageBarrier = this._tracker;
    state.callStack.cellBarrier = this._tracker.cell;
    this._tracker.reset(null);
  }

  capture(keyframe = false): ProgramImage {
    this.enableImages();
    const image = captureImage(this._state, this._tracker, this, keyframe);
    this.notMovedSince(image);
    return image;
  }

  protected _stillImage: ProgramImage | null = null;
  protected _stillAtStep = -1;

  protected notMovedSince(image: ProgramImage | null): void {
    this._stillImage = image;
    this._stillAtStep = this.stepCount;
  }

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

  captureBeat(keyframe = false): ProgramImage {
    const held = this._state.beatImage;
    if (!held) {
      const still = this.stillImage();
      const image = (!keyframe && still) || this.capture(keyframe);
      this.adoptBeat(image, still);
      if (this._chosenAt) {
        image.afterChoice = { menu: this._chosenAt.image, address: this._chosenAddress };
      }
      return image;
    }
    if (!keyframe) {
      return held;
    }
    const live = this.capture();
    this.restoreInPlace(held);
    const image = this.capture(true);
    this.restoreInPlace(live);
    this._state.beatImage = image;
    this.history.replaceImage(held, image);
    return image;
  }

  restore(image: ProgramImage, translate = true): boolean {
    if (!this.restoreInPlace(image, translate)) {
      return false;
    }
    this.history.truncateTo(image);
    this._currentBeat = (image.beat as BeatRecord | undefined) ?? null;
    this._currentAtStep = this.stepCount;
    const after = image.afterChoice;
    if (after) {
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

  protected restoreInPlace(image: ProgramImage, translate = true): boolean {
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

  canRestore(image: ProgramImage, translate = true): boolean {
    return (
      image.images === this.images &&
      (this._state.placePositional(image.positional) !== undefined ||
        (translate && this.translator(image) !== undefined))
    );
  }

  get beats(): readonly BeatRecord[] {
    return this.history.records;
  }

  setBeatFlags(flags: number): void {
    const held = this._state.beatImage;
    const current =
      this.currentBeat() ??
      (held ? (this.history.recordOf(held) ?? (held.beat as BeatRecord | undefined)) : undefined);
    if (current) {
      current.flags = flags;
    }
  }

  protected currentBeat(): BeatRecord | null {
    return this._currentBeat && this._currentAtStep === this.stepCount ? this._currentBeat : null;
  }

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

  loadedSaveHeader: SaveHeader | null = null;
  loadedSaveReport: SaveReport | null = null;

  toSave(gameVersion = ""): string {
    const held = this._state.beatImage;
    if (held && this._asyncContinueActive) {
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

  saveOfImage(image: ProgramImage, gameVersion = "", withHistory = false): string | null {
    this.IfInsideContinueWeCant("save");
    const after = image.afterChoice;
    const beat = after ? after.menu : image;
    const chosen = this.choiceHere(image);
    const record = this.history.recordOf(beat) ?? this.recordFor(beat, chosen);
    return this.saveOf(withHistory ? (this.history.upTo(beat) ?? [record]) : [record], chosen, gameVersion);
  }

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

  loadSave(json: string): SaveHeader {
    if (this._recursiveContinueCount > 0) {
      throw new Error("Can't load a save from inside a Continue.");
    }
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
      this._currentBeat = this.history.newest ?? null;
      this._currentAtStep = this.stepCount;
    }
    this.loadedSaveHeader = load.header;
    this.loadedSaveReport = report;
    return load.header;
  }

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
    const beat = this.history.recordOf(image) ?? this.recordFor(image);
    const flags = beat.flags;
    const decisions = [...beat.decisions];
    if (!this.restoreInPlace(image, false)) {
      return false;
    }
    this.CancelAsyncContinue();
    this._chosenAt = null;
    const loaded = this.capture();
    this.history.replace([{ image: loaded, flags, decisions }], true);
    this._currentBeat = this.history.newest ?? null;
    this._currentAtStep = this.stepCount;
    return true;
  }

  checkSave(json: string): void {
    checkSave(this._state, json);
  }

  get state(): ProgramStoryState {
    return this._state;
  }

  get variablesState(): VariablesState {
    return this._state.variablesState;
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

  ResetState(): void {
    this.resetState();
    this.history.replace([], false);
  }

  protected resetState(carried?: CarriedDeclarations): void {
    this.IfAsyncWeCant("ResetState");
    const reactiveDepsEnabled =
      this._state?.variablesState?.reactiveDepsEnabled ?? false;
    const callStack = CallStack.ForProgram();
    const variablesState = new VariablesState(callStack);
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
    this.ending = null;
    this._state.onBeginLoad = () => {
      this._currentBeat = null;
      this.ending = null;
      this.ownDeclarations();
      this._state.variablesState.ConstantsMayHaveChanged();
    };
    if (carried) {
      variablesState.AdoptDeclared(carried.declared);
      variablesState.RestoreGlobals(carried.globals);
      this._declarationsCarried = true;
      this._declarationsClean = true;
    } else {
      this.runDeclarations();
      variablesState.SnapshotDefaultGlobals();
      this._declarationsCarried = false;
    }
    variablesState.ObserveVariableChange(() => {
      this._stateIsPristine = false;
    });
    const start = this.startSymbol();
    const place = start === undefined ? undefined : this.root.place(start);
    if (place) {
      this.land(place, [], 0);
      this._start = { symbol: start!, ...place };
    } else {
      const root = this.root.flowNamed(ROOT_FLOW_NAME);
      this._state.position = root ? { sequence: root, entry: 0, offset: 0 } : null;
      this._start = null;
    }
    if (this._imagesOn) {
      this.attachImages();
    }
    this._chosenAt = null;
    this._currentBeat = null;
    this._stateIsPristine = !carried;
  }

  ResetErrors(): void {
    this._state.ResetErrors();
  }

  ResetCallstack(): void {
    this.IfAsyncWeCant("ResetCallstack");
    this._stateIsPristine = false;
    this._stillImage = null;
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
    if (this._state.variablesState.DiscardVariableObservation()) {
      this._stateIsPristine = false;
    }
    this._asyncContinueActive = false;
  }

  ChoosePathString(path: string, resetCallstack = true, args: any[] = []): void {
    this.IfAsyncWeCant("call ChoosePathString right now");
    if (this.onChoosePathString !== null) this.onChoosePathString(path, args);
    const target = this.placeName(path);
    if (!target) {
      throw new StoryException(`Path not found: '${path}'`);
    }
    this.choose(target, resetCallstack, args);
  }

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
    const left = resetCallstack ? -1 : this._state.previousFlow;
    if (resetCallstack) {
      this.ResetCallstack();
    }
    this._state.generatedChoices.length = 0;
    this._state.beatImage = null;
    this._stillImage = null;
    this._chosenAt = null;
    this._currentBeat = null;
    this._state.DiscardLineEnd();
    this.passArguments(args);
    const entry = this.flowEntryTarget(target);
    if (entry) {
      arrangeArgsFor(this, entry, args?.length ?? 0);
    }
    this._stateIsPristine = false;
    this._state.currentTurnIndex += 1;
    this.land(
      target.position,
      this._state.blockStack,
      this.keptFlowScopes(target.position, target.symbol),
    );
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

  ChooseChoice(choice: ProgramChoice): void {
    if (this.onMakeChoice !== null) this.onMakeChoice(choice);
    const held = this._state.beatImage;
    const record = held ? this.history.recordOf(held) : undefined;
    if (record) {
      record.decisions.push(Number(choice.sourcePath));
    }
    this._chosenAt = record ?? null;
    this._currentBeat = null;
    this._chosenAddress = Number(choice.sourcePath);
    const left = this._state.previousFlow;
    this._state.lineJoinable = false;
    this._state.beatImage = null;
    this.takeChoice(choice, left, true);
  }

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

  HasFunction(functionName: string): boolean {
    try {
      return this.FlowValueNamed(functionName) !== null;
    } catch (e) {
      return false;
    }
  }

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
    const previousFlow = state.previousFlow;
    const previousAddress = state.previousAddress;

    this.enter(
      target,
      PushPopType.FunctionEvaluationFromGame,
      state.evaluationStack.length,
    );
    const scene = found ? this.root.flow(found.ref.symbol) : undefined;
    if (scene && target.entry.sequence !== scene) {
      this.countEntered(target.entry.sequence, scene.flow);
    }
    this.passArguments(args);
    if (target.bindings > 0) {
      arrangeArgsFor(this, target, args?.length ?? 0);
    }

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
      state.previousFlow = previousFlow;
      state.previousAddress = previousAddress;
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

    const stdlibResults = tryInvokeStdLibMarkerValue(this, fnValue, args);
    if (stdlibResults != null) return stdlibResults;

    const state = this._state;
    const suspended = this.suspendStep();
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
            return this.CallLuauFunction(callHandler, [fnValue, ...args]);
          }
          throw luauRuntimeError(`attempt to call a ${luauTypeOf(fnValue)} value`);
        }
      } else if (isFunctionReference(fnValue)) {
        for (const a of callArgs) state.PushEvaluationStack(a);
        target = this.FunctionTargetOf(fnValue);
      } else {
        throw luauRuntimeError(`attempt to call a ${luauTypeOf(fnValue)} value`);
      }
      if (target == null) {
        throw new StoryException(
          "CallLuauFunction: could not resolve function value to a path",
        );
      }
      this.EnterFunction(target);
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
      if (e instanceof StoryException && e.raisedAddress == null) {
        e.raisedAddress = this.runningAddress() ?? null;
      }
      throw e;
    } finally {
      this.resumeStep(suspended, false);
    }
  }

  CallLuauFunctionProtected(
    fnValue: AbstractValue,
    args: AbstractValue[],
  ): {
    ok: boolean;
    values: AbstractValue[];
    errorMessage?: string;
    errorValue?: AbstractValue;
  } {
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
    if (
      fnValue instanceof ObjectValue &&
      (fnValue.value as Map<string, AbstractValue>)?.get("__stdlib_fn") != null
    ) {
      const errCountBefore = state.currentErrors?.length ?? 0;
      const builtin = (fnValue.value as Map<string, AbstractValue>).get(
        "__stdlib_fn",
      );
      this.errorCalledByBuiltin =
        builtin instanceof StringValue && builtin.value === "error";
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
          return trappedFailure(e);
        }
        throw e;
      } finally {
        this.errorCalledByBuiltin = false;
      }
    }

    const savedErrorCount = state.currentErrors?.length ?? 0;
    const suspended = this.suspendStep();
    let trappedError: string | null = null;
    let trappedValue: AbstractValue | undefined;
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
            trappedValue = e.errorValue as AbstractValue | undefined;
            break;
          }
          throw e;
        }
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
        return {
          ok: false,
          values: [],
          errorMessage: trappedError,
          errorValue: trappedValue,
        };
      }

      const results: AbstractValue[] = [];
      while (state.evaluationStack.length > suspended.evalHeight) {
        results.unshift(state.PopEvaluationStack() as AbstractValue);
      }
      while (results.length > 0 && results[0] instanceof Void) {
        results.shift();
      }
      return { ok: true, values: results };
    } finally {
      this.resumeStep(suspended, true);
    }
  }

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

  FunctionTargetOf(value: unknown): FunctionTarget | null {
    if (!(value instanceof SymbolValue)) {
      return null;
    }
    const symbol = this.symbolIn(value.ref);
    return symbol === undefined ? null : this.targetOf(symbol);
  }

  EnterFunction(target: FunctionTarget): void {
    this.enter(target as SymbolTarget, PushPopType.Function);
  }

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

  CallFrameCount(): number {
    return this._state.callStack.elements.length;
  }

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
      return this.root.shownLabelOf(frame.symbol);
    }
    return this.flowName(position.sequence.flow);
  }

  CallFrameName(index: number): string | null {
    const path = this.CallFramePath(index);
    const element = this._state.callStack.elements[index];
    const frame = element ? this._state.frameOf(element) : undefined;
    if (path === null || (frame && this.root.runFileOf(frame.symbol))) {
      return path;
    }
    return path.slice(path.lastIndexOf(".") + 1);
  }

  FunctionLabel(ref: SymbolRef): string {
    const symbol = this.symbolIn(ref);
    return symbol === undefined ? ref.label : this.root.shownLabelOf(symbol);
  }

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
        at = state.frameOf(above)?.returnTo ?? null;
        const chunk = at?.sequence.arrays.chunks[at.entry];
        if (at && chunk) {
          address = addressOf(chunkId(chunk), Math.max(0, at.offset - 2));
        }
      } else {
        at = top;
        if (current) {
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
          ? this.root.shownLabelOf(frame.symbol)
          : this.flowName(symbol),
        scope: frame ? this.root.labelOf(frame.symbol) : this.flowName(symbol),
        address,
        element,
      });
    }
    return frames;
  }

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

  Error(message: string, useEndLineNumber = false): never {
    const e = new StoryException(message);
    e.useEndLineNumber = useEndLineNumber;
    throw e;
  }

  ErrorFrom(message: string, cause: unknown): never {
    const e = new StoryException(message);
    if (cause instanceof StoryException) {
      e.raisedPath = cause.raisedPath;
      e.raisedAddress = cause.raisedAddress;
      e.errorValue = cause.errorValue;
    }
    throw e;
  }

  Warning(message: string): void {
    this.AddError(message, true);
  }

  protected tellDeclarationIssue(isWarning: boolean): void {
    if (this._declarationRunning === null || !this._onDeclarationIssue) {
      return;
    }
    this._onDeclarationIssue(
      this._declarationRunning,
      isWarning,
      this._declarationGlobals,
    );
  }

  AddError(
    message: string,
    isWarning = false,
    useEndLineNumber = false,
    raisedAddress: number | null = null,
  ): void {
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
    this.tellDeclarationIssue(isWarning);
    this._state.AddError(message, isWarning, raised);
    if (!isWarning) {
      this._state.ForceEnd();
      this.ending = "error";
    }
  }

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

  static addressOf(chunk: ProgramChunk, offset: number): ProgramAddress {
    return addressOf(chunkId(chunk), offset);
  }

  get previousAddress(): number {
    return this._state.previousAddress;
  }

  stackAddresses(): number[] {
    return this._state.stackAddresses();
  }

  get currentAddress(): number {
    const position = this._state.position;
    const chunk = position?.sequence.arrays.chunks[position.entry];
    return position && chunk ? addressOf(chunkId(chunk), position.offset) : -1;
  }

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
        this._currentBeat = null;
      }
      state.didSafeExit = false;
      const carried = state.TakeCarriedStep();
      state.ResetOutput(carried?.output ?? null);
      state.lineEndPending = carried?.lineEndPending ?? false;
      state.outputCut = null;
      state.TakeHeldAddresses();
      if (carried) this.logBeat(carried.addresses);
      if (this._recursiveContinueCount == 1) {
        state.variablesState.StartVariableObservation();
      }
    } else if (this._asyncContinueActive && !stepAtATime) {
      this._asyncContinueActive = false;
    }

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
        this.logBeat(state.TakeHeldAddresses());
        break;
      }
      if (this.pausedBeforeCondition !== null || this._asyncContinueActive) {
        break;
      }
    }

    state.CarryOutputPastCut();
    if (outputStreamEndsInNewline || !this.canContinue) {
      this.logBeat(state.TakeHeldAddresses());
    }

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
    if (
      endedBeat &&
      this.keepBeatImages &&
      this._recursiveContinueCount == 1 &&
      this.pausedBeforeCondition === null
    ) {
      const ended = this.capture();
      this.adoptBeat(ended, null);
      this._currentBeat = this.history.push(ended, BEAT_WAITED, true);
      this._currentAtStep = this.stepCount;
    }

    this._recursiveContinueCount--;
    this.reportErrors();
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
      const e = new StoryException(
        `Ink had errors or warnings. It is strongly suggested that you assign an error handler to story.onError. The first issue was: ${first}`,
      );
      const raised = state.hasError ? state.raisedErrors : state.raisedWarnings;
      e.raisedAddress = raised[0]?.address ?? null;
      throw e;
    }
  }

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

  Step(): void {
    const state = this._state;
    const start = this._start;
    const at = state.position;
    if (
      start &&
      at &&
      at.sequence === start.sequence &&
      at.entry === start.entry &&
      at.offset === start.offset &&
      state.VisitCount(this.countId(start.symbol)) === 0
    ) {
      this.countEntered(at.sequence, -1);
      this.enterStart(start.symbol, at.sequence);
    }
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
      const address = ProgramStory.addressOf(chunk, position.offset);
      if (!this.simulator?.willForceCondition(address)) {
        this.pausedBeforeCondition = address;
        const w0 = chunk[HEADER_WORDS + position.offset]!;
        const condition =
          opOf(w0) === Op.Choice && !(flagsOf(w0) & CHOICE_CONDITION)
            ? null
            : state.PeekEvaluationStack();
        this.pausedConditionValue =
          condition instanceof Value && !(condition instanceof SymbolValue)
            ? condition.isTruthy
            : null;
        return;
      }
    }
    this.pausedBeforeCondition = null;
    this.pausedConditionValue = null;
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
    this.endedAt = null;
    this.ending = null;
    if (this.onExecute !== null) this.onExecute(address);
    if (this.executedLog !== null) this.executedLog.push(address);
    if (state.holdsAddresses) {
      state.heldAddresses.push(address);
    } else if (this.beatLog !== null) {
      this.beatLog.push(address);
    }
    state.lineEndJoined = false;
    try {
      this.execute(position, chunk);
    } catch (e) {
      if (e instanceof StoryException && e.positionPending) {
        e.positionPending = false;
        if (this.errorMessageFormatter) {
          e.message = this.errorMessageFormatter(this, e.message);
        }
      }
      throw e;
    }
    if (
      state.heldAddresses.length > 0 &&
      state.outputCut === null &&
      !state.holdsInherited &&
      (state.lineEndJoined || !state.lineEndPending)
    ) {
      this.logBeat(state.TakeHeldAddresses());
    }
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

  protected logBeat(addresses: readonly number[]): void {
    const log = this.beatLog;
    if (log === null) return;
    for (const address of addresses) log.push(address);
  }

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

  protected pausesAt(chunk: ProgramChunk, offset: number): boolean {
    const w0 = chunk[HEADER_WORDS + offset]!;
    const op = opOf(w0);
    return (
      (op === Op.JumpIfFalse && (flagsOf(w0) & JUMP_DECISION) !== 0) ||
      (op === Op.Choice && (flagsOf(w0) & CHOICE_DECISION) !== 0)
    );
  }

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
    choice.sourcePath = String(addressOf(chunkId(chunk), at));
    choice.isInvisibleDefault = (flags & CHOICE_INVISIBLE_DEFAULT) !== 0;
    choice.threadAtGeneration = state.ForkChoiceThread();
    choice.tags = tags.reverse();
    choice.text = this.CleanOutputWhitespace(start + choiceOnly);
    state.generatedChoices.push(choice);
  }

  protected popChoiceText(tags: string[]): string {
    const state = this._state;
    const text = asOrThrows(state.PopEvaluationStack(), StringValue);
    while (state.PeekEvaluationStack() instanceof Tag) {
      tags.push((state.PopEvaluationStack() as Tag).text);
    }
    return text.value ?? "";
  }

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
          captureTag(this, (text) => this.CleanOutputWhitespace(text));
        } else {
          state.PushToOutputStream(ControlCommand.EndTag());
        }
        break;
      case Op.Out: {
        if (state.evaluationStack.length > 0) {
          const output = state.PopEvaluationStack();
          if (!(output instanceof Void)) {
            const text =
              functionText(oneValue(output), (ref) => this.FunctionLabel(ref)) ??
              output.toString();
            state.PushToOutputStream(new StringValue(text));
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
          flagsOf(w0) & ROOT_SLOT
            ? rootSlotPointer(state.callStack, this.root.table.strings[arg]!)
            : flagsOf(w0) & ROOT_GLOBAL
              ? rootGlobalPointer(this.root.table.strings[arg]!)
              : openVariablePointer(state.callStack, this.root.table.strings[arg]!),
        );
        break;
      case Op.MakeTable: {
        const stack = state.evaluationStack;
        const between = stack.splice(stack.length - arg * 2, arg * 2);
        const table = tableFromPairs(between, 0);
        if (this._imagesOn && table instanceof ObjectValue) {
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
      case Op.DeclareValue:
        if (
          this._declarationRunning !== null &&
          state.callStack.elements.length <= this._declarationDepth
        ) {
          this._declarationGlobals = arg;
        }
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
        if (!(flags & SET_VARARGS)) {
          value = oneValue(value);
        }
        if (flags & SET_ROOT_SLOTTED) {
          keepLegacyRootBinding(state.callStack, this.root.table.strings[arg]!);
        }
        state.variablesState.Assign(this.assignment(arg, flags), value);
        if (
          this._declarationRunning !== null &&
          flags & SET_DECLARE &&
          flags & SET_GLOBAL &&
          state.callStack.elements.length <= this._declarationDepth
        ) {
          this._declarationGlobals += 1;
        }
        break;
      }
      case Op.Native: {
        const func = this.native(arg, auxOf(w0));
        if (!OPERATOR_NATIVES.has(func.name) && !TEXT_BUILTINS.has(func.name)) {
          this.callsMade += 1;
        }
        const callArgs = (flags & NATIVE_CALL_ARGS) !== 0;
        const params = state.PopEvaluationStack(
          callArgs ? auxOf(w0) : func.numberOfParameters,
        );
        state.PushEvaluationStack(
          callNativeFunction(this, func, params, callArgs) as InkObject,
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
        this.callsMade += 1;
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
        arrangeArgsFor(this, target, auxOf(w0));
        this.EnterFunction(target);
        break;
      }
      case Op.CallVar: {
        this.callsMade += 1;
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
        this.callsMade += 1;
        const count = auxOf(w0);
        callValueAsFunction(
          this,
          count === CALL_ARGS_UNKNOWN ? -1 : count,
          flags & CALL_METHOD ? this.root.table.strings[arg]! : null,
        );
        break;
      }
      case Op.Return:
        this.returnFromFunction();
        break;
      case Op.CallStd:
        if (!TEXT_BUILTINS.has(this.root.table.strings[arg]!)) {
          this.callsMade += 1;
        }
        this.callStd(
          this.root.table.strings[arg]!,
          auxOf(w0),
          (flags & CALL_DISCARD) !== 0,
        );
        break;
      case Op.Done:
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
        this.endedAt = this.runningAddress() ?? null;
        this.ending = "fin";
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

  protected isTruthy(obj: InkObject): boolean {
    if (obj instanceof Value) {
      if (obj instanceof SymbolValue) {
        this.Error(
          "Shouldn't use a divert target (to " +
            obj.ref.label +
            ") as a conditional value. Did you intend a function call 'likeThis()' or a read count check 'likeThis'? (no arrows)",
        );
      }
      return obj.isTruthy;
    }
    return false;
  }

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

  protected sceneTargetOf(symbol: number): SymbolTarget | null {
    const flow = this.root.flow(symbol);
    if (flow?.kind !== SymbolKind.Scene) {
      return null;
    }
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

  protected enter(target: SymbolTarget, type: PushPopType, evalHeight = 0): void {
    const state = this._state;
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
    const kind = this.root.kindOf(target.symbol);
    if (kind === SymbolKind.Scene || kind === SymbolKind.Branch) {
      for (let open = flowScopesOf(this.root, target.entry.sequence); open > 0; open -= 1) {
        state.frame?.PushScope();
      }
    }
  }

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
      if (returnVal.valueType == ValueType.DivertTarget) {
        return "-> " + returnVal.valueObject.toString();
      }
      return returnVal.valueObject;
    }
    return null;
  }

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
          typeof arg === "boolean"
        )
      ) {
        throw new Error(
          "ink arguments when calling EvaluateFunction / ChoosePathStringWithParameters must be " +
            "number, string or bool. Argument was " +
            (arg == null ? "null" : arg.constructor.name),
        );
      }
      this._state.PushEvaluationStack(Value.Create(arg)!);
    }
  }

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

  protected native(name: number, arity: number): NativeFunctionCall {
    const key = name * 0x10000 + arity;
    let func = this._natives.get(key);
    if (!func) {
      func = NativeFunctionCall.CallWithName(this.root.table.strings[name]!, arity);
      this._natives.set(key, func);
    }
    return func;
  }

  protected done(): void {
    const state = this._state;
    if (state.canPopThread) {
      state.PopThread();
      return;
    }
    state.position = null;
    state.blockStack = [];
    state.didSafeExit = true;
    this.ending = "out";
  }


  protected land(
    target: ProgramPosition,
    from: readonly BlockEntry[],
    keep: number,
  ): void {
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
      const keepsBlocks = keep === flowScopesOf(this.root, target.sequence);
      let shared = 0;
      let kept = 1 + keep;
      while (
        keepsBlocks &&
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
      for (let open = kept; open < scopes; open += 1) {
        frame.PushScope();
      }
    }
  }

  protected jumpTo(
    symbol: number,
    left: SequenceRow | null = this._running?.sequence ?? null,
  ): void {
    const place = this.root.place(symbol);
    if (!place) {
      this.Error("Divert target not found.");
    }
    this.land(place, this._state.blockStack, this.keptFlowScopes(place, symbol));
    this.countEntered(place.sequence, left?.flow ?? -1);
    this.countLabelsAbove(place);
    this.enterStart(symbol, place.sequence);
  }

  protected keptFlowScopes(target: ProgramPosition, symbol?: number): number {
    const kind = symbol === undefined ? UNDEFINED_KIND : this.root.kindOf(symbol);
    const at = this._state.position;
    if (kind === SymbolKind.Branch && at) {
      const from = at.sequence;
      const entry = from.arrays.chunks[0];
      if (
        from.owner < 0 &&
        from.kind === SymbolKind.Scene &&
        from.flow === this.root.parentOf(symbol!) &&
        at.entry === 0 &&
        entry &&
        entryBindings(entry, 0).bindings > 0
      ) {
        return 1;
      }
    }
    if (kind === SymbolKind.Scene || kind === SymbolKind.Branch) {
      return 0;
    }
    const flow = flowSequenceOf(this.root, target.sequence);
    return at && flow && flowSequenceOf(this.root, at.sequence) === flow
      ? flowScopesOf(this.root, target.sequence)
      : 0;
  }

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

  protected flowEntryTarget(target: {
    position: ProgramPosition;
    symbol?: number;
  }): FunctionTarget | null {
    const { position, symbol } = target;
    if (symbol === undefined) {
      return null;
    }
    const kind = this.root.kindOf(symbol);
    if (kind !== SymbolKind.Scene && kind !== SymbolKind.Branch) {
      return null;
    }
    const chunk = position.sequence.arrays.chunks[0];
    if (
      !chunk ||
      position.entry !== 0 ||
      position.offset !== 0 ||
      this.root.flow(symbol) !== position.sequence
    ) {
      return null;
    }
    const bound = entryBindings(chunk, 0);
    return bound.bindings > 0 ? bound : null;
  }

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

  protected enterStart(symbol: number, at: SequenceRow): void {
    const start = this.root.startOf(symbol);
    if (start < 0 || at.arrays.chunks.length > 0) {
      return;
    }
    const branch = this.root.place(start);
    if (branch) {
      this.land(branch, this._state.blockStack, flowScopesOf(this.root, at));
      this.countEntered(branch.sequence, at.flow);
    }
  }

  protected countEntered(target: SequenceRow, left: number): void {
    const was = this.flowsOf(left);
    for (const flow of this.flowsOf(target.flow)) {
      if (!was.includes(flow)) {
        this._state.Visit(this.countId(flow));
      }
    }
  }

  protected flowsOf(flow: number): number[] {
    if (flow < 0) {
      return [];
    }
    const parent = this.root.parentOf(flow);
    return parent >= 0 ? [flow, parent] : [flow];
  }

  protected countId(symbol: number): number {
    return countIdOf(this.root.table, symbol);
  }

  protected callTunnel(symbol: number): void {
    const state = this._state;
    const left = this._running?.sequence ?? null;
    const place = this.root.place(symbol);
    if (!place) {
      this.Error("Divert target not found.");
    }
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
    this.land(place, [], 0);
    this.countEntered(place.sequence, left?.flow ?? -1);
    this.countLabelsAbove(place);
    this.enterStart(symbol, place.sequence);
  }

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
      this.jumpTo(symbol, state.position?.sequence ?? null);
    }
  }

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

  protected shuffleIndex(symbol: number): void {
    storyDraws.count += 1;
    const state = this._state;
    const elements = state.PopEvaluationStack();
    if (!(elements instanceof IntValue) || elements.value === null) {
      this.Error("expected number of elements in sequence for shuffle index");
    }
    if (elements.value <= 0) {
      this.Error("a sequence with no elements has no arm to shuffle to");
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

  protected runDeclarations(): void {
    const state = this._state;
    this._declarationsClean = false;
    const pause = this.pauseBeforeEvaluatingConditions;
    this.pauseBeforeEvaluatingConditions = false;
    const onExecute = this.onExecute;
    this.onExecute = null;
    const executedLog = this.executedLog;
    this.executedLog = null;
    const beatLog = this.beatLog;
    this.beatLog = null;
    const depth = state.callStack.elements.length;
    this._declarationDepth = depth;
    for (const chunk of this.root.initialization) {
      this._declarationRunning = chunkId(chunk);
      this._declarationGlobals = 0;
      const at = this.root.position(chunkId(chunk));
      if (!at) {
        state.position = null;
        this.AddError(
          `The program has no place for declaration chunk ${chunkId(chunk)}.`,
        );
        break;
      }
      state.position = { sequence: at.sequence, entry: at.entry, offset: 0 };
      state.blockStack = [];
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
          this.tellDeclarationIssue(false);
          this._declarationRunning = null;
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
    this._declarationRunning = null;
    this.pauseBeforeEvaluatingConditions = pause;
    this.onExecute = onExecute;
    this.executedLog = executedLog;
    this.beatLog = beatLog;
    state.position = null;
    state.blockStack = [];
    state.previousAddress = -1;
    state.evaluationStack.length = 0;
    this._declarationsClean = !state.hasError && !state.hasWarning;
    this.reportErrors();
  }

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
    const missing = name.startsWith("__")
      ? 0
      : firstMissingStdLibArg(entry, args);
    if (missing) {
      this.Error(
        `missing argument #${missing} to '${name.slice(name.lastIndexOf(".") + 1)}'`,
      );
    }
    const result = entry.fn(this, args);
    if (discard) {
      return;
    }
    pushStdLibResult(this, result);
  }

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

  protected _running: RunningInstruction | null = null;

  endedAt: number | null = null;

  ending: StoryEnding | null = null;

  protected startSymbol(): number | undefined {
    const symbol = this.root.table.symbolIds.get(START_FLOW_NAME);
    return symbol !== undefined && this.root.kindOf(symbol) === SymbolKind.Scene
      ? symbol
      : undefined;
  }

  protected startName(): string {
    return this.startSymbol() === undefined ? ROOT_FLOW_NAME : START_FLOW_NAME;
  }

  protected _start: {
    symbol: number;
    sequence: SequenceRow;
    entry: number;
    offset: number;
  } | null = null;

  protected placeName(
    path: string,
  ): { position: ProgramPosition; symbol?: number } | undefined {
    const name = path === "0" ? this.startName() : path;
    const symbol = this.root.table.symbolIds.get(name);
    const kind = symbol === undefined ? UNDEFINED_KIND : this.root.kindOf(symbol);
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

  takesParameters(path: string): boolean {
    const target = this.placeName(path);
    return target !== undefined && this.flowEntryTarget(target) !== null;
  }
}

const trappedFailure = (
  e: StoryException,
): {
  ok: false;
  values: AbstractValue[];
  errorMessage: string;
  errorValue?: AbstractValue;
} => ({
  ok: false,
  values: [],
  errorMessage: e.message,
  errorValue: e.errorValue as AbstractValue | undefined,
});

const isLabelChunk = (chunk: ProgramChunk | undefined): boolean =>
  !!chunk &&
  codeWords(chunk) === 2 &&
  opOf(chunk[HEADER_WORDS]!) === Op.Visit &&
  exportCount(chunk) === 1 &&
  exportSymbol(chunk, 0) === chunk[HEADER_WORDS + 1];

const isEmptyChunk = (chunk: ProgramChunk | undefined): boolean =>
  !!chunk && codeWords(chunk) === 0 && exportCount(chunk) === 0;

const sameBlock = (a: BlockEntry, b: BlockEntry): boolean =>
  a.sequence.id === b.sequence.id && a.entry === b.entry && a.block === b.block;

const sameChunks = (
  a: readonly ProgramChunk[],
  b: readonly ProgramChunk[],
): boolean => a.length === b.length && a.every((chunk, i) => chunk === b[i]);

const sameNames = (
  a: ReadonlySet<string> | undefined,
  b: ReadonlySet<string> | undefined,
): boolean => {
  const size = a?.size ?? 0;
  if (size !== (b?.size ?? 0)) return false;
  for (const name of a ?? []) {
    if (!b!.has(name)) return false;
  }
  return true;
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
