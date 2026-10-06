// Loads the engine's modules in the order that settles their import cycle
// (see `CompilationAnnotator`).
import "../inkjs/engine/Container";
import { ControlCommand } from "../inkjs/engine/ControlCommand";
import type { RaisedError } from "../inkjs/engine/Error";
import { JsonSerialisation } from "../inkjs/engine/JsonSerialisation";
import type { InkObject } from "../inkjs/engine/Object";
import { PRNG } from "../inkjs/engine/PRNG";
import { PushPopType } from "../inkjs/engine/PushPop";
import { SimpleJson } from "../inkjs/engine/SimpleJson";
import { StringBuilder } from "../inkjs/engine/StringBuilder";
import { Tag } from "../inkjs/engine/Tag";
import { ObjectValue, StringValue } from "../inkjs/engine/Value";
import type { VariablesState } from "../inkjs/engine/VariablesState";
import { CallStack } from "../inkjs/engine/CallStack";
import {
  findOpenString,
  isBeginString,
  splitHeadTailWhitespace,
} from "../inkjs/engine/outputWhitespace";
import type { ProgramRoot, SequenceRow } from "./ProgramRoot";
import { UNDEFINED_KIND, countIdOf, isAnonymousSymbol } from "./ProgramSymbols";
import {
  BLOCK_FUNCTION,
  blockFlags,
  chunkId,
  type StatementChunk,
} from "./StatementChunk";
import { Choice } from "../inkjs/engine/Choice";

/** Where the engine stands: an entry of a sequence and an offset into that
 *  entry's code. An offset past the end of a chunk's code is the start of the
 *  next entry. */
export interface ProgramPosition {
  sequence: SequenceRow;
  entry: number;
  offset: number;
}

/** A block the frame is inside: the owner's sequence and entry, and the
 *  block's index in the owner's block table, whose row gives where the owner
 *  resumes (docs/engine/binary-program.md, section 1). */
export interface BlockEntry {
  sequence: SequenceRow;
  entry: number;
  block: number;
}

/** What the program engine keeps of a call frame beside the call stack
 *  element that holds its temporaries (docs/engine/binary-program.md,
 *  section 7): the position its caller resumes at when it returns, with the
 *  blocks the caller was inside, and the function it runs. A frame a host
 *  pushed, to call a function from outside the story, resumes nothing. */
export interface ProgramFrame {
  returnTo: ProgramPosition | null;
  blocks: BlockEntry[];
  /** The symbol of the function the frame runs. */
  symbol: number;
}

/** The blocks the position in `sequence` is inside, outermost first, which
 *  follow from the position alone: the owner of each body, up to the flow or
 *  up to the body of the function the position is in, whose frame begins at
 *  that body, or nothing when an owner is not in `root`. */
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

/** Where a thread a fork suspended resumes, the blocks it is inside there,
 *  and the flow its last instruction ran in (`previousFlow`), which each
 *  thread of the current engine keeps as its own previous pointer. */
interface SuspendedThread {
  position: ProgramPosition | null;
  blocks: BlockEntry[];
  previousFlow: number;
}

/** A choice the program engine raised (`Choice`): as the current engine's
 *  choice, with its text, tags, index, whether it is an invisible default and
 *  the thread it holds, and in place of paths, the address of its `Choice`
 *  instruction as `sourcePath`, its identity (docs/engine/binary-program.md,
 *  section 4), and where it leads: its entry, the blocks the entry is inside,
 *  and the chunk that raised it. `previousFlow` is the flow the choice was
 *  raised in, which an invisible default taken by itself is entered from. */
export class ProgramChoice extends Choice {
  constructor(
    readonly target: ProgramPosition,
    readonly blocks: BlockEntry[],
    readonly chunk: StatementChunk,
    readonly previousFlow: number,
  ) {
    super();
  }
}

/** The turn a count id that was never visited holds. */
const NEVER_VISITED = -0x80000000;

/** A frame of a thread's copy: the original's, with a position and blocks of
 *  its own, since the engine moves a position in place. */
const copyFrame = (frame: ProgramFrame): ProgramFrame => ({
  returnTo: frame.returnTo ? { ...frame.returnTo } : null,
  blocks: frame.blocks.slice(),
  symbol: frame.symbol,
});

/** The output a cut carried to the next continue, and whether its own line
 *  waits for its newline (`StoryState.CarryOutputPastCut`). */
interface CarriedStep {
  output: InkObject[];
  lineEndPending: boolean;
}

/** A line end a call from a host suspended (`SuspendLineEnd`). */
export interface SuspendedLineEnd {
  pending: boolean;
  joinable: boolean;
  cut: number | null;
  carried: CarriedStep | null;
}

/** What the program engine's state hands a caller that reads a story's
 *  pointer: it names no runtime path. */
export const NO_POINTER = Object.freeze({
  isNull: true,
  path: null,
  container: null,
  copy() {
    return NO_POINTER;
  },
});

/**
 * The state of the program engine: its position and the blocks it is inside,
 * its call frames, the eval stack and output, the errors of the continue in
 * progress, the globals, and the temporaries of each frame, which are the
 * scopes of the elements of the call stack its globals were made with (the
 * current engine's story copy, see `ProgramStory`), as `VariablesState` reads
 * and writes them. A call pushes an element and the program frame beside it
 * (`frameOf`), and a return pops them.
 *
 * The output is the current engine's, member for member, so that the builtins
 * a chunk calls (`display`) read and write it as they read and write a
 * `StoryState`: the newline rule and the splitting of a pushed string's
 * surrounding whitespace (`PushToOutputStreamIndividual`,
 * `TrySplittingHeadTailWhitespace`), a function's rule of dropping the
 * newlines it writes until it shows something and trimming its trailing
 * whitespace when it returns, a line end that waits (`lineEndPending`), the
 * offer to join a line that begins with `..` (`lineJoinable`), and the cut
 * that ends a continue at a waiting line end when something shows, whose
 * output is carried to the next continue.
 */
export class ProgramStoryState {
  position: ProgramPosition | null = null;
  /** The blocks the position is inside, outermost first, from the body of
   *  the function the frame runs, or from the flow. */
  blockStack: BlockEntry[] = [];
  evaluationStack: InkObject[] = [];
  outputStream: InkObject[] = [];
  lineEndPending = false;
  lineJoinable = false;
  outputCut: number | null = null;
  carried: CarriedStep | null = null;
  didSafeExit = false;
  currentTurnIndex = -1;
  storySeed: number;
  previousRandom = 0;
  /** The symbol of the flow the current thread's last instruction ran in, or
   *  -1: what a path chosen without resetting the call stack is entered
   *  from, as the current engine's thread keeps its `previousPointer`. A fork
   *  suspends it with the thread it forks, a forced end clears it, and a
   *  save writes it by name, for each thread. */
  previousFlow = -1;

  protected _currentErrors: string[] | null = null;
  protected _currentWarnings: string[] | null = null;
  protected _raisedErrors: RaisedError[] = [];
  protected _raisedWarnings: RaisedError[] = [];
  /** Where `inStringEvaluation` last found the open string
   *  (`findOpenString`). */
  protected _openStringIndex = -1;
  /** The open `BeginString` indices and the stream they index
   *  (`innermostOpenString`). */
  protected _openStrings: number[] = [];
  protected _openStringsStream: InkObject[] | null = null;
  /** The program frame of each call stack element a call pushed. */
  protected _frames = new WeakMap<CallStack.Element, ProgramFrame>();
  /** Where each thread below the current one resumes when the threads
   *  above it end, and the blocks it is inside there (`ForkThread`). */
  protected _suspended = new WeakMap<CallStack.Thread, SuspendedThread>();

  /** The visits of each counted symbol, by count id
   *  (docs/engine/binary-program.md, section 5). */
  visits = new Uint32Array(0);
  /** The turn of each counted symbol's last visit, by count id, or
   *  `NEVER_VISITED`. */
  turns = new Int32Array(0);
  /** The count ids whose visits, and whose turns, changed since each was
   *  last drained; a checkpoint drains the two apart, as the current
   *  engine's state keeps them. */
  protected _changedVisits = new Set<number>();
  protected _changedTurns = new Set<number>();

  /** `_noteChanged` tells the story its state is no longer the one a reset
   *  made, as a load does (`Story.NoteStateChanged`). */
  constructor(
    protected _root: ProgramRoot,
    public variablesState: VariablesState,
    protected _cleanWhitespace: (text: string) => string,
    protected _noteChanged: () => void = () => {},
    /** The call stack `variablesState` reads temporaries from. */
    public callStack: CallStack,
  ) {
    this.storySeed = new PRNG(new Date().getTime()).next() % 100;
  }

  /** The frame the engine runs in: the call stack's current element, whose
   *  scopes hold the temporaries. */
  get frame(): CallStack.Element | null {
    return this.callStack.currentElement ?? null;
  }

  /** The program frame beside call stack element `element`, or nothing for
   *  the flow's own element. */
  frameOf(element: CallStack.Element): ProgramFrame | undefined {
    return this._frames.get(element);
  }

  /** Pushes a call frame of `type`: its element, with the output's length
   *  as where the function starts writing, and beside it the program frame
   *  that returns to `returnTo` inside `blocks`. */
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

  // ------------------------------------------------------------- threads

  /** Forks the current thread (`Thread`): the current thread is suspended,
   *  to resume at `resumeAt` inside the blocks it is in now, and a copy of
   *  it, frames and temporaries included, becomes the current thread and
   *  runs on from the position. The copy's frames are the original's, with
   *  positions of their own. */
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

  /** Whether a `Done`, or a flow that runs out, ends a forked thread rather
   *  than the flow. */
  get canPopThread(): boolean {
    return this.callStack.canPopThread;
  }

  /** Ends the current thread and resumes the one below it where its fork
   *  left it (`StoryState`'s `PopThread`). */
  PopThread(): void {
    this.callStack.PopThread();
    const resumed = this._suspended.get(this.callStack.currentThread);
    this.position = resumed?.position
      ? { ...resumed.position }
      : null;
    this.blockStack = resumed?.blocks.slice() ?? [];
    this.previousFlow = resumed?.previousFlow ?? -1;
  }

  // -------------------------------------------------------------- counts

  /** Raises the visits of count id `id` and records the turn
   *  (`Visit`). */
  Visit(id: number): void {
    if (id < 0) {
      return;
    }
    this.growCounts(id);
    this.visits[id] = this.visits[id]! + 1;
    this.turns[id] = this.currentTurnIndex;
    this._changedVisits.add(id);
    this._changedTurns.add(id);
  }

  /** The visits of count id `id`. */
  VisitCount(id: number): number {
    return id >= 0 ? (this.visits[id] ?? 0) : 0;
  }

  /** The turns since count id `id` was last visited, or -1 for never. A
   *  visit before the first turn records turn -1, as the current engine's
   *  does, so "never" is a turn of its own (`NEVER_VISITED`). */
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

  /** The choices raised and waiting, in the order they were raised; none
   *  while the story can continue, since choices come at the end of a
   *  continue (`StoryState.currentChoices`). */
  get currentChoices(): ProgramChoice[] {
    return this.canContinue ? [] : this.generatedChoices;
  }

  /** Every choice raised since the last one was taken. */
  generatedChoices: ProgramChoice[] = [];

  /** A copy of the current thread, frames and temporaries included, for a
   *  choice to hold: taking the choice runs on in it
   *  (`CallStack.ForkThread`). */
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

  /** Makes the thread a choice holds the only thread, and clears the
   *  choices: the story runs on in the thread the choice was raised in
   *  (`Story.ChooseChoice`, `StoryState.SetChosenPath`). The choice's thread
   *  is used once, since the choices are cleared with it. */
  TakeChoice(choice: ProgramChoice): void {
    this.callStack.currentThread = choice.threadAtGeneration!;
    this.generatedChoices.length = 0;
    this.position = { ...choice.target };
    this.blockStack = choice.blocks.slice();
    this.didSafeExit = false;
  }

  // The engine runs one flow at a time.
  get callstackDepth(): number {
    return this.callStack.depth;
  }

  get currentPointer() {
    return this.position ? { ...NO_POINTER, isNull: false } : NO_POINTER;
  }

  get previousPointer() {
    return NO_POINTER;
  }

  get currentPathString(): string | null {
    return null;
  }

  // ------------------------------------------------------------- the output

  PushEvaluationStack(obj: InkObject): void {
    this.evaluationStack.push(obj);
  }

  PopEvaluationStack(): InkObject;
  PopEvaluationStack(count: number): InkObject[];
  PopEvaluationStack(count?: number): InkObject | InkObject[] {
    if (count === undefined) {
      // One pop from an empty stack gives null, as the current engine's
      // does (`StoryState.PopEvaluationStack`): the arm of a `match` whose
      // key is not a name compares the value with its own copy and pops the
      // copy the comparison already took.
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
    // Every `BeginString` reaches the stream through here, at its end.
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
        // A function called from inside the open string (its start is after
        // the string's `BeginString`) still drops newlines until it shows
        // something, as it does outside a string; a string opened inside the
        // function keeps its literal newlines (`StoryState.PushToOutputStream`).
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

  /** Writes one piece of output under the newline rule: inside a function
   *  that has shown nothing yet, a newline is dropped; elsewhere a newline is
   *  written unless the output already ends in one or holds nothing
   *  (`StoryState.PushToOutputStreamIndividual`). */
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
      // Inside a function, a display table with visible words ends the
      // stretch at the function's start where newlines are dropped, as
      // non-whitespace text does.
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

  // The functions on top of the call stack have shown something, so their
  // newlines are no longer dropped.
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

  /** Drops the newlines and inline whitespace a function wrote at its end,
   *  as its return does (`StoryState.TrimWhitespaceFromFunctionEnd`). */
  TrimWhitespaceFromFunctionEnd(): void {
    let functionStartPoint =
      this.callStack.currentElement!.functionStartInOutputStream;
    if (functionStartPoint == -1) {
      functionStartPoint = 0;
    }
    for (let i = this.outputStream.length - 1; i >= functionStartPoint; i--) {
      const obj = this.outputStream[i];
      // A display table is content, as visible text is.
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

  /** Pops the current call frame, trimming a function's trailing whitespace
   *  first (`StoryState.PopCallStack`), and returns its program frame. */
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

  // The index of the innermost open `BeginString`, or -1. `_openStrings` holds
  // the index of each `BeginString` pushed, innermost last; a string that has
  // closed leaves its index past the stream's end or on other content, and
  // falls off here. The stack is rebuilt with one scan when the stream is
  // replaced or rewritten below its end, so a push costs the same however
  // long a string has been open (#1134).
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

  /** Ends this continue's output at `outputCut` with the newline the cut line
   *  was waiting for, and carries the output after it to the next continue.
   *  A function that began before the cut starts at the head of that
   *  output. */
  CarryOutputPastCut(): void {
    if (this.outputCut === null) return;
    const cut = this.outputCut;
    this.outputCut = null;
    this.carried = {
      output: this.outputStream.splice(cut),
      lineEndPending: this.lineEndPending,
    };
    this.lineEndPending = false;
    this.outputStream.push(new StringValue("\n"));
    this.ForgetOpenStrings();
    // A start of -1 marks a function that has shown something, whose
    // newlines are no longer dropped, and stays as it is.
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

  /** Writes the newline at `outputCut` and keeps the output after it, for a
   *  step that leaves no next continue to carry it to. */
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

  DiscardLineEnd(): void {
    this.lineEndPending = false;
    this.lineJoinable = false;
    this.outputCut = null;
    this.carried = null;
  }

  // A call that runs against an output stream of its own, whose output never
  // reaches the story's steps, neither writes a pending newline, cuts a step
  // nor starts from a carried step: it suspends them and resumes them with
  // the stream it restores (`StoryState.SuspendLineEnd`).
  SuspendLineEnd(): SuspendedLineEnd {
    const suspended = {
      pending: this.lineEndPending,
      joinable: this.lineJoinable,
      cut: this.outputCut,
      carried: this.carried,
    };
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
  }

  /** Ends the flow, with a fresh frame for the next, as the current engine's
   *  `StoryState.ForceEnd` resets its call stack: a `ChoosePathString` that
   *  resets the call stack keeps no temporary, no scope and no function frame
   *  of the flow it left. */
  ForceEnd(): void {
    this.callStack.Reset();
    this.DiscardLineEnd();
    this.generatedChoices.length = 0;
    this.position = null;
    this.blockStack = [];
    this.previousFlow = -1;
    this.didSafeExit = true;
  }

  // ------------------------------------------------- what the output reads as

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

  // ------------------------------------------------------------------- saving

  // The counts are keyed outside the engine by their symbol's qualified name,
  // or `#<id>` for an anonymous symbol of this root's table generation, as
  // the current engine keys them by path (the checkpoint store's readers).

  /** Each counted symbol that was visited, by its key, with its visits. */
  GetVisitCountEntries(): [string, number][] {
    return this.countEntries(this.visits, (v) => v > 0);
  }

  /** Each counted symbol that was visited, by its key, with the turn of its
   *  last visit. */
  GetTurnIndexEntries(): [string, number][] {
    return this.countEntries(this.turns, (t) => t !== NEVER_VISITED);
  }

  DrainVisitCountDeltas(): [string, number][] {
    const out = this.changedEntries(this.visits, this._changedVisits);
    this._changedVisits.clear();
    return out;
  }

  DrainTurnIndexDeltas(): [string, number][] {
    const out = this.changedEntries(this.turns, this._changedTurns);
    this._changedTurns.clear();
    return out;
  }

  ResetCountDeltaTracking(): void {
    this._changedVisits.clear();
    this._changedTurns.clear();
  }

  // The key of each count id of the root's table.
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

  protected changedEntries(
    values: Uint32Array | Int32Array,
    changed: ReadonlySet<number>,
  ): [string, number][] {
    const keys = this.countKeys();
    return [...changed]
      .filter((id) => keys[id] !== undefined)
      .map((id) => [keys[id]!, values[id]!]);
  }

  /** The count id a saved key names in this root, or -1: a qualified name,
   *  or an anonymous symbol of `generation`, taken through the reseeds since
   *  it (`ProgramRoot.symbolFrom`). A symbol this root does not define has
   *  none, though the compiler's table may keep its name until a reseed: a
   *  count saved under a name the program no longer has is dropped
   *  (docs/engine/binary-program.md, section 2). */
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

  /** The state as JSON: the position as a chunk id, its entry and offset and
   *  its sequence's id, the output and eval stack, the line end, the globals,
   *  and the call frames, each with its temporaries scope by scope, the
   *  upvalue cells still open on it and, for a frame a call pushed, the
   *  position its caller resumes at and the symbol of its function; the
   *  threads a fork suspended, each with where it resumes and its frames; and
   *  unless `withCounts` is false, the visits and turns of the counted
   *  symbols, keyed by their names (`GetVisitCountEntries`). A position past
   *  the last statement of its sequence, where a flow rests after its last
   *  beat, has no chunk: it is written with chunk id -1 and named by its
   *  sequence alone. The blocks a position is inside are not written: they
   *  follow from its sequence. A position holds within a session, for as
   *  long as a root holds its chunk or, past the last statement, its
   *  sequence. `ToJson` is the same, under the current engine's other name
   *  for it (`StoryState.ToJson`). */
  ToJson(): string {
    return this.toJson();
  }

  toJson(withCounts = true): string {
    const writer = new SimpleJson.Writer();
    JsonSerialisation.SetWriterAnchors(
      writer,
      this.variablesState.InitTableAnchors(),
      this.variablesState.InitCellAnchors(),
    );
    writer.WriteObjectStart();
    writer.WriteProperty("engine", "program");
    writer.WritePropertyStart("position");
    writePosition(writer, this.position);
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
    }
    writer.WriteProperty("lineEndPending", this.lineEndPending);
    writer.WriteProperty("lineJoinable", this.lineJoinable);
    writer.WriteIntProperty("turnIdx", this.currentTurnIndex);
    writer.WriteIntProperty("storySeed", this.storySeed);
    writer.WriteIntProperty("previousRandom", this.previousRandom);
    this.writePreviousFlow(writer, this.previousFlow);
    writer.WriteProperty("didSafeExit", this.didSafeExit);
    writer.WriteProperty("variablesState", (w) =>
      this.variablesState.WriteJson(w),
    );
    writer.WriteProperty("frames", (w) =>
      this.writeFrames(w, this.callStack.elements),
    );
    // The threads a fork suspended, from the outermost: each with the
    // position it resumes at and its frames.
    const threads = this.callStack._threads;
    if (threads.length > 1) {
      writer.WriteProperty("threads", (w) => {
        w.WriteArrayStart();
        for (const thread of threads.slice(0, -1)) {
          w.WriteObjectStart();
          w.WritePropertyStart("position");
          writePosition(w, this._suspended.get(thread)?.position ?? null);
          w.WritePropertyEnd();
          this.writePreviousFlow(w, this._suspended.get(thread)?.previousFlow ?? -1);
          w.WriteProperty("frames", (fw) =>
            this.writeFrames(fw, thread.callstack),
          );
          w.WriteObjectEnd();
        }
        w.WriteArrayEnd();
      });
    }
    // The choices waiting, each with what it shows, its identity, its entry
    // and the frames of the thread it holds (`StoryState`'s `WriteChoice`).
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
          w.WriteProperty("sourcePath", choice.sourcePath);
          w.WriteProperty("isInvisibleDefault", choice.isInvisibleDefault);
          w.WritePropertyStart("target");
          writePosition(w, choice.target);
          w.WritePropertyEnd();
          this.writePreviousFlow(w, choice.previousFlow);
          w.WriteProperty("frames", (fw) =>
            this.writeFrames(fw, choice.threadAtGeneration?.callstack ?? []),
          );
          w.WriteObjectEnd();
        }
        w.WriteArrayEnd();
      });
    }
    // Without its counts, the state keeps both slots empty, which a
    // checkpoint fills with the entries it keeps apart
    // (`CheckpointStore.injectCounts`).
    writer.WriteIntProperty("countGeneration", this._root.generation);
    writer.WriteProperty("visitCounts", (w) =>
      writeCounts(w, withCounts ? this.GetVisitCountEntries() : []),
    );
    writer.WriteProperty("turnIndices", (w) =>
      writeCounts(w, withCounts ? this.GetTurnIndexEntries() : []),
    );
    writer.WriteObjectEnd();
    return writer.toString();
  }

  /** Writes a thread's `previousFlow` by its qualified name, or nothing for
   *  none. */
  protected writePreviousFlow(w: SimpleJson.Writer, flow: number): void {
    const name = flow >= 0 ? this._root.table.symbols[flow] : undefined;
    if (name !== undefined) {
      w.WriteProperty("previousFlow", name);
    }
  }

  /** The `previousFlow` a saved thread names, or -1. */
  protected readPreviousFlow(saved: Record<string, any>): number {
    const name = saved["previousFlow"];
    return typeof name === "string"
      ? (this._root.table.symbolIds.get(name) ?? -1)
      : -1;
  }

  /** The state with both count slots empty, which a checkpoint fills with
   *  the entries it keeps apart (`GetVisitCountEntries`). */
  ToJsonWithoutCounts(): string {
    return this.toJson(false);
  }

  // Each element of a thread's call stack: its type, where its function
  // started writing, the eval stack's height it was pushed at, for a frame a
  // call pushed its function's symbol and the position its caller resumes
  // at, its temporaries scope by scope and the upvalue cells still open on
  // it.
  protected writeFrames(
    w: SimpleJson.Writer,
    elements: readonly CallStack.Element[],
  ): void {
    w.WriteArrayStart();
    for (const element of elements) {
      const frame = this._frames.get(element);
      w.WriteObjectStart();
      w.WriteIntProperty("type", element.type);
      w.WriteIntProperty("start", element.functionStartInOutputStream);
      w.WriteIntProperty("height", element.evaluationStackHeightWhenPushed);
      if (frame) {
        w.WriteIntProperty("symbol", frame.symbol);
        w.WritePropertyStart("returnTo");
        writePosition(w, frame.returnTo);
        w.WritePropertyEnd();
      }
      w.WritePropertyStart("temps");
      w.WriteArrayStart();
      for (const scope of element.temporaryScopes) {
        JsonSerialisation.WriteDictionaryRuntimeObjs(w, scope);
      }
      w.WriteArrayEnd();
      w.WritePropertyEnd();
      // The cells still open on the frame, by the ids the closures holding
      // them are written with, as the current engine's frames write them.
      CallStack.Thread.WriteUpvalueCells(w, "upvalues", element.openUpvalues);
      w.WriteObjectEnd();
    }
    w.WriteArrayEnd();
  }

  // Fills the current thread's call stack from saved frames.
  protected readFrames(frames: readonly Record<string, any>[]): void {
    frames.forEach((saved, i) => {
      if (i > 0) {
        const returnTo = this.placePosition(saved["returnTo"]);
        this.PushFrame(
          Number(saved["type"]) as PushPopType,
          {
            returnTo,
            blocks: this.blocksOf(returnTo),
            symbol: Number(saved["symbol"] ?? -1),
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
    });
  }

  /** Restores a state `toJson` wrote. Each position is placed through the
   *  root, which must still hold the chunk it names, or for a position past
   *  the last statement of its sequence, the sequence; a position in a
   *  statement or flow the program no longer has is refused, since placing
   *  one is the saved form's work (docs/engine/binary-program.md, section 8). */
  LoadJson(json: string): void {
    const obj = SimpleJson.TextToDictionary(json);
    if (obj["engine"] !== "program") {
      throw new Error("The save was not written by the program engine.");
    }
    this._noteChanged();
    this.generatedChoices.length = 0;
    // A fresh identity registry for this load, as `StoryState.LoadJsonObj`
    // opens one: a table reference resolves against the tables this load
    // reads, never a previous load's.
    JsonSerialisation.ResetObjectLoadSession();
    JsonSerialisation.SetLoadSessionAnchorResolver((anchor) =>
      this.variablesState.InitTableAtAnchor(anchor),
    );
    JsonSerialisation.SetLoadSessionCellAnchorResolver((anchor) =>
      this.variablesState.InitCellAtAnchor(anchor),
    );
    this.position = this.placePosition(obj["position"]);
    this.blockStack = this.blocksOf(this.position);
    this.evaluationStack = JsonSerialisation.JArrayToRuntimeObjList(
      obj["evalStack"],
    );
    this.outputStream = JsonSerialisation.JArrayToRuntimeObjList(obj["output"]);
    this.ForgetOpenStrings();
    this.carried = obj["carried"]
      ? {
          output: JsonSerialisation.JArrayToRuntimeObjList(obj["carried"]),
          lineEndPending: obj["carriedLineEndPending"] === true,
        }
      : null;
    this.lineEndPending = obj["lineEndPending"] === true;
    this.lineJoinable = obj["lineJoinable"] === true;
    this.outputCut = null;
    this.currentTurnIndex = obj["turnIdx"];
    this.storySeed = obj["storySeed"];
    this.previousRandom = obj["previousRandom"];
    this.previousFlow = this.readPreviousFlow(obj);
    this.didSafeExit = obj["didSafeExit"] === true;
    this.variablesState.SetJsonToken(obj["variablesState"]);
    const frames = Array.isArray(obj["frames"]) ? obj["frames"] : [];
    const threads = Array.isArray(obj["threads"]) ? obj["threads"] : [];
    this.callStack.Reset();
    // The suspended threads from the outermost, each with where it resumes,
    // then the current one.
    threads.forEach((saved: Record<string, any>, i: number) => {
      if (i > 0) {
        this.callStack.PushThread();
        this.callStack.currentThread.callstack.length = 1;
      }
      this.readFrames(Array.isArray(saved["frames"]) ? saved["frames"] : []);
      const resume = this.placePosition(saved["position"]);
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
    this.readFrames(frames);
    // Each waiting choice's thread is read as a thread of the stack, which
    // the choice then holds apart from it.
    const choices = Array.isArray(obj["choices"]) ? obj["choices"] : [];
    for (const saved of choices as Record<string, any>[]) {
      const target = this.placePosition(saved["target"]);
      if (!target) {
        continue;
      }
      this.callStack.PushThread();
      const thread = this.callStack.currentThread;
      thread.callstack.length = 1;
      this.readFrames(Array.isArray(saved["frames"]) ? saved["frames"] : []);
      this.callStack._threads.pop();
      const choice = new ProgramChoice(
        target,
        this.blocksOf(target),
        target.sequence.arrays.chunks[target.entry]!,
        this.readPreviousFlow(saved),
      );
      choice.text = String(saved["text"] ?? "");
      choice.tags = Array.isArray(saved["tags"]) ? saved["tags"].map(String) : [];
      choice.sourcePath = String(saved["sourcePath"] ?? "");
      choice.isInvisibleDefault = saved["isInvisibleDefault"] === true;
      choice.threadAtGeneration = thread;
      this.generatedChoices.push(choice);
    }
    this.visits = new Uint32Array(0);
    this.turns = new Int32Array(0);
    this.ResetCountDeltaTracking();
    const generation = Number(obj["countGeneration"] ?? this._root.generation);
    for (const [key, visits] of Object.entries(obj["visitCounts"] ?? {})) {
      const id = this.countIdOfKey(key, generation);
      if (id >= 0) {
        this.growCounts(id);
        this.visits[id] = Number(visits);
      }
    }
    for (const [key, turn] of Object.entries(obj["turnIndices"] ?? {})) {
      const id = this.countIdOfKey(key, generation);
      if (id >= 0) {
        this.growCounts(id);
        this.turns[id] = Number(turn);
      }
    }
    // A `new`-instance table saved with its class's name links again to the
    // live class global, now that the globals are loaded.
    JsonSerialisation.RelinkPendingDefineRefs((className) => {
      const value = this.variablesState.GetVariableWithName(className);
      return value instanceof ObjectValue ? value : null;
    });
    this.ResetErrors();
    this.OutputStreamDirty();
  }

  // The position a saved `[chunk id, entry, offset, sequence id]` names.
  protected placePosition(saved: unknown): ProgramPosition | null {
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

  // The blocks a position is inside, which follow from its sequence.
  protected blocksOf(position: ProgramPosition | null): BlockEntry[] {
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

// Writes counts by their keys.
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

// Writes a position as `[chunk id, entry, offset, sequence id]`, with chunk
// id -1 for a position past the last statement of its sequence, or null.
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

// Whether pushing `obj` shows something: text that is not only spaces and
// newlines, a display table, or the start of a tag (`StoryState.ts`).
function showsOutput(obj: InkObject | null): boolean {
  if (obj instanceof StringValue) return /[^ \t\n]/.test(obj.value ?? "");
  if (obj instanceof ObjectValue || obj instanceof Tag) return true;
  return (
    obj instanceof ControlCommand &&
    obj.commandType == ControlCommand.CommandType.BeginTag
  );
}
