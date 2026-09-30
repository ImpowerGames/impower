import { Container } from "../inkjs/engine/Container";
import { debugFileName } from "../compiler/utils/debugFileName";
import { ControlCommand } from "../inkjs/engine/ControlCommand";
import { DebugMetadata } from "../inkjs/engine/DebugMetadata";
import { ErrorType, type RaisedError } from "../inkjs/engine/Error";
import { InkList } from "../inkjs/engine/InkList";
import { NativeFunctionCall } from "../inkjs/engine/NativeFunctionCall";
import { InkObject } from "../inkjs/engine/Object";
import { cleanOutputWhitespace } from "../inkjs/engine/outputWhitespace";
import { PushPopType } from "../inkjs/engine/PushPop";
import type { Simulator } from "../inkjs/engine/Simulator";
import { lookupStateAwareStdLib } from "../inkjs/engine/StdLib";
import {
  Story,
  callNativeFunction,
  callValueAsFunction,
  callVariableTarget,
  captureString,
  extractClosureTarget,
  indexValue,
  isFunctionReference,
  lookupMetamethod,
  normalizeLuauCallArgs,
  openVariablePointer,
  packTuple,
  popLuauCondition,
  readVariable,
  shortCircuitDecides,
  spreadLastMultiIfNonVariadic,
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
import { asOrThrows } from "../inkjs/engine/TypeAssertion";
import {
  AbstractValue,
  BoolValue,
  DivertTargetValue,
  FloatValue,
  IntValue,
  MultiValue,
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
import {
  CALL_ARGS_UNKNOWN,
  CALL_DISCARD,
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
import { ROOT_FLOW_NAME, SymbolKind, isAnonymousSymbol } from "./ProgramSymbols";
import {
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
 * (docs/engine/binary-program.md, sections 3, 6, 9 and 10): an eval stack, the
 * value operations of the current engine (`Story`'s shared handlers), native
 * functions and operators through `NativeFunctionCall`, variables through
 * `VariablesState`, block statements whose bodies it enters and leaves
 * through a block stack, calls of functions in frames that return to the
 * instruction after the call, decisions the route simulator can force, and a
 * continue that returns at its line's newline.
 *
 * It presents the members of the current engine's `Story` that a `Game` uses
 * to create a game from a compile, continue, read a beat's display
 * instructions, run a preview compile's program and evaluate a function
 * (`HasFunction`, `EvaluateFunction`), and the members the builtins read
 * (`CallLuauFunction`, `CallLuauFunctionProtected`, `CallStackTrace`, ...),
 * under the same names. What it does not present yet belongs to later slices
 * of #692: diverts and counts (#696), choices (#697), images and saves across
 * compiles (#699), addresses (#700) and the debugger (#702).
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

  constructor(
    readonly root: ProgramRoot,
    protected _paths: ProgramPathLocations | null = null,
  ) {
    this._reader = new BinaryProgramReader(root);
    this._runtimeStory =
      root.runtimeStory?.CopyWithOwnState() ??
      new Story(new Container(), null, null);
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
    if (resetCallstack) {
      this.ResetCallstack();
    }
    this._state.DiscardLineEnd();
    this._stateIsPristine = false;
    this.moveTo(target);
    this._state.didSafeExit = false;
    this._state.currentTurnIndex += 1;
  }

  ChooseChoiceIndex(choiceIdx: number): void {
    throw new Error(`choice out of range: ${choiceIdx}`);
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

  /** Runs the function declared at the top level under `functionName` with
   *  `args` from outside the story, in a frame of its own that ends when the
   *  function returns, collecting the text it writes against an output of
   *  its own, as the current engine's `Story.EvaluateFunction` does: its
   *  result is what the function returns, as a JS value. */
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
    const target = found ? this.targetOf(found.ref.symbol) : null;
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
    this.passArguments(args);

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
      // does not move.
      this.pausedBeforeCondition = ProgramStory.addressOf(chunk, position.offset);
      return;
    }
    this.pausedBeforeCondition = null;
    this.stepCount++;
    if (this.stepLimit !== null && this.stepCount > this.stepLimit) {
      throw new StepLimitExceeded();
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
        state.frame?.PopScope();
      }
      position.sequence = top.sequence;
      position.entry = top.entry;
      position.offset = blockField(owner, top.block, B_RESUME);
    }
  }

  // Whether the instruction at `offset` is a decision.
  protected pausesAt(chunk: StatementChunk, offset: number): boolean {
    const w0 = chunk[HEADER_WORDS + offset]!;
    return opOf(w0) === Op.JumpIfFalse && (flagsOf(w0) & JUMP_DECISION) !== 0;
  }

  /** Runs the instruction at the position, which `fetch` found in `chunk`. */
  protected execute(position: ProgramPosition, chunk: StatementChunk): void {
    const state = this._state;
    this._running = {
      sequence: position.sequence,
      entry: position.entry,
      offset: position.offset,
    };
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
        state.PushToOutputStream(ControlCommand.EndTag());
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
        // A variable holds one value: a multiple value keeps its first,
        // except in a variadic function's `...` local, which keeps it whole.
        if (value instanceof MultiValue && !(flags & SET_VARARGS)) {
          value = value.values[0] ?? new NullValue();
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
        state.frame?.PopScope();
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
        const target = this.targetOf(arg);
        if (!target) {
          this.Error("Divert target not found.");
        }
        // A last argument that is a multiple value spreads for a function
        // that is not variadic, as a static call's does.
        spreadLastMultiIfNonVariadic(this, target);
        this.EnterFunction(target);
        break;
      }
      case Op.CallVar: {
        const target = callVariableTarget(this, this.root.table.strings[arg]!);
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
        this.done();
        break;
      case Op.End:
        state.ForceEnd();
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
   *  reseeds since then gave it (`ProgramRoot.symbolFrom`), or for a symbol
   *  they dropped, the id of its name when it has one. */
  protected symbolIn(ref: SymbolRef): number | undefined {
    if (ref.generation === this.root.generation) {
      return ref.symbol;
    }
    return (
      this.root.symbolFrom(ref.symbol, ref.generation) ??
      (ref.name === null ? undefined : this.root.table.symbolIds.get(ref.name))
    );
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

  /** Pushes a call frame of `type` that returns to the position, inside the
   *  blocks the position is inside, and moves to `target`'s entry, where the
   *  frame is inside no block yet. */
  protected enter(target: SymbolTarget, type: PushPopType, evalHeight = 0): void {
    const state = this._state;
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

  protected done(): void {
    this._state.position = null;
    this._state.blockStack = [];
    this._state.didSafeExit = true;
  }

  /** Moves to `target`, inside the blocks that hold it, with the scopes its
   *  owners have open there. */
  protected moveTo(target: ProgramPosition): void {
    const state = this._state;
    const blocks = blockStackOf(this.root, target.sequence);
    if (!blocks) {
      throw new StoryException("The position is in a block the program no longer has.");
    }
    state.position = target;
    state.blockStack = blocks;
    const frame = state.frame;
    if (frame) {
      for (const block of blocks) {
        const owner = block.sequence.arrays.chunks[block.entry]!;
        for (let s = 0; s < blockScopes(owner, block.block); s += 1) {
          frame.PushScope();
        }
      }
    }
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
  protected placePath(path: string): ProgramPosition | undefined {
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
