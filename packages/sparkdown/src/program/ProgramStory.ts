import { Container } from "../inkjs/engine/Container";
import { ControlCommand } from "../inkjs/engine/ControlCommand";
import { ErrorType, type RaisedError } from "../inkjs/engine/Error";
import { InkObject } from "../inkjs/engine/Object";
import { lookupStateAwareStdLib } from "../inkjs/engine/StdLib";
import { Story } from "../inkjs/engine/Story";
import {
  StepLimitExceeded,
  StoryException,
} from "../inkjs/engine/StoryException";
import { StringBuilder } from "../inkjs/engine/StringBuilder";
import {
  AbstractValue,
  BoolValue,
  FloatValue,
  IntValue,
  MultiValue,
  NullValue,
  ObjectValue,
  StringValue,
  Value,
} from "../inkjs/engine/Value";
import type { VariablesState } from "../inkjs/engine/VariablesState";
import { Void } from "../inkjs/engine/Void";
import { BinaryProgramReader } from "./BinaryProgramReader";
import {
  CALL_DISCARD,
  ConstValue,
  NUM_FLOAT,
  Op,
  auxOf,
  flagsOf,
  opOf,
} from "./ProgramInstructions";
import type { ProgramRoot, SequenceRow } from "./ProgramRoot";
import { ROOT_FLOW_NAME } from "./ProgramSymbols";
import { ProgramStoryState } from "./ProgramStoryState";
import {
  ANCHOR_STATEMENT,
  HEADER_WORDS,
  codeWords,
  lineRowAt,
  lineRowField,
} from "./StatementChunk";

/** What a caller needs to place a runtime path the current engine's path
 *  locations name (`SparkProgram.pathLocations` and `scripts`). */
export interface ProgramPathLocations {
  /** The line of a path: the script's index and the line, counting from 0. */
  locate(path: string): { uri: string; line: number } | undefined;
}

type ErrorHandler = (
  message: string,
  type: ErrorType,
  source?: unknown,
  raised?: RaisedError | null,
) => void;

/**
 * `ProgramStory` runs a program's statement chunks with an integer cursor
 * (docs/engine/binary-program.md, sections 3, 6 and 9): an eval stack, tables
 * built from their pairs, the `display` builtin dispatched through its `STDLIB`
 * entry, and a continue that returns at its line's newline.
 *
 * It presents the members of the current engine's `Story` that a `Game` uses
 * to create a game from a compile, continue, read a beat's display
 * instructions and run a preview compile's program, under the same names.
 * What it does not present yet belongs to later slices of #692: choices
 * (#697), route planning and addresses (#700), images and saves across
 * compiles (#699), and the debugger (#702).
 *
 * The program's global declarations and the functions a host evaluates are not
 * emitted yet. Until they are (#695, #698), `ResetState` runs the
 * declarations on the current engine's story of the same compile
 * (`ProgramRoot.runtimeStory`), whose globals this engine then reads and
 * writes, and `HasFunction` and `EvaluateFunction` run on that story, against
 * the same globals.
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

  simulator: unknown = null;
  pauseBeforeEvaluatingConditions = false;
  pausedBeforeCondition: string | null = null;

  /** Every instruction this story has run. */
  stepCount = 0;
  /** The `stepCount` past which a step throws `StepLimitExceeded`. */
  stepLimit: number | null = null;

  protected _state!: ProgramStoryState;
  protected _reader: BinaryProgramReader;
  // The value a `Str` pushes, made once per string of the program table:
  // values are never written after they are made, so pushing one again
  // allocates nothing.
  protected _strings: StringValue[] = [];
  protected _asyncContinueActive = false;
  protected _recursiveContinueCount = 0;
  protected _stateIsPristine = false;
  protected _runtimeStory: Story;

  constructor(
    readonly root: ProgramRoot,
    protected _paths: ProgramPathLocations | null = null,
  ) {
    this._reader = new BinaryProgramReader(root);
    this._runtimeStory =
      root.runtimeStory ?? new Story(new Container(), null, null);
    // An error the declarations raise while the globals initialize, or while a
    // host evaluates a function, is reported as this story's.
    this._runtimeStory.onError = (message, type, source, raised) => {
      this.onError?.(message, type, source, raised);
    };
    this.ResetState();
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

  get currentChoices(): never[] {
    return [];
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

  ResetState(): void {
    this.IfAsyncWeCant("ResetState");
    const reactiveDepsEnabled =
      this._state?.variablesState?.reactiveDepsEnabled ?? false;
    this._runtimeStory.ResetState();
    const variablesState = this._runtimeStory.state.variablesState;
    variablesState.reactiveDepsEnabled = reactiveDepsEnabled;
    this._state = new ProgramStoryState(this.root, variablesState, (text) =>
      this.CleanOutputWhitespace(text),
    );
    const start = this.root.flowNamed(ROOT_FLOW_NAME);
    this._state.position = start ? { sequence: start, entry: 0, offset: 0 } : null;
    this._stateIsPristine = true;
  }

  ResetErrors(): void {
    this._state.ResetErrors();
  }

  ResetCallstack(): void {
    this.IfAsyncWeCant("ResetCallstack");
    this._stateIsPristine = false;
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
   *  the current engine's path locations falls in. */
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
    if (resetCallstack) {
      this.ResetCallstack();
    }
    this._state.DiscardLineEnd();
    this._stateIsPristine = false;
    this._state.position = target;
    this._state.didSafeExit = false;
    this._state.currentTurnIndex += 1;
  }

  ChooseChoiceIndex(choiceIdx: number): void {
    throw new Error(`choice out of range: ${choiceIdx}`);
  }

  HasFunction(functionName: string): boolean {
    return this._runtimeStory.HasFunction(functionName);
  }

  EvaluateFunction(
    functionName: string,
    args: any[] = [],
    returnTextOutput = false,
  ): any {
    this.IfAsyncWeCant("evaluate a function");
    return this._runtimeStory.EvaluateFunction(
      functionName,
      args,
      returnTextOutput,
    );
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

  Warning(message: string): void {
    this.AddError(message, true);
  }

  /** Records an error or warning at the instruction running, prefixed with
   *  its script and line as the current engine prefixes it
   *  (`Story.AddError`). */
  AddError(message: string, isWarning = false, useEndLineNumber = false): void {
    const where = this.sourceOfRunning();
    const kind = isWarning ? "WARNING" : "ERROR";
    if (where) {
      const line = useEndLineNumber ? where.endLine : where.startLine;
      message = `RUNTIME ${kind}: '${where.file}' line ${line + 1}: ${message}`;
    } else {
      message = `RUNTIME ${kind}: ${message}`;
    }
    this._state.AddError(message, isWarning, { message, path: null });
    if (!isWarning) this._state.ForceEnd();
  }

  CleanOutputWhitespace(str: string): string {
    if (this.processEscapes) {
      const sb = new StringBuilder();
      let escaped = false;
      for (let i = 0; i < str.length; i++) {
        const c = str.charAt(i);
        if (escaped) {
          sb.Append(c);
          escaped = false;
        } else {
          const isEscape = c == "\\";
          if (!isEscape) {
            sb.Append(c);
          }
          escaped = isEscape;
        }
      }
      str = sb.toString();
    }
    if (this.collapseWhitespace) {
      const sb = new StringBuilder();
      let currentWhitespaceStart = -1;
      let startOfLine = 0;
      for (let i = 0; i < str.length; i++) {
        const c = str.charAt(i);
        const isInlineWhitespace = c == " " || c == "\t";
        if (isInlineWhitespace && currentWhitespaceStart == -1)
          currentWhitespaceStart = i;
        if (!isInlineWhitespace) {
          if (
            c != "\n" &&
            currentWhitespaceStart > 0 &&
            currentWhitespaceStart != startOfLine
          ) {
            sb.Append(" ");
          }
          currentWhitespaceStart = -1;
        }
        if (c == "\n") startOfLine = i + 1;
        if (!isInlineWhitespace) sb.Append(c);
      }
      return sb.toString();
    }
    return str;
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
      if (this._asyncContinueActive) {
        break;
      }
    }

    state.CarryOutputPastCut();

    if (outputStreamEndsInNewline || !this.canContinue) {
      state.didSafeExit = false;
      if (this._recursiveContinueCount == 1) {
        state.variablesState.CompleteVariableObservation();
      }
      this._asyncContinueActive = false;
      if (this.onDidContinue !== null) this.onDidContinue();
    }

    this._recursiveContinueCount--;

    if (state.hasError || state.hasWarning) {
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
    return !state.inStringEvaluation && state.outputStreamEndsInNewline;
  }

  /** Runs the instruction at the position. A sequence that runs out ends its
   *  flow as `Done` does: the compiler ends every flow that does not end
   *  itself with a `-> DONE`, and the top-level content with a `done`. */
  Step(): void {
    this.stepCount++;
    if (this.stepLimit !== null && this.stepCount > this.stepLimit) {
      throw new StepLimitExceeded();
    }
    const state = this._state;
    const position = state.position;
    if (!position) {
      return;
    }
    const chunks = position.sequence.arrays.chunks;
    while (
      position.entry < chunks.length &&
      position.offset >= codeWords(chunks[position.entry]!)
    ) {
      position.entry += 1;
      position.offset = 0;
    }
    const chunk = chunks[position.entry];
    if (!chunk) {
      this.done();
      return;
    }
    this._running = {
      sequence: position.sequence,
      entry: position.entry,
      offset: position.offset,
    };
    const at = HEADER_WORDS + position.offset;
    const w0 = chunk[at]!;
    const arg = chunk[at + 1]!;
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
        state.PushToOutputStream(ControlCommand.EndTag());
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
          flagsOf(w0) & NUM_FLOAT ? new FloatValue(value) : new IntValue(value),
        );
        break;
      }
      case Op.Const:
        state.PushEvaluationStack(constValue(auxOf(w0)));
        break;
      case Op.MakeTable:
        this.makeTable(arg);
        break;
      case Op.Pop:
        state.PopEvaluationStack();
        break;
      case Op.CallStd:
        this.callStd(
          this.root.table.strings[arg]!,
          auxOf(w0),
          (flagsOf(w0) & CALL_DISCARD) !== 0,
        );
        break;
      case Op.Done:
        this.done();
        break;
      case Op.End:
        state.ForceEnd();
        break;
      default:
        this.Error(`unknown instruction ${opOf(w0)}`);
    }
    // A statement whose last instruction ran rests at the start of the next.
    const current = state.position;
    if (
      current &&
      current.entry < chunks.length &&
      current.offset >= codeWords(chunks[current.entry]!)
    ) {
      current.entry += 1;
      current.offset = 0;
    }
  }

  // --------------------------------------------------------------- internals

  protected done(): void {
    this._state.position = null;
    this._state.didSafeExit = true;
  }

  /** Pops `pairs` key and value pairs and pushes the table they make, as the
   *  current engine's `EndObject` does. The writer emits string keys only. */
  protected makeTable(pairs: number): void {
    const stack = this._state.evaluationStack;
    const between = stack.splice(stack.length - pairs * 2, pairs * 2);
    const entries = new Map<string, AbstractValue>();
    const pairEnd = between.length - 1;
    for (let i = 0; i + 1 < between.length; i += 2) {
      const rawKey = between[i];
      const keyObj = rawKey instanceof StringValue ? rawKey : null;
      let valObj =
        between[i + 1] instanceof AbstractValue
          ? (between[i + 1] as AbstractValue)
          : null;
      if (!keyObj || keyObj.value === null || !valObj) continue;
      const isLast = i + 1 === pairEnd;
      if (
        isLast &&
        valObj instanceof MultiValue &&
        /^[1-9]\d*$/.test(keyObj.value)
      ) {
        const startIdx = parseInt(keyObj.value, 10);
        for (let k = 0; k < valObj.values.length; k++) {
          const spreadVal = valObj.values[k]!;
          if (spreadVal instanceof NullValue) continue;
          entries.set(String(startIdx + k), spreadVal);
        }
      } else {
        if (valObj instanceof MultiValue) {
          valObj = valObj.values[0] ?? new NullValue();
        }
        if (valObj instanceof NullValue) {
          entries.delete(keyObj.value);
        } else {
          entries.set(keyObj.value, valObj);
        }
      }
    }
    this._state.PushEvaluationStack(new ObjectValue(entries));
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
    for (let k = 0; k < args.length; k++) {
      const a = args[k];
      if (a instanceof MultiValue) {
        if (k === args.length - 1) {
          args.splice(k, 1, ...a.values);
        } else {
          args[k] = a.values[0] ?? new NullValue();
        }
      } else if (a instanceof Void) {
        if (k === args.length - 1) {
          args.splice(k, 1);
        } else {
          args[k] = new NullValue();
        }
      }
    }
    const result = entry.fn(this as unknown as Story, args);
    if (discard) {
      return;
    }
    if (result === undefined) {
      this._state.PushEvaluationStack(new Void());
    } else if (Array.isArray(result)) {
      const wrapped: AbstractValue[] = [];
      for (const r of result) {
        if (r instanceof InkObject) {
          wrapped.push(r as AbstractValue);
        } else {
          const w = Value.Create(r);
          if (w !== null) wrapped.push(w);
        }
      }
      this._state.PushEvaluationStack(new MultiValue(wrapped));
    } else {
      const wrapped = result instanceof InkObject ? result : Value.Create(result);
      if (wrapped !== null) {
        this._state.PushEvaluationStack(wrapped);
      }
    }
  }

  /** The script and lines of the instruction running, or of the last one
   *  that ran: the line table row that covers it. The script is named as the
   *  compiler names it in debug metadata, by its file name without the
   *  extension. */
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
    if (row < 0 || lineRowField(chunk, row, 1) !== ANCHOR_STATEMENT) {
      return undefined;
    }
    const first = this.root.lineOf(sequence, entry);
    return {
      file: sequence.uri.split("/").at(-1)?.split(".")[0] ?? "",
      startLine: first + lineRowField(chunk, row, 2),
      endLine: first + lineRowField(chunk, row, 4),
    };
  }

  /** The instruction the last step ran. */
  protected _running: {
    sequence: SequenceRow;
    entry: number;
    offset: number;
  } | null = null;

  /** The position a path names: a flow by its qualified name, the top-level
   *  content's flow as `""` or `"0"`, or the statement at the line the path's
   *  location gives. */
  protected placePath(
    path: string,
  ): { sequence: SequenceRow; entry: number; offset: number } | undefined {
    const flow =
      path === "0" ? this.root.flowNamed(ROOT_FLOW_NAME) : this.root.flowNamed(path);
    if (flow) {
      return { sequence: flow, entry: 0, offset: 0 };
    }
    const location = this._paths?.locate(path);
    if (!location) {
      return undefined;
    }
    const at = this.root.statementAt(location.uri, location.line);
    if (!at) {
      return undefined;
    }
    // The beat of a statement that shows several starts at its own
    // `LineStart`: the last one at or above the line.
    const chunk = at.sequence.arrays.chunks[at.entry]!;
    let offset = 0;
    for (const instruction of this._reader.instructions(chunk)) {
      if (instruction.op !== Op.LineStart) {
        continue;
      }
      const range = this._reader.rangeAt(at.sequence, at.entry, instruction.offset);
      if (range && range.startLine <= location.line) {
        offset = instruction.offset;
      }
    }
    return { sequence: at.sequence, entry: at.entry, offset };
  }
}

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
