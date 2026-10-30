import { ControlCommand } from "../runtime/ControlCommand";
import type { RaisedError } from "../runtime/Error";
import { JsonSerialisation } from "../runtime/JsonSerialisation";
import type { InkObject } from "../runtime/Object";
import { PRNG } from "../runtime/PRNG";
import { PushPopType } from "../runtime/PushPop";
import { SimpleJson } from "../runtime/SimpleJson";
import { StringBuilder } from "../runtime/StringBuilder";
import { Tag } from "../runtime/Tag";
import {
  MultiValue,
  NullValue,
  ObjectValue,
  StringValue,
  type VariablePointerValue,
} from "../runtime/Value";
import type { ImageTracker, ProgramImage } from "./ProgramImages";
import type { VariablesState } from "../runtime/VariablesState";
import { CallStack } from "../runtime/CallStack";
import {
  findOpenString,
  isBeginString,
  splitHeadTailWhitespace,
} from "../runtime/outputWhitespace";
import type { ProgramRoot, SequenceRow } from "./ProgramRoot";
import {
  SymbolKind,
  UNDEFINED_KIND,
  countIdOf,
  isAnonymousSymbol,
} from "./ProgramSymbols";
import {
  BLOCK_FUNCTION,
  HEADER_WORDS,
  addressOf,
  blockFlags,
  blockScopes,
  chunkId,
  codeWords,
  type ProgramChunk,
} from "./ProgramChunk";
import { Op, opOf } from "./ProgramInstructions";
import { Choice } from "../runtime/Choice";

export interface ProgramPosition {
  sequence: SequenceRow;
  entry: number;
  offset: number;
}

export interface BlockEntry {
  sequence: SequenceRow;
  entry: number;
  block: number;
}

export interface ProgramFrame {
  returnTo: ProgramPosition | null;
  blocks: BlockEntry[];
  symbol: number;
  dropResult?: boolean;
}

export const blockStackOf = (
  root: ProgramRoot,
  sequence: SequenceRow,
): BlockEntry[] | undefined => {
  const stack: BlockEntry[] = [];
  let at = sequence;
  while (at.owner >= 0) {
    const owner = root.position(at.owner);
    if (!owner) {
      return undefined;
    }
    stack.unshift({ sequence: owner.sequence, entry: owner.entry, block: at.block });
    const ownerChunk = owner.sequence.arrays.chunks[owner.entry]!;
    if (blockFlags(ownerChunk, at.block) & BLOCK_FUNCTION) {
      break;
    }
    at = owner.sequence;
  }
  return stack;
};

interface SuspendedThread {
  position: ProgramPosition | null;
  blocks: BlockEntry[];
  previousFlow: number;
}

export class ProgramChoice extends Choice {
  constructor(
    readonly target: ProgramPosition,
    readonly blocks: BlockEntry[],
    readonly chunk: ProgramChunk,
    readonly previousFlow: number,
  ) {
    super();
  }
}

const NEVER_VISITED = -0x80000000;

export interface PositionCopy {
  readonly chunk: number;
  readonly entry: number;
  readonly offset: number;
  readonly sequence: number;
  readonly after: number;
  readonly flowEntry: number;
  readonly sceneEntry: number;
}

const entryChunkOf = (root: ProgramRoot, symbol: number): number => {
  const flow = symbol >= 0 ? root.flow(symbol) : undefined;
  const entry = flow?.arrays.chunks[0];
  return entry && flow.arrays.lineStarts[0] === -1 ? chunkId(entry) : -1;
};

const sceneEntryOf = (root: ProgramRoot, sequence: SequenceRow): number =>
  sequence.flow >= 0 && sequence.kind === SymbolKind.Branch
    ? entryChunkOf(root, root.parentOf(sequence.flow))
    : -1;

export const copyPosition = (
  root: ProgramRoot,
  position: ProgramPosition | null,
): PositionCopy | null => {
  if (!position) {
    return null;
  }
  const chunks = position.sequence.arrays.chunks;
  const chunk = chunks[position.entry];
  const before =
    position.offset === 0 && position.entry > 0
      ? chunks[position.entry - 1]
      : undefined;
  return {
    chunk: chunk ? chunkId(chunk) : -1,
    entry: position.entry,
    offset: position.offset,
    sequence: position.sequence.id,
    after: before ? chunkId(before) : -1,
    flowEntry: entryChunkOf(root, position.sequence.flow),
    sceneEntry: sceneEntryOf(root, position.sequence),
  };
};

export interface ElementCopy {
  readonly type: PushPopType;
  readonly inExpression: boolean;
  readonly height: number;
  readonly start: number;
  readonly scopes: readonly ReadonlyMap<string, InkObject>[];
  readonly open: readonly VariablePointerValue[];
  readonly borrowed: readonly VariablePointerValue[];
  readonly frame: {
    returnTo: PositionCopy | null;
    symbol: number;
    dropResult?: boolean;
  } | null;
}

export interface ThreadCopy {
  readonly index: number;
  readonly elements: readonly ElementCopy[];
  readonly resume: {
    position: PositionCopy | null;
    previousFlow: number;
  } | null;
}

export interface ChoiceCopy {
  readonly text: string;
  readonly tags: readonly string[] | null;
  readonly index: number;
  readonly sourcePath: string;
  readonly isInvisibleDefault: boolean;
  readonly originalThreadIndex: number;
  readonly target: PositionCopy;
  readonly previousFlow: number;
  readonly thread: ThreadCopy;
}

export interface PositionalCopy {
  readonly position: PositionCopy | null;
  readonly evaluationStack: readonly InkObject[];
  readonly output: readonly InkObject[];
  readonly lineEndPending: boolean;
  readonly lineJoinable: boolean;
  readonly outputCut: number | null;
  readonly carried: {
    output: readonly InkObject[];
    lineEndPending: boolean;
    addresses: readonly number[];
  } | null;
  readonly heldAddresses: readonly number[];
  readonly didSafeExit: boolean;
  readonly turn: number;
  readonly seed: number;
  readonly previousRandom: number;
  readonly previousFlow: number;
  readonly previousAddress: number;
  readonly threads: readonly ThreadCopy[];
  readonly threadCounter: number;
  readonly choices: readonly ChoiceCopy[];
  frames: number;
}

export interface PlacedThread {
  copy: ThreadCopy;
  returns: (ProgramPosition | null)[];
  resume: ProgramPosition | null;
  cuts?: ThreadCuts;
}

export interface PlacedPositional {
  copy: PositionalCopy;
  position: ProgramPosition | null;
  threads: PlacedThread[];
  choices: {
    target: ProgramPosition | null;
    thread: PlacedThread;
    sourcePath?: string;
    dropped?: boolean;
  }[];
  remap?: (symbol: number) => number;
}

export interface ThreadCuts {
  after: boolean[];
  dropFrom: number;
  callerAfter?: ProgramPosition | null;
  restart?: {
    flow: string;
    position: ProgramPosition;
    params: { name: string; vararg: boolean }[];
    saved: string[];
  };
}

const scopesBefore = (chunk: ProgramChunk, offset: number): number => {
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

export const flowSequenceOf = (
  root: ProgramRoot,
  sequence: SequenceRow,
): SequenceRow | null => {
  let at = sequence;
  while (at.owner >= 0) {
    const owner = root.position(at.owner);
    if (!owner) {
      return null;
    }
    if (blockFlags(owner.sequence.arrays.chunks[owner.entry]!, at.block) & BLOCK_FUNCTION) {
      return null;
    }
    at = owner.sequence;
  }
  return at;
};

export const flowScopesOf = (root: ProgramRoot, sequence: SequenceRow): number => {
  const flow = flowSequenceOf(root, sequence);
  if (flow?.kind === SymbolKind.Scene) {
    return 1;
  }
  if (flow?.kind === SymbolKind.Branch) {
    return root.parentOf(flow.flow) >= 0 ? 2 : 1;
  }
  return 0;
};

export const scopeDepthAt = (
  root: ProgramRoot,
  position: ProgramPosition,
  blocks: readonly BlockEntry[] | undefined = blockStackOf(root, position.sequence),
): number => {
  let depth = 1 + flowScopesOf(root, position.sequence);
  for (const block of blocks ?? []) {
    depth += blockScopes(block.sequence.arrays.chunks[block.entry]!, block.block);
  }
  const chunk = position.sequence.arrays.chunks[position.entry];
  if (chunk) {
    depth += scopesBefore(chunk, position.offset);
  }
  return depth;
};

const copyFrame = (frame: ProgramFrame): ProgramFrame => ({
  returnTo: frame.returnTo ? { ...frame.returnTo } : null,
  blocks: frame.blocks.slice(),
  symbol: frame.symbol,
  ...(frame.dropResult ? { dropResult: true } : {}),
});

interface CarriedStep {
  output: InkObject[];
  lineEndPending: boolean;
  addresses: number[];
}

export interface SuspendedLineEnd {
  pending: boolean;
  joinable: boolean;
  cut: number | null;
  carried: CarriedStep | null;
  holdsInherited: boolean;
  joined: boolean;
}

export class ProgramStoryState {
  position: ProgramPosition | null = null;
  blockStack: BlockEntry[] = [];
  evaluationStack: InkObject[] = [];
  outputStream: InkObject[] = [];
  lineEndPending = false;
  lineJoinable = false;
  outputCut: number | null = null;
  carried: CarriedStep | null = null;
  heldAddresses: number[] = [];
  lineEndJoined = false;
  protected _holdsInherited = false;
  didSafeExit = false;
  currentTurnIndex = -1;
  storySeed: number;
  previousRandom = 0;
  previousFlow = -1;
  previousAddress = -1;

  protected _currentErrors: string[] | null = null;
  protected _currentWarnings: string[] | null = null;
  protected _raisedErrors: RaisedError[] = [];
  protected _raisedWarnings: RaisedError[] = [];
  protected _openStringIndex = -1;
  protected _openStrings: number[] = [];
  protected _openStringsStream: InkObject[] | null = null;
  protected _frames = new WeakMap<CallStack.Element, ProgramFrame>();
  protected _suspended = new WeakMap<CallStack.Thread, SuspendedThread>();

  visits: Uint32Array = new Uint32Array(0);
  turns: Int32Array = new Int32Array(0);

  cellsWritten:
    | ((cells: ReadonlyMap<VariablePointerValue, number>) => void)
    | null = null;
  cellsRead: ((cells: ReadonlyMap<number, VariablePointerValue>) => void) | null =
    null;

  constructor(
    protected _root: ProgramRoot,
    public variablesState: VariablesState,
    protected _cleanWhitespace: (text: string) => string,
    protected _noteChanged: () => void = () => {},
    public callStack: CallStack,
  ) {
    this.storySeed = new PRNG(new Date().getTime()).next() % 100;
  }

  get frame(): CallStack.Element | null {
    return this.callStack.currentElement ?? null;
  }

  frameOf(element: CallStack.Element): ProgramFrame | undefined {
    return this._frames.get(element);
  }

  stackAddresses(): number[] {
    const out: number[] = [];
    const add = (position: ProgramPosition | null | undefined) => {
      const chunk = position?.sequence.arrays.chunks[position.entry];
      if (position && chunk) {
        out.push(addressOf(chunkId(chunk), position.offset));
      }
    };
    const threads = this.callStack._threads;
    threads.forEach((thread, i) => {
      for (const element of thread.callstack) {
        add(this._frames.get(element)?.returnTo);
      }
      if (i < threads.length - 1) {
        add(this._suspended.get(thread)?.position);
      }
    });
    add(this.position);
    return out;
  }

  resumeOf(thread: CallStack.Thread): ProgramPosition | null {
    return this._suspended.get(thread)?.position ?? null;
  }

  PushFrame(
    type: PushPopType,
    frame: ProgramFrame,
    evalHeight = 0,
  ): CallStack.Element {
    this.callStack.Push(type, evalHeight, this.outputStream.length);
    const element = this.callStack.currentElement!;
    this._frames.set(element, frame);
    return element;
  }

  ForkThread(resumeAt: ProgramPosition): void {
    const original = this.callStack.currentThread;
    this._suspended.set(original, {
      position: resumeAt,
      blocks: this.blockStack.slice(),
      previousFlow: this.previousFlow,
    });
    this.callStack.PushThread();
    const fork = this.callStack.currentThread;
    original.callstack.forEach((element, i) => {
      const frame = this._frames.get(element);
      const copy = fork.callstack[i];
      if (frame && copy) {
        this._frames.set(copy, copyFrame(frame));
      }
    });
    this.blockStack = this.blockStack.slice();
  }

  get canPopThread(): boolean {
    return this.callStack.canPopThread;
  }

  PopThread(): void {
    this.callStack.PopThread();
    const resumed = this._suspended.get(this.callStack.currentThread);
    this.position = resumed?.position
      ? { ...resumed.position }
      : null;
    this.blockStack = resumed?.blocks.slice() ?? [];
    this.previousFlow = resumed?.previousFlow ?? -1;
  }

  Visit(id: number): void {
    if (id < 0) {
      return;
    }
    this.visitsMade += 1;
    this.visitLog?.push(id);
    this.growCounts(id);
    this.visits[id] = this.visits[id]! + 1;
    this.turns[id] = this.currentTurnIndex;
    this.images?.count(id);
  }

  visitsMade = 0;

  visitLog: number[] | null = null;

  images: ImageTracker | null = null;

  beatImage: ProgramImage | null = null;

  get root(): ProgramRoot {
    return this._root;
  }

  VisitCount(id: number): number {
    return id >= 0 ? (this.visits[id] ?? 0) : 0;
  }

  TurnsSince(id: number): number {
    const turn = id >= 0 ? (this.turns[id] ?? NEVER_VISITED) : NEVER_VISITED;
    return turn === NEVER_VISITED ? -1 : this.currentTurnIndex - turn;
  }

  protected growCounts(id: number): void {
    if (id < this.visits.length) {
      return;
    }
    const size = Math.max(id + 1, this.visits.length * 2, 16);
    const visits = new Uint32Array(size);
    visits.set(this.visits);
    const turns = new Int32Array(size).fill(NEVER_VISITED);
    turns.set(this.turns);
    this.visits = visits;
    this.turns = turns;
  }

  get canContinue(): boolean {
    return this.position !== null && !this.hasError;
  }

  get currentErrors() {
    return this._currentErrors;
  }

  get currentWarnings() {
    return this._currentWarnings;
  }

  get raisedErrors() {
    return this._raisedErrors;
  }

  get raisedWarnings() {
    return this._raisedWarnings;
  }

  get hasError(): boolean {
    return this._currentErrors != null && this._currentErrors.length > 0;
  }

  get hasWarning(): boolean {
    return this._currentWarnings != null && this._currentWarnings.length > 0;
  }

  AddError(message: string, isWarning: boolean, raised: RaisedError): void {
    if (!isWarning) {
      if (this._currentErrors == null) this._currentErrors = [];
      this._currentErrors.push(message);
      this._raisedErrors[this._currentErrors.length - 1] = raised;
    } else {
      if (this._currentWarnings == null) this._currentWarnings = [];
      this._currentWarnings.push(message);
      this._raisedWarnings[this._currentWarnings.length - 1] = raised;
    }
  }

  ResetErrors(): void {
    this._currentErrors = null;
    this._currentWarnings = null;
    this._raisedErrors = [];
    this._raisedWarnings = [];
  }

  get currentChoices(): ProgramChoice[] {
    return this.canContinue ? [] : this.generatedChoices;
  }

  generatedChoices: ProgramChoice[] = [];

  ForkChoiceThread(): CallStack.Thread {
    const original = this.callStack.currentThread;
    const fork = this.callStack.ForkThread();
    original.callstack.forEach((element, i) => {
      const frame = this._frames.get(element);
      const copy = fork.callstack[i];
      if (frame && copy) {
        this._frames.set(copy, copyFrame(frame));
      }
    });
    return fork;
  }

  TakeChoice(choice: ProgramChoice): void {
    this.callStack.currentThread = choice.threadAtGeneration!;
    this.generatedChoices.length = 0;
    this.position = { ...choice.target };
    this.blockStack = choice.blocks.slice();
    this.didSafeExit = false;
  }

  get callstackDepth(): number {
    return this.callStack.depth;
  }

  PushEvaluationStack(obj: InkObject): void {
    this.evaluationStack.push(obj);
  }

  PopEvaluationStack(): InkObject;
  PopEvaluationStack(count: number): InkObject[];
  PopEvaluationStack(count?: number): InkObject | InkObject[] {
    if (count === undefined) {
      return (this.evaluationStack.pop() ?? null) as InkObject;
    }
    if (count > this.evaluationStack.length) {
      throw new Error("trying to pop too many objects");
    }
    return this.evaluationStack.splice(this.evaluationStack.length - count, count);
  }

  PeekEvaluationStack(): InkObject | null {
    return this.evaluationStack[this.evaluationStack.length - 1] ?? null;
  }

  PopFromOutputStream(count: number): void {
    this.outputStream.splice(this.outputStream.length - count, count);
    this.OutputStreamDirty();
  }

  ResetOutput(objs: InkObject[] | null = null): void {
    this.outputStream.length = 0;
    if (objs !== null) this.outputStream.push(...objs);
    this.ForgetOpenStrings();
    this.OutputStreamDirty();
  }

  PushToOutputStream(obj: InkObject | null): void {
    if (isBeginString(obj)) {
      this.innermostOpenString;
      this._openStrings.push(this.outputStream.length);
    }
    if (!this.inStringEvaluation && showsOutput(obj)) {
      this.lineJoinable = false;
      if (this.lineEndPending) {
        this.lineEndPending = false;
        this.outputCut = this.outputStream.length;
      }
    }
    if (obj instanceof StringValue) {
      if (this.inStringEvaluation) {
        const currEl = this.callStack.currentElement!;
        if (
          currEl.type == PushPopType.Function &&
          currEl.functionStartInOutputStream > this._openStringIndex &&
          this.innermostOpenString < currEl.functionStartInOutputStream
        ) {
          if (obj.isNewline) return;
          if (obj.isNonWhitespace) this.MarkFunctionsShown();
        }
        this.outputStream.push(obj);
        this.OutputStreamDirty();
        return;
      }
      const listText = this.TrySplittingHeadTailWhitespace(obj);
      if (listText !== null) {
        for (const textObj of listText) {
          this.PushToOutputStreamIndividual(textObj);
        }
        this.OutputStreamDirty();
        return;
      }
    }
    this.PushToOutputStreamIndividual(obj);
    this.OutputStreamDirty();
  }

  PushToOutputStreamIndividual(obj: InkObject | null): void {
    if (obj === null) {
      throw new Error("obj");
    }
    let includeInOutput = true;
    if (obj instanceof StringValue) {
      let functionTrimIndex = -1;
      const currEl = this.callStack.currentElement;
      if (currEl?.type == PushPopType.Function) {
        functionTrimIndex = currEl.functionStartInOutputStream;
      }
      for (let i = this.outputStream.length - 1; i >= 0; i--) {
        if (isBeginString(this.outputStream[i])) {
          if (i >= functionTrimIndex) {
            functionTrimIndex = -1;
          }
          break;
        }
      }
      if (functionTrimIndex != -1) {
        if (obj.isNewline) {
          includeInOutput = false;
        } else if (obj.isNonWhitespace) {
          this.MarkFunctionsShown();
        }
      } else if (obj.isNewline) {
        if (this.outputStreamEndsInNewline || !this.outputStreamContainsContent) {
          includeInOutput = false;
        }
      }
    } else if (obj instanceof ObjectValue) {
      const tableText = obj.value?.get("text");
      if (tableText instanceof StringValue && tableText.isNonWhitespace) {
        this.MarkFunctionsShown();
      }
    }
    if (includeInOutput) {
      this.outputStream.push(obj);
      this.OutputStreamDirty();
    }
  }

  protected MarkFunctionsShown(): void {
    const elements = this.callStack.elements;
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i]!;
      if (el.type == PushPopType.Function) {
        el.functionStartInOutputStream = -1;
      } else {
        break;
      }
    }
  }

  TrySplittingHeadTailWhitespace(single: StringValue): StringValue[] | null {
    return splitHeadTailWhitespace(single);
  }

  TrimWhitespaceFromFunctionEnd(): void {
    let functionStartPoint =
      this.callStack.currentElement!.functionStartInOutputStream;
    if (functionStartPoint == -1) {
      functionStartPoint = 0;
    }
    for (let i = this.outputStream.length - 1; i >= functionStartPoint; i--) {
      const obj = this.outputStream[i];
      if (obj instanceof ObjectValue) break;
      if (!(obj instanceof StringValue)) continue;
      if (obj.isNewline || obj.isInlineWhitespace) {
        this.outputStream.splice(i, 1);
        this.OutputStreamDirty();
      } else {
        break;
      }
    }
  }

  PopCallStack(popType: PushPopType | null = null): ProgramFrame | undefined {
    const element = this.callStack.currentElement!;
    if (element.type == PushPopType.Function) {
      this.TrimWhitespaceFromFunctionEnd();
    }
    const frame = this._frames.get(element);
    this.callStack.Pop(popType);
    return frame;
  }

  get outputStreamEndsInNewline(): boolean {
    for (let i = this.outputStream.length - 1; i >= 0; i--) {
      const obj = this.outputStream[i];
      if (obj instanceof ControlCommand) break;
      if (obj instanceof StringValue) {
        if (obj.isNewline) return true;
        else if (obj.isNonWhitespace) break;
      }
    }
    return false;
  }

  get outputStreamContainsContent(): boolean {
    for (const content of this.outputStream) {
      if (content instanceof StringValue || content instanceof ObjectValue) {
        return true;
      }
    }
    return false;
  }

  get inStringEvaluation(): boolean {
    this._openStringIndex = findOpenString(
      this.outputStream,
      this._openStringIndex,
    );
    return this._openStringIndex >= 0;
  }

  protected get innermostOpenString(): number {
    const stream = this.outputStream;
    if (this._openStringsStream !== stream) {
      this._openStringsStream = stream;
      this._openStrings = [];
      for (let i = 0; i < stream.length; i++) {
        if (isBeginString(stream[i])) this._openStrings.push(i);
      }
    }
    const open = this._openStrings;
    while (open.length > 0) {
      const i = open[open.length - 1]!;
      if (i < stream.length && isBeginString(stream[i])) return i;
      open.pop();
    }
    return -1;
  }

  protected ForgetOpenStrings(): void {
    this._openStringsStream = null;
  }

  CarryOutputPastCut(): void {
    if (this.outputCut === null) return;
    const cut = this.outputCut;
    this.outputCut = null;
    this.carried = {
      output: this.outputStream.splice(cut),
      lineEndPending: this.lineEndPending,
      addresses: this.heldAddresses,
    };
    this.heldAddresses = [];
    this.lineEndPending = false;
    this.outputStream.push(new StringValue("\n"));
    this.ForgetOpenStrings();
    for (const element of this.callStack.elements) {
      if (element.functionStartInOutputStream > 0) {
        element.functionStartInOutputStream = Math.max(
          0,
          element.functionStartInOutputStream - cut,
        );
      }
    }
    this.OutputStreamDirty();
  }

  CloseOutputCut(): void {
    if (this.outputCut === null) return;
    this.outputStream.splice(this.outputCut, 0, new StringValue("\n"));
    this.ForgetOpenStrings();
    this.outputCut = null;
    this.OutputStreamDirty();
  }

  TakeCarriedStep(): CarriedStep | null {
    const carried = this.carried;
    this.carried = null;
    return carried;
  }

  get holdsAddresses(): boolean {
    return (
      this.lineEndPending || this.outputCut !== null || this._holdsInherited
    );
  }

  get holdsInherited(): boolean {
    return this._holdsInherited;
  }

  JoinLineEnd(): void {
    if (this.lineEndPending) this.lineEndJoined = true;
    this.lineJoinable = false;
    this.lineEndPending = false;
  }

  TakeHeldAddresses(): number[] {
    const held = this.heldAddresses;
    this.heldAddresses = [];
    return held;
  }

  DiscardLineEnd(): void {
    this.lineEndPending = false;
    this.lineJoinable = false;
    this.outputCut = null;
    this.carried = null;
  }

  SuspendLineEnd(inStep = false): SuspendedLineEnd {
    const suspended = {
      pending: this.lineEndPending,
      joinable: this.lineJoinable,
      cut: this.outputCut,
      carried: this.carried,
      holdsInherited: this._holdsInherited,
      joined: this.lineEndJoined,
    };
    this._holdsInherited = inStep && this.holdsAddresses;
    this.lineEndPending = false;
    this.lineJoinable = false;
    this.outputCut = null;
    this.carried = null;
    return suspended;
  }

  ResumeLineEnd(suspended: SuspendedLineEnd): void {
    this.lineEndPending = suspended.pending;
    this.lineJoinable = suspended.joinable;
    this.outputCut = suspended.cut;
    this.carried = suspended.carried;
    this._holdsInherited = suspended.holdsInherited;
    this.lineEndJoined = suspended.joined;
  }

  ForceEnd(): void {
    this.callStack.Reset();
    this.DiscardLineEnd();
    this.generatedChoices.length = 0;
    this.position = null;
    this.blockStack = [];
    this.previousFlow = -1;
    this.previousAddress = -1;
    this.didSafeExit = true;
  }

  protected _textDirty = true;
  protected _tagsDirty = true;
  protected _currentText: string | null = null;
  protected _currentTags: string[] = [];

  OutputStreamDirty(): void {
    this._textDirty = true;
    this._tagsDirty = true;
  }

  get currentText(): string | null {
    if (this._textDirty) {
      const sb = new StringBuilder();
      let inTag = false;
      for (const outputObj of this.outputStream) {
        if (!inTag && outputObj instanceof StringValue) {
          sb.Append(outputObj.value);
        } else if (!inTag && outputObj instanceof ObjectValue) {
          const tableText = outputObj.value?.get("text");
          if (tableText instanceof StringValue && tableText.value) {
            sb.Append(tableText.value);
          }
        } else if (outputObj instanceof ControlCommand) {
          if (outputObj.commandType == ControlCommand.CommandType.BeginTag) {
            inTag = true;
          } else if (outputObj.commandType == ControlCommand.CommandType.EndTag) {
            inTag = false;
          }
        }
      }
      this._currentText = this._cleanWhitespace(sb.toString());
      this._textDirty = false;
    }
    return this._currentText;
  }

  get currentTags(): string[] {
    if (this._tagsDirty) {
      this._currentTags = [];
      let inTag = false;
      const sb = new StringBuilder();
      for (const outputObj of this.outputStream) {
        if (outputObj instanceof ControlCommand) {
          if (outputObj.commandType == ControlCommand.CommandType.BeginTag) {
            if (inTag && sb.Length > 0) {
              this._currentTags.push(this._cleanWhitespace(sb.toString()));
              sb.Clear();
            }
            inTag = true;
          } else if (outputObj.commandType == ControlCommand.CommandType.EndTag) {
            if (sb.Length > 0) {
              this._currentTags.push(this._cleanWhitespace(sb.toString()));
              sb.Clear();
            }
            inTag = false;
          }
        } else if (inTag) {
          if (outputObj instanceof StringValue) {
            sb.Append(outputObj.value);
          }
        } else if (
          outputObj instanceof Tag &&
          outputObj.text != null &&
          outputObj.text.length > 0
        ) {
          this._currentTags.push(outputObj.text);
        }
      }
      if (sb.Length > 0) {
        this._currentTags.push(this._cleanWhitespace(sb.toString()));
        sb.Clear();
      }
      this._tagsDirty = false;
    }
    return this._currentTags;
  }

  get currentDisplayInstructions(): ObjectValue[] {
    const result: ObjectValue[] = [];
    let inTag = false;
    for (const outputObj of this.outputStream) {
      if (outputObj instanceof ControlCommand) {
        if (outputObj.commandType == ControlCommand.CommandType.BeginTag) {
          inTag = true;
        } else if (outputObj.commandType == ControlCommand.CommandType.EndTag) {
          inTag = false;
        }
        continue;
      }
      if (!inTag && outputObj instanceof ObjectValue) {
        result.push(outputObj);
      }
    }
    return result;
  }

  GetVisitCountEntries(): [string, number][] {
    return this.countEntries(this.visits, (v) => v > 0);
  }

  GetTurnIndexEntries(): [string, number][] {
    return this.countEntries(this.turns, (t) => t !== NEVER_VISITED);
  }

  protected _countKeys: string[] | null = null;

  protected countKeys(): string[] {
    if (!this._countKeys) {
      const table = this._root.table;
      const keys: string[] = [];
      table.countIds.forEach((id, symbol) => {
        if (id >= 0) {
          keys[id] = isAnonymousSymbol(table, symbol)
            ? `#${symbol}`
            : table.symbols[symbol]!;
        }
      });
      this._countKeys = keys;
    }
    return this._countKeys;
  }

  protected countEntries(
    values: Uint32Array | Int32Array,
    held: (value: number) => boolean,
  ): [string, number][] {
    const keys = this.countKeys();
    const out: [string, number][] = [];
    values.forEach((value, id) => {
      if (held(value) && keys[id] !== undefined) {
        out.push([keys[id]!, value]);
      }
    });
    return out;
  }

  protected countIdOfKey(key: string, generation: number): number {
    const table = this._root.table;
    let symbol: number | undefined;
    if (key.startsWith("#")) {
      const saved = Number(key.slice(1));
      symbol = Number.isInteger(saved)
        ? this._root.symbolFrom(saved, generation)
        : undefined;
      if (symbol !== undefined && !isAnonymousSymbol(table, symbol)) {
        symbol = undefined;
      }
    } else {
      symbol = table.symbolIds.get(key);
    }
    return symbol === undefined || this._root.kindOf(symbol) === UNDEFINED_KIND
      ? -1
      : countIdOf(table, symbol);
  }

  ToJson(): string {
    return this.toJson();
  }

  toJson(): string {
    return this.writeState(new SessionCodec(this));
  }

  writeState(codec: StateCodec): string {
    const writer = this.stateWriter();
    codec.begin?.(writer);
    writer.WriteObjectStart();
    writer.WriteProperty("engine", "program");
    codec.header?.(writer);
    this.writeHead(writer, codec);
    writer.WriteProperty("variablesState", (w) =>
      this.variablesState.WriteJson(w),
    );
    this.writeTail(writer, codec);
    codec.counts(writer);
    codec.end?.(writer);
    writer.WriteObjectEnd();
    return writer.toString();
  }

  stateWriter(): SimpleJson.Writer {
    const writer = new SimpleJson.Writer();
    JsonSerialisation.SetWriterAnchors(
      writer,
      this.variablesState.InitTableAnchors(),
      this.variablesState.InitCellAnchors(),
    );
    return writer;
  }

  writeHead(writer: SimpleJson.Writer, codec: StateCodec): void {
    writer.WritePropertyStart("position");
    codec.position(writer, this.position);
    writer.WritePropertyEnd();
    writer.WriteProperty("evalStack", (w) =>
      JsonSerialisation.WriteListRuntimeObjs(w, this.evaluationStack),
    );
    writer.WriteProperty("output", (w) =>
      JsonSerialisation.WriteListRuntimeObjs(w, this.outputStream),
    );
    if (this.carried) {
      const carried = this.carried;
      writer.WriteProperty("carried", (w) =>
        JsonSerialisation.WriteListRuntimeObjs(w, carried.output),
      );
      writer.WriteProperty("carriedLineEndPending", carried.lineEndPending);
      if (carried.addresses.length > 0) {
        writer.WritePropertyStart("carriedAddresses");
        codec.addresses(writer, carried.addresses);
        writer.WritePropertyEnd();
      }
    }
    writer.WriteProperty("lineEndPending", this.lineEndPending);
    writer.WriteProperty("lineJoinable", this.lineJoinable);
    writer.WriteIntProperty("turnIdx", this.currentTurnIndex);
    writer.WriteIntProperty("storySeed", this.storySeed);
    writer.WriteIntProperty("previousRandom", this.previousRandom);
    this.writePreviousFlow(writer, this.previousFlow);
    if (codec instanceof SessionCodec) {
      writer.WriteIntProperty("previousAddress", this.previousAddress);
    }
    writer.WriteProperty("didSafeExit", this.didSafeExit);
  }

  writeTail(writer: SimpleJson.Writer, codec: StateCodec): void {
    writer.WriteProperty("frames", (w) =>
      this.writeFrames(w, this.callStack.elements, codec),
    );
    const threads = this.callStack._threads;
    if (threads.length > 1) {
      writer.WriteProperty("threads", (w) => {
        w.WriteArrayStart();
        for (const thread of threads.slice(0, -1)) {
          w.WriteObjectStart();
          w.WritePropertyStart("position");
          codec.position(w, this._suspended.get(thread)?.position ?? null);
          w.WritePropertyEnd();
          this.writePreviousFlow(w, this._suspended.get(thread)?.previousFlow ?? -1);
          w.WriteProperty("frames", (fw) =>
            this.writeFrames(fw, thread.callstack, codec),
          );
          w.WriteObjectEnd();
        }
        w.WriteArrayEnd();
      });
    }
    if (this.generatedChoices.length > 0) {
      writer.WriteProperty("choices", (w) => {
        w.WriteArrayStart();
        for (const choice of this.generatedChoices) {
          w.WriteObjectStart();
          w.WriteProperty("text", choice.text);
          w.WriteProperty("tags", (tw) => {
            tw.WriteArrayStart();
            for (const tag of choice.tags ?? []) {
              tw.Write(tag);
            }
            tw.WriteArrayEnd();
          });
          codec.choiceSource(w, choice);
          w.WriteProperty("isInvisibleDefault", choice.isInvisibleDefault);
          w.WritePropertyStart("target");
          codec.position(w, choice.target);
          w.WritePropertyEnd();
          this.writePreviousFlow(w, choice.previousFlow);
          w.WriteProperty("frames", (fw) =>
            this.writeFrames(
              fw,
              choice.threadAtGeneration?.callstack ?? [],
              codec,
            ),
          );
          w.WriteObjectEnd();
        }
        w.WriteArrayEnd();
      });
    }
  }

  protected writePreviousFlow(w: SimpleJson.Writer, flow: number): void {
    const name = flow >= 0 ? this._root.table.symbols[flow] : undefined;
    if (name !== undefined) {
      w.WriteProperty("previousFlow", name);
    }
  }

  protected readPreviousFlow(saved: Record<string, any>): number {
    const name = saved["previousFlow"];
    return typeof name === "string"
      ? (this._root.table.symbolIds.get(name) ?? -1)
      : -1;
  }

  protected writeFrames(
    w: SimpleJson.Writer,
    elements: readonly CallStack.Element[],
    codec: StateCodec,
  ): void {
    w.WriteArrayStart();
    for (const element of elements) {
      const frame = this._frames.get(element);
      w.WriteObjectStart();
      w.WriteIntProperty("type", element.type);
      w.WriteIntProperty("start", element.functionStartInOutputStream);
      w.WriteIntProperty("height", element.evaluationStackHeightWhenPushed);
      if (frame) {
        codec.frameSymbol(w, frame.symbol);
        w.WritePropertyStart("returnTo");
        codec.position(w, frame.returnTo);
        w.WritePropertyEnd();
        if (frame.dropResult) {
          w.WriteProperty("dropResult", true);
        }
      }
      w.WritePropertyStart("temps");
      w.WriteArrayStart();
      for (const scope of element.temporaryScopes) {
        JsonSerialisation.WriteDictionaryRuntimeObjs(w, scope);
      }
      w.WriteArrayEnd();
      w.WritePropertyEnd();
      CallStack.Thread.WriteUpvalueCells(w, "upvalues", element.openUpvalues);
      if (element.borrowedUpvalues.length > 0) {
        w.WritePropertyStart("borrowedUpvalues");
        JsonSerialisation.WriteListRuntimeObjs(w, element.borrowedUpvalues);
        w.WritePropertyEnd();
      }
      w.WriteObjectEnd();
    }
    w.WriteArrayEnd();
  }

  protected readFrames(
    frames: readonly Record<string, any>[],
    codec: StateCodec,
  ): void {
    frames.forEach((saved, i) => {
      if (i > 0) {
        const returnTo = codec.place(saved["returnTo"]);
        this.PushFrame(
          Number(saved["type"]) as PushPopType,
          {
            returnTo,
            blocks: this.blocksOf(returnTo),
            symbol: codec.readFrameSymbol(saved),
            ...(saved["dropResult"] === true ? { dropResult: true } : {}),
          },
          Number(saved["height"] ?? 0),
        );
      }
      const element = this.callStack.currentElement!;
      element.functionStartInOutputStream = Number(saved["start"] ?? 0);
      const temps = saved["temps"];
      element.temporaryScopes = Array.isArray(temps)
        ? temps.map((scope: any) =>
            JsonSerialisation.JObjectToDictionaryRuntimeObjs(scope),
          )
        : [];
      if (element.temporaryScopes.length === 0) {
        element.temporaryScopes = [new Map()];
      }
      element.openUpvalues = CallStack.Thread.ReadUpvalueCells(saved["upvalues"]);
      element.borrowedUpvalues = [];
      for (const cell of CallStack.Thread.ReadUpvalueCells(
        saved["borrowedUpvalues"],
      )) {
        element.BorrowUpvalue(cell, element);
      }
    });
  }

  copyPositional(): PositionalCopy {
    let frames = 0;
    const copyThread = (
      thread: CallStack.Thread,
      resume: SuspendedThread | undefined,
    ): ThreadCopy => {
      frames += thread.callstack.length;
      return {
        index: thread.threadIndex,
        elements: thread.callstack.map((element) => {
          const frame = this._frames.get(element);
          return {
            type: element.type,
            inExpression: element.inExpressionEvaluation,
            height: element.evaluationStackHeightWhenPushed,
            start: element.functionStartInOutputStream,
            scopes: element.temporaryScopes.map((scope) => new Map(scope)),
            open: element.openUpvalues.slice(),
            borrowed: element.borrowedUpvalues.slice(),
            frame: frame
              ? {
                  returnTo: copyPosition(this._root, frame.returnTo),
                  symbol: frame.symbol,
                  ...(frame.dropResult ? { dropResult: true } : {}),
                }
              : null,
          };
        }),
        resume: resume
          ? {
              position: copyPosition(this._root, resume.position),
              previousFlow: resume.previousFlow,
            }
          : null,
      };
    };
    const threads = this.callStack._threads;
    const copy: PositionalCopy = {
      position: copyPosition(this._root, this.position),
      evaluationStack: this.evaluationStack.slice(),
      output: this.outputStream.slice(),
      lineEndPending: this.lineEndPending,
      lineJoinable: this.lineJoinable,
      outputCut: this.outputCut,
      carried: this.carried
        ? {
            output: this.carried.output.slice(),
            lineEndPending: this.carried.lineEndPending,
            addresses: this.carried.addresses.slice(),
          }
        : null,
      heldAddresses: this.heldAddresses.slice(),
      didSafeExit: this.didSafeExit,
      turn: this.currentTurnIndex,
      seed: this.storySeed,
      previousRandom: this.previousRandom,
      previousFlow: this.previousFlow,
      previousAddress: this.previousAddress,
      threads: threads.map((thread, i) =>
        copyThread(
          thread,
          i < threads.length - 1 ? this._suspended.get(thread) : undefined,
        ),
      ),
      threadCounter: this.callStack._threadCounter,
      choices: this.generatedChoices.map((choice) => ({
        text: choice.text,
        tags: choice.tags ? choice.tags.slice() : null,
        index: choice.index,
        sourcePath: choice.sourcePath,
        isInvisibleDefault: choice.isInvisibleDefault,
        originalThreadIndex: choice.originalThreadIndex,
        target: copyPosition(this._root, choice.target)!,
        previousFlow: choice.previousFlow,
        thread: copyThread(choice.threadAtGeneration!, undefined),
      })),
      frames: 0,
    };
    copy.frames = frames;
    return copy;
  }

  placePositional(copy: PositionalCopy): PlacedPositional | undefined {
    const root = this._root;
    let unplaced = false;
    const place = (saved: PositionCopy | null): ProgramPosition | null => {
      if (!saved) {
        return null;
      }
      let position: ProgramPosition | null = null;
      const held = saved.chunk < 0 || !!root.position(saved.chunk, saved.entry);
      const after =
        held && saved.after >= 0
          ? root.position(saved.after, saved.entry - 1)
          : undefined;
      if (after) {
        position = { sequence: after.sequence, entry: after.entry + 1, offset: 0 };
      } else if (saved.chunk < 0) {
        const sequence = root.sequence(saved.sequence);
        if (sequence) {
          position = { sequence, entry: sequence.arrays.chunks.length, offset: 0 };
        }
      } else {
        const at = root.position(saved.chunk, saved.entry);
        if (at) {
          position = { sequence: at.sequence, entry: at.entry, offset: saved.offset };
        }
      }
      if (!position || !blockStackOf(root, position.sequence)) {
        unplaced = true;
        return null;
      }
      if (
        saved.flowEntry !== undefined &&
        (entryChunkOf(root, position.sequence.flow) !== saved.flowEntry ||
          sceneEntryOf(root, position.sequence) !== saved.sceneEntry)
      ) {
        unplaced = true;
        return null;
      }
      return position;
    };
    const placeThread = (thread: ThreadCopy) => ({
      copy: thread,
      returns: thread.elements.map((element) =>
        element.frame ? place(element.frame.returnTo) : null,
      ),
      resume: thread.resume ? place(thread.resume.position) : null,
    });
    const placed: PlacedPositional = {
      copy,
      position: place(copy.position),
      threads: copy.threads.map(placeThread),
      choices: copy.choices.map((choice) => ({
        target: place(choice.target),
        thread: placeThread(choice.thread),
      })),
    };
    return unplaced ? undefined : placed;
  }

  installPositional(placed: PlacedPositional): void {
    const copy = placed.copy;
    const blocksOf = (position: ProgramPosition | null): BlockEntry[] =>
      position ? (blockStackOf(this._root, position.sequence) ?? []) : [];
    const makeThread = (thread: PlacedThread): CallStack.Thread => {
      const made = new CallStack.Thread();
      made.threadIndex = thread.copy.index;
      thread.copy.elements.forEach((saved, i) => {
        const element = new CallStack.Element(saved.type, saved.inExpression);
        element.evaluationStackHeightWhenPushed = saved.height;
        element.functionStartInOutputStream = saved.start;
        element.temporaryScopes = saved.scopes.map((scope) => new Map(scope));
        element.openUpvalues = saved.open.slice();
        element.borrowedUpvalues = saved.borrowed.slice();
        if (saved.frame) {
          const returnTo = thread.returns[i] ?? null;
          this._frames.set(element, {
            returnTo,
            blocks: blocksOf(returnTo),
            symbol: placed.remap
              ? placed.remap(saved.frame.symbol)
              : saved.frame.symbol,
            ...(saved.frame.dropResult ? { dropResult: true } : {}),
          });
        }
        made.callstack.push(element);
      });
      return made;
    };
    const remap = (symbol: number) =>
      placed.remap && symbol >= 0 ? placed.remap(symbol) : symbol;
    const last = placed.threads.length - 1;
    this.evaluationStack = copy.evaluationStack.slice();
    let position = placed.position;
    const threads = placed.threads.map((thread, i) => {
      const made = makeThread(thread);
      if (thread.copy.resume) {
        const resume = thread.cuts
          ? this.applyCuts(made, thread.cuts, thread.resume, false)
          : thread.resume;
        this._suspended.set(made, {
          position: resume,
          blocks: blocksOf(resume),
          previousFlow: remap(thread.copy.resume.previousFlow),
        });
      } else if (i === last && thread.cuts) {
        position = this.applyCuts(made, thread.cuts, position, true);
      }
      return made;
    });
    this.callStack._threads = threads;
    this.callStack._threadCounter = copy.threadCounter;
    this.position = position ? { ...position } : null;
    this.blockStack = blocksOf(this.position);
    this.outputStream = copy.output.slice();
    this.ForgetOpenStrings();
    this._openStringIndex = -1;
    this.lineEndPending = copy.lineEndPending;
    this.lineJoinable = copy.lineJoinable;
    this.outputCut = copy.outputCut;
    this.carried = copy.carried
      ? {
          output: copy.carried.output.slice(),
          lineEndPending: copy.carried.lineEndPending,
          addresses: placed.remap ? [] : copy.carried.addresses.slice(),
        }
      : null;
    this.heldAddresses = placed.remap ? [] : copy.heldAddresses.slice();
    this.didSafeExit = copy.didSafeExit;
    this.currentTurnIndex = copy.turn;
    this.storySeed = copy.seed;
    this.previousRandom = copy.previousRandom;
    this.previousFlow = remap(copy.previousFlow);
    this.previousAddress = placed.remap ? -1 : copy.previousAddress;
    this.generatedChoices = copy.choices.flatMap((saved, i) => {
      const placedChoice = placed.choices[i]!;
      if (placedChoice.dropped) {
        return [];
      }
      const thread = makeThread(placedChoice.thread);
      const target = placedChoice.thread.cuts
        ? this.applyCuts(thread, placedChoice.thread.cuts, placedChoice.target, false)!
        : placedChoice.target!;
      const choice = new ProgramChoice(
        target,
        blocksOf(target),
        target.sequence.arrays.chunks[target.entry]!,
        remap(saved.previousFlow),
      );
      choice.text = saved.text;
      choice.tags = saved.tags ? saved.tags.slice() : null;
      choice.index = saved.index;
      choice.sourcePath = placedChoice.sourcePath ?? saved.sourcePath;
      choice.isInvisibleDefault = saved.isInvisibleDefault;
      choice.originalThreadIndex = saved.originalThreadIndex;
      choice.threadAtGeneration = thread;
      return [choice];
    });
    this.ResetErrors();
    this.OutputStreamDirty();
    this._noteChanged();
  }

  applyCuts(
    thread: CallStack.Thread,
    cuts: ThreadCuts,
    top: ProgramPosition | null,
    current: boolean,
  ): ProgramPosition | null {
    const elements = thread.callstack;
    const after = cuts.after.slice();
    let position = top;
    if (cuts.dropFrom >= 1 && cuts.dropFrom < elements.length) {
      for (let i = elements.length - 1; i >= cuts.dropFrom; i -= 1) {
        elements[i]!.CloseOpenUpvalues(this.callStack.cellBarrier);
      }
      elements.length = cuts.dropFrom;
      position = cuts.callerAfter ?? null;
      after[cuts.dropFrom - 1] = true;
    }
    const t = elements.length - 1;
    const restartFlow = cuts.restart ? this._root.flowNamed(cuts.restart.flow) : undefined;
    const restartKeeps = restartFlow ? 1 + flowScopesOf(this._root, restartFlow) : undefined;
    if (cuts.restart) {
      position = cuts.restart.position;
      after[t] = true;
    }
    for (let i = 0; i <= t; i += 1) {
      if (!after[i]) {
        continue;
      }
      const element = elements[i]!;
      const at = i < t ? this._frames.get(elements[i + 1]!)?.returnTo : position;
      if (at) {
        const depth = scopeDepthAt(this._root, at);
        const restarts = i === t && restartKeeps !== undefined;
        const keeps = restarts ? Math.min(depth, restartKeeps) : depth;
        while (element.temporaryScopes.length > keeps) {
          element.PopScope(this.callStack.cellBarrier);
        }
        while (restarts && element.temporaryScopes.length < depth) {
          element.PushScope();
        }
      }
      if (i < t) {
        const callee = this._frames.get(elements[i + 1]!);
        if (callee) {
          callee.dropResult = true;
        }
      } else if (current) {
        const height = element.evaluationStackHeightWhenPushed;
        if (this.evaluationStack.length > height) {
          this.evaluationStack.length = height;
        }
      }
    }
    if (cuts.restart && t >= 0) {
      this.rebindParameters(
        elements[t]!,
        cuts.restart.saved,
        cuts.restart.params,
        (restartKeeps ?? elements[t]!.temporaryScopes.length) - 1,
      );
    }
    return position;
  }

  protected rebindParameters(
    element: CallStack.Element,
    saved: readonly string[],
    params: readonly { name: string; vararg: boolean }[],
    index: number,
  ): void {
    const scopes = element.temporaryScopes;
    const scope = scopes[index];
    if (!scope) {
      return;
    }
    const values = new Map<string, InkObject>();
    for (const name of saved) {
      const value = scopes
        .slice(0, index + 1)
        .findLast((held) => held.has(name))
        ?.get(name);
      if (value !== undefined) {
        values.set(name, value);
      }
    }
    const unbound = new Set(
      [...saved, ...params.map((param) => param.name)].filter((name) => scope.has(name)),
    );
    if (unbound.size > 0) {
      element.RetireBindings(index, (name) => unbound.has(name), this.callStack.cellBarrier);
      for (const name of unbound) {
        scope.delete(name);
      }
    }
    for (const param of params) {
      scope.set(
        param.name,
        values.get(param.name) ??
          (param.vararg ? new MultiValue([]) : new NullValue()),
      );
    }
  }

  LoadJson(json: string): void {
    const obj = SimpleJson.TextToDictionary(json);
    if (obj["engine"] !== "program") {
      throw new Error("The save was not written by the program engine.");
    }
    this.readState(obj, new SessionCodec(this));
    const previous = obj["previousAddress"];
    this.previousAddress = typeof previous === "number" ? previous : -1;
  }

  readState(obj: Record<string, any>, codec: StateCodec): void {
    codec.check?.(obj);
    this.beginLoad();
    codec.beginRead?.();
    try {
      this.readHead(obj, codec);
      this.variablesState.SetJsonToken(obj["variablesState"]);
      this.readTail(obj, codec);
      this.visits = new Uint32Array(0);
      this.turns = new Int32Array(0);
      codec.readCounts(obj);
      this.endLoad();
    } finally {
      codec.endRead?.();
    }
    this.ResetErrors();
    this.OutputStreamDirty();
  }

  onBeginLoad: (() => void) | null = null;

  beginLoad(): void {
    this._noteChanged();
    this.onBeginLoad?.();
    this.generatedChoices.length = 0;
    this.images?.reset(null);
    this.beatImage = null;
    JsonSerialisation.ResetObjectLoadSession();
    const images = this.images?.images;
    JsonSerialisation.SetLoadSessionAnchorResolver((anchor) => {
      const found = this.variablesState.InitTableAtAnchor(anchor);
      if (found?.restore) images?.keepTable(found.table);
      return found;
    });
    JsonSerialisation.SetLoadSessionCellAnchorResolver((anchor) => {
      const found = this.variablesState.InitCellAtAnchor(anchor);
      if (found?.restore) images?.keepCell(found.cell);
      return found;
    });
  }

  endLoad(): void {
    JsonSerialisation.RelinkPendingDefineRefs((className) => {
      const value = this.variablesState.GetVariableWithName(className);
      return value instanceof ObjectValue ? value : null;
    });
  }

  readHead(obj: Record<string, any>, codec: StateCodec): void {
    this.position = codec.place(obj["position"]);
    this.blockStack = this.blocksOf(this.position);
    this.evaluationStack = JsonSerialisation.JArrayToRuntimeObjList(
      obj["evalStack"],
    );
    this.outputStream = JsonSerialisation.JArrayToRuntimeObjList(obj["output"]);
    this.ForgetOpenStrings();
    this._openStringIndex = -1;
    this.carried = obj["carried"]
      ? {
          output: JsonSerialisation.JArrayToRuntimeObjList(obj["carried"]),
          lineEndPending: obj["carriedLineEndPending"] === true,
          addresses: codec.readAddresses(obj["carriedAddresses"]),
        }
      : null;
    this.heldAddresses = [];
    this.lineEndPending = obj["lineEndPending"] === true;
    this.lineJoinable = obj["lineJoinable"] === true;
    this.outputCut = null;
    this.currentTurnIndex = obj["turnIdx"];
    this.storySeed = obj["storySeed"];
    this.previousRandom = obj["previousRandom"];
    this.previousFlow = this.readPreviousFlow(obj);
    this.previousAddress = -1;
    this.didSafeExit = obj["didSafeExit"] === true;
  }

  readTail(obj: Record<string, any>, codec: StateCodec): void {
    const frames = Array.isArray(obj["frames"]) ? obj["frames"] : [];
    const threads = Array.isArray(obj["threads"]) ? obj["threads"] : [];
    this.generatedChoices.length = 0;
    this.callStack.Reset();
    threads.forEach((saved: Record<string, any>, i: number) => {
      if (i > 0) {
        this.callStack.PushThread();
        this.callStack.currentThread.callstack.length = 1;
      }
      const savedFrames = Array.isArray(saved["frames"]) ? saved["frames"] : [];
      this.readFrames(savedFrames, codec);
      let resume = codec.place(saved["position"]);
      const cuts = codec.cutsOf?.(savedFrames, saved["position"]);
      if (cuts) {
        resume = this.applyCuts(this.callStack.currentThread, cuts, resume, false);
      }
      this._suspended.set(this.callStack.currentThread, {
        position: resume,
        blocks: this.blocksOf(resume),
        previousFlow: this.readPreviousFlow(saved),
      });
    });
    if (threads.length > 0) {
      this.callStack.PushThread();
      this.callStack.currentThread.callstack.length = 1;
    }
    this.readFrames(frames, codec);
    const cuts = codec.cutsOf?.(frames, obj["position"]);
    if (cuts) {
      this.position = this.applyCuts(
        this.callStack.currentThread,
        cuts,
        this.position,
        true,
      );
      this.blockStack = this.blocksOf(this.position);
    }
    const choices = Array.isArray(obj["choices"]) ? obj["choices"] : [];
    for (const saved of choices as Record<string, any>[]) {
      let target = codec.place(saved["target"]);
      if (!target) {
        codec.skip?.(saved);
        continue;
      }
      this.callStack.PushThread();
      const thread = this.callStack.currentThread;
      thread.callstack.length = 1;
      const savedFrames = Array.isArray(saved["frames"]) ? saved["frames"] : [];
      this.readFrames(savedFrames, codec);
      this.callStack._threads.pop();
      const choiceCuts = codec.cutsOf?.(savedFrames, saved["target"]);
      if (choiceCuts) {
        target = this.applyCuts(thread, choiceCuts, target, false) ?? target;
      }
      const choice = new ProgramChoice(
        target,
        this.blocksOf(target),
        target.sequence.arrays.chunks[target.entry]!,
        this.readPreviousFlow(saved),
      );
      choice.text = String(saved["text"] ?? "");
      choice.tags = Array.isArray(saved["tags"])
        ? saved["tags"].map(String)
        : [];
      choice.sourcePath = codec.readChoiceSource(saved, target);
      choice.isInvisibleDefault = saved["isInvisibleDefault"] === true;
      choice.threadAtGeneration = thread;
      this.generatedChoices.push(choice);
    }
  }

  SetCount(id: number, visits: number | null, turn: number | null): void {
    if (id < 0) {
      return;
    }
    this.growCounts(id);
    if (visits !== null) this.visits[id] = visits;
    if (turn !== null) this.turns[id] = turn;
  }

  CountIdOfKey(key: string, generation: number): number {
    return this.countIdOfKey(key, generation);
  }

  placePosition(saved: unknown): ProgramPosition | null {
    if (!Array.isArray(saved)) {
      return null;
    }
    const [id, entry, offset, sequenceId] = saved as [
      number,
      number,
      number,
      number,
    ];
    if (id === -1) {
      const sequence = this._root.sequence(sequenceId);
      if (!sequence) {
        throw new Error(
          "The saved position is in a flow this program no longer has.",
        );
      }
      return { sequence, entry: sequence.arrays.chunks.length, offset: 0 };
    }
    const placed = this._root.position(id, entry);
    if (!placed) {
      throw new Error(
        "The saved position is in a statement this program no longer has.",
      );
    }
    return { sequence: placed.sequence, entry: placed.entry, offset };
  }

  blocksOf(position: ProgramPosition | null): BlockEntry[] {
    if (!position) {
      return [];
    }
    const blocks = blockStackOf(this._root, position.sequence);
    if (!blocks) {
      throw new Error(
        "The saved position is in a block this program no longer has.",
      );
    }
    return blocks;
  }
}

export interface StateCodec {
  begin?(writer: SimpleJson.Writer): void;
  header?(writer: SimpleJson.Writer): void;
  end?(writer: SimpleJson.Writer): void;
  position(writer: SimpleJson.Writer, position: ProgramPosition | null): void;
  frameSymbol(writer: SimpleJson.Writer, symbol: number): void;
  choiceSource(writer: SimpleJson.Writer, choice: ProgramChoice): void;
  addresses(writer: SimpleJson.Writer, addresses: readonly number[]): void;
  counts(writer: SimpleJson.Writer): void;
  check?(obj: Record<string, any>): void;
  cutsOf?(frames: readonly unknown[], position: unknown): ThreadCuts | undefined;
  skip?(saved: unknown): void;
  beginRead?(): void;
  endRead?(): void;
  place(saved: unknown): ProgramPosition | null;
  readFrameSymbol(saved: Record<string, any>): number;
  readChoiceSource(saved: Record<string, any>, target: ProgramPosition): string;
  readAddresses(saved: unknown): number[];
  readCounts(obj: Record<string, any>): void;
}

class SessionCodec implements StateCodec {
  constructor(protected _state: ProgramStoryState) {}

  position(writer: SimpleJson.Writer, position: ProgramPosition | null): void {
    writePosition(writer, position);
  }

  frameSymbol(writer: SimpleJson.Writer, symbol: number): void {
    writer.WriteIntProperty("symbol", symbol);
  }

  choiceSource(writer: SimpleJson.Writer, choice: ProgramChoice): void {
    writer.WriteProperty("sourcePath", choice.sourcePath);
  }

  addresses(writer: SimpleJson.Writer, addresses: readonly number[]): void {
    writer.WriteInjected(addresses.slice());
  }

  readAddresses(saved: unknown): number[] {
    return Array.isArray(saved)
      ? saved.filter((a): a is number => Number.isInteger(a) && a >= 0)
      : [];
  }

  counts(writer: SimpleJson.Writer): void {
    const state = this._state;
    writer.WriteIntProperty("countGeneration", state.root.generation);
    writer.WriteProperty("visitCounts", (w) =>
      writeCounts(w, state.GetVisitCountEntries()),
    );
    writer.WriteProperty("turnIndices", (w) =>
      writeCounts(w, state.GetTurnIndexEntries()),
    );
  }

  place(saved: unknown): ProgramPosition | null {
    return this._state.placePosition(saved);
  }

  readFrameSymbol(saved: Record<string, any>): number {
    return Number(saved["symbol"] ?? -1);
  }

  readChoiceSource(saved: Record<string, any>): string {
    return String(saved["sourcePath"] ?? "");
  }

  readCounts(obj: Record<string, any>): void {
    const state = this._state;
    const generation = Number(obj["countGeneration"] ?? state.root.generation);
    for (const [key, visits] of Object.entries(obj["visitCounts"] ?? {})) {
      state.SetCount(state.CountIdOfKey(key, generation), Number(visits), null);
    }
    for (const [key, turn] of Object.entries(obj["turnIndices"] ?? {})) {
      state.SetCount(state.CountIdOfKey(key, generation), null, Number(turn));
    }
  }
}

const writeCounts = (
  writer: SimpleJson.Writer,
  entries: readonly [string, number][],
): void => {
  writer.WriteObjectStart();
  for (const [key, value] of entries) {
    writer.WriteIntProperty(key, value);
  }
  writer.WriteObjectEnd();
};

const writePosition = (
  writer: SimpleJson.Writer,
  position: ProgramPosition | null,
): void => {
  if (!position) {
    writer.WriteNull();
    return;
  }
  const chunk = position.sequence.arrays.chunks[position.entry];
  writer.WriteArrayStart();
  writer.WriteInt(chunk ? chunkId(chunk) : -1);
  writer.WriteInt(position.entry);
  writer.WriteInt(position.offset);
  writer.WriteInt(position.sequence.id);
  writer.WriteArrayEnd();
};

function showsOutput(obj: InkObject | null): boolean {
  if (obj instanceof StringValue) return /[^ \t\n]/.test(obj.value ?? "");
  if (obj instanceof ObjectValue || obj instanceof Tag) return true;
  return (
    obj instanceof ControlCommand &&
    obj.commandType == ControlCommand.CommandType.BeginTag
  );
}
