import { Container } from "./Container";
import { InkObject } from "../../runtime/Object";
import { JsonSerialisation } from "../../runtime/JsonSerialisation";
import { StoryState } from "./StoryState";
import { ControlCommand } from "../../runtime/ControlCommand";
import { PushPopType } from "../../runtime/PushPop";
import { ChoicePoint } from "./ChoicePoint";
import { Choice } from "../../runtime/Choice";
import { Divert } from "./Divert";
import {
  Value,
  StringValue,
  IntValue,
  DivertTargetValue,
  VariablePointerValue,
  ListValue,
  ObjectValue,
  AbstractValue,
  NullValue,
} from "../../runtime/Value";
import { Path } from "../../runtime/Path";
import { Void } from "../../runtime/Void";
import { oneValue, spreadCallArgs } from "../../runtime/CallArgs";
import { Tag } from "../../runtime/Tag";
import { VariableAssignment } from "../../runtime/VariableAssignment";
import { VariableReference } from "./VariableReference";
import { NativeFunctionCall } from "../../runtime/NativeFunctionCall";
import { lookupStateAwareStdLib } from "../../runtime/StdLib";
import { EXECUTION_WATCH_STEPS, executionWatch } from "../../runtime/ExecutionWatch";
import { StepLimitExceeded, StoryException } from "../../runtime/StoryException";
import { PRNG } from "../../runtime/PRNG";
import { StringBuilder } from "../../runtime/StringBuilder";
import { ListDefinitionsOrigin } from "../../runtime/ListDefinitionsOrigin";
import { ListDefinition } from "../../runtime/ListDefinition";
import { Pointer } from "../../runtime/Pointer";
import { InkList, InkListItem, type KeyValuePair } from "../../runtime/InkList";
import { asOrNull, asOrThrows } from "../../runtime/TypeAssertion";
import { DebugMetadata } from "../../runtime/DebugMetadata";
import { throwNullException } from "../../runtime/NullException";
import { SimpleJson } from "../../runtime/SimpleJson";
import { ErrorType, type RaisedError, type RuntimeErrorHandler } from "../../runtime/Error";
import { StructDefinition } from "../../runtime/StructDefinition";
import type { Simulator } from "../../runtime/Simulator";

export { InkList } from "../../runtime/InkList";
import {
  ContainerTarget,
  type FunctionTarget,
  arrangeArgsFor,
  callNativeFunction,
  callValueAsFunction,
  callVariableTarget,
  captureString,
  captureTag,
  extractClosureTarget,
  indexValue,
  lookupMetamethod,
  normalizeLuauCallArgs,
  openVariablePointer,
  packTuple,
  popLuauCondition,
  pushStdLibResult,
  readVariable,
  sequenceShuffleIndex,
  shortCircuitDecides,
  spreadLastMultiIfNonVariadic,
  storeIndex,
  tableFromPairs,
  tryInvokeStdLibMarkerValue,
  unpackTuple,
} from "../../runtime/evaluation";

export class Story extends InkObject {
  public static inkVersionCurrent = 22;

  public inkVersionMinimumCompatible = 18;

  public pauseBeforeEvaluatingConditions: boolean = false;

  public pausedBeforeCondition: string | null = null;

  /** Every `Step()` this story has run, the steps of Luau callbacks included.
   *  A callback runs all of its steps inside the one step that called it, so a
   *  caller that budgets execution per `ContinueAsync()` charges the difference
   *  in this count, not one step per call. */
  public stepCount = 0;

  /** The `stepCount` past which `Step()` throws {@link StepLimitExceeded}, or
   *  null for none. A caller that budgets execution sets it around a
   *  `ContinueAsync()`, so the budget also stops the steps of callbacks, which
   *  run before that call returns. */
  public stepLimit: number | null = null;

  public simulator?: Simulator | null = null;

  get currentChoices() {
    let choices: Choice[] = [];

    if (this._state === null) {
      return throwNullException("this._state");
    }
    for (let c of this._state.currentChoices) {
      if (!c.isInvisibleDefault) {
        c.index = choices.length;
        choices.push(c);
      }
    }

    return choices;
  }

  get currentText() {
    this.IfAsyncWeCant("call currentText since it's a work in progress");
    return this.state.currentText;
  }

  get currentTags() {
    this.IfAsyncWeCant("call currentTags since it's a work in progress");
    return this.state.currentTags;
  }

  /** The live instruction tables the `display(<table>)` calls emitted this
   *  beat (empty otherwise). See
   *  {@link StoryState.currentDisplayInstructions}. */
  get currentDisplayInstructions() {
    this.IfAsyncWeCant(
      "call currentDisplayInstructions since it's a work in progress",
    );
    return this.state.currentDisplayInstructions;
  }

  /** Whether the last continue brought anything to show: text, a display
   *  table or choices. A continue returns at its line's newline, so the next
   *  one can complete with none of them, having run through logic to the
   *  story's end or on into more of the story. A host makes no beat of it. */
  get continueShowedSomething() {
    return (
      Boolean(this.currentText) ||
      this.currentDisplayInstructions.length > 0 ||
      this.currentChoices.length > 0
    );
  }

  get currentErrors() {
    return this.state.currentErrors;
  }

  get currentWarnings() {
    return this.state.currentWarnings;
  }

  get currentFlowName() {
    return this.state.currentFlowName;
  }

  get currentFlowIsDefaultFlow() {
    return this.state.currentFlowIsDefaultFlow;
  }

  get aliveFlowNames() {
    return this.state.aliveFlowNames;
  }

  get hasError() {
    return this.state.hasError;
  }

  get hasWarning() {
    return this.state.hasWarning;
  }

  get variablesState() {
    return this.state.variablesState;
  }

  get listDefinitions() {
    return this._listDefinitions;
  }

  get structDefinitions() {
    return this._structDefinitions;
  }

  get state() {
    return this._state;
  }

  /**
   * True when the state is exactly what `ResetState` left behind: the globals
   * have been evaluated and nothing has advanced, diverted, loaded or written
   * over them since.
   *
   * Evaluating the globals means running the whole `global decl` container —
   * every definition in the program, and every builtin seeded alongside them —
   * so a caller that resets a story only to guarantee a known starting point
   * can ask this first and reset nothing when the answer is yes. Any story
   * whose state has been touched in a way the runtime cannot account for
   * reports false, so the answer is only ever conservative.
   *
   * The answer is only as good as the list of places that clear it, so they are
   * named here for anyone adding a method or re-syncing this engine:
   * `ContinueInternal`, `ChoosePath`, `ResetCallstack`, `SwitchFlow`,
   * `RemoveFlow`, `SwitchToDefaultFlow`, `VariableStateDidChangeEvent` (a
   * global written from outside) and `StoryState.LoadJsonObj` (through
   * {@link NoteStateChanged}). A new path that changes state belongs on that
   * list.
   */
  get stateIsPristine(): boolean {
    return this._stateIsPristine;
  }

  /** Record that the state is no longer the untouched one `ResetState` built.
   *  Called by every runtime path that advances, diverts, replaces or writes
   *  over the state, including from `StoryState` itself. */
  public NoteStateChanged() {
    this._stateIsPristine = false;
  }

  public onError: RuntimeErrorHandler | null = null;

  public onDidContinue: (() => void) | null = null;

  public onMakeChoice: ((arg1: Choice) => void) | null = null;

  public onEvaluateCondition: ((arg1: boolean) => void) | null = null;

  public onEvaluateFunction: ((arg1: string, arg2: any[]) => void) | null =
    null;

  public onCompleteEvaluateFunction:
    | ((arg1: string, arg2: any[], arg3: string, arg4: any) => void)
    | null = null;

  public onChoosePathString: ((arg1: string, arg2: any[]) => void) | null =
    null;

  public onExecute: ((arg1: string | undefined) => void) | null = null;

  public onWriteRuntimeObject?: (
    writer: SimpleJson.Writer,
    obj: InkObject,
  ) => boolean = undefined;

  // TODO: Implement Profiler
  public StartProfiling() {
    /* */
  }
  public EndProfiling() {
    /* */
  }

  constructor(
    contentContainer: Container,
    lists: ListDefinition[] | null,
    structs: StructDefinition[] | null,
  );
  constructor(jsonString: string);
  constructor(json: Record<string, any>);
  constructor() {
    super();

    // Discrimination between constructors
    let contentContainer: Container;
    let lists: ListDefinition[] | null = null;
    let structs: StructDefinition[] | null = null;
    let json: Record<string, any> | null = null;

    if (arguments[0] instanceof Container) {
      contentContainer = arguments[0] as Container;

      if (typeof arguments[1] !== "undefined") {
        lists = arguments[1] as ListDefinition[];
      }

      if (typeof arguments[2] !== "undefined") {
        structs = arguments[2] as StructDefinition[];
      }

      // ------ Story (Container contentContainer, List<Runtime.ListDefinition> lists = null)
      this._mainContentContainer = contentContainer;
      // ------
    } else {
      if (typeof arguments[0] === "string") {
        let jsonString = arguments[0] as string;

        json = SimpleJson.TextToDictionary(jsonString);
      } else {
        json = arguments[0] as Record<string, any>;
      }
    }

    // ------ Story (Container contentContainer, List<Runtime.ListDefinition> lists = null)
    if (lists != null) {
      this._listDefinitions = new ListDefinitionsOrigin(lists);
    }

    if (structs != null) {
      this._structDefinitions = {};
      for (const struct of structs) {
        const type = struct.type;
        const name = struct.name;
        if (type) {
          this._structDefinitions[type] ??= {};
          if (name) {
            this._structDefinitions[type][name] = struct.value;
          }
        }
      }
    }

    this._externals = new Map();
    // ------

    // ------ Story(string jsonString) : this((Container)null)
    if (json !== null) {
      let rootObject: Record<string, any> = json;

      let versionObj = rootObject["inkVersion"];
      if (versionObj == null)
        throw new Error(
          "ink version number not found. Are you sure it's a valid .ink.json file?",
        );

      let formatFromFile = parseInt(versionObj);
      if (formatFromFile > Story.inkVersionCurrent) {
        throw new Error(
          "Version of ink used to build story was newer than the current version of the engine",
        );
      } else if (formatFromFile < this.inkVersionMinimumCompatible) {
        throw new Error(
          "Version of ink used to build story is too old to be loaded by this version of the engine",
        );
      } else if (formatFromFile != Story.inkVersionCurrent) {
        console.warn(
          `WARNING: Version of ink ${Story.inkVersionCurrent} used to build story doesn't match current version of engine (${formatFromFile}). Non-critical, but recommend synchronising.`,
        );
      }

      let rootToken = rootObject["root"];
      if (rootToken == null)
        throw new Error(
          "Root node for ink not found. Are you sure it's a valid .ink.json file?",
        );

      let listDefsObj;
      if ((listDefsObj = rootObject["listDefs"])) {
        this._listDefinitions =
          JsonSerialisation.JTokenToListDefinitions(listDefsObj);
      }

      // Names declared with `const`. They initialize like any other global
      // (so they are inspectable at runtime — e.g. by the debug adapter),
      // but they are immutable and fully reconstructed from the bytecode on
      // every run, so they are never written to a save and never restored
      // from one. See `VariablesState.constantNames`.
      const constantsObj = rootObject["constants"];
      if (Array.isArray(constantsObj)) {
        this._constantNames = new Set<string>(constantsObj as string[]);
      }

      this._mainContentContainer = asOrThrows(
        JsonSerialisation.JTokenToRuntimeObject(rootToken),
        Container,
      );

      this.ResetState();
    }
    // ------
  }

  // Merge together `public string ToJson()` and `void ToJson(SimpleJson.Writer writer)`.
  // Will only return a value if writer was not provided.
  public ToJson(
    writer?: SimpleJson.Writer,
    // Optional per-flow memo for incremental serialization. Applies to the
    // story's top-level named flows only; listDefs/structDefs/inline content are
    // always serialized fresh. See JsonSerialisation.WriteRuntimeContainer.
    flowMemo?: {
      resolve: (
        name: string,
        container: Container,
        serialize: () => any,
      ) => any;
    },
  ): string | void {
    let shouldReturn = false;

    if (!writer) {
      shouldReturn = true;
      writer = new SimpleJson.Writer();
    }

    writer.WriteObjectStart();

    writer.WriteIntProperty("inkVersion", Story.inkVersionCurrent);

    writer.WriteProperty("root", (w) =>
      JsonSerialisation.WriteRuntimeContainer(
        w,
        this._mainContentContainer,
        false,
        this.onWriteRuntimeObject,
        flowMemo,
      ),
    );

    if (this._listDefinitions != null) {
      writer.WritePropertyStart("listDefs");
      writer.WriteObjectStart();

      for (let def of this._listDefinitions.lists) {
        writer.WritePropertyStart(def.name);
        writer.WriteObjectStart();

        for (let [key, value] of def.items) {
          let item = InkListItem.fromSerializedKey(key);
          let val = value;
          writer.WriteIntProperty(item.itemName, val);
        }

        writer.WriteObjectEnd();
        writer.WritePropertyEnd();
      }

      writer.WriteObjectEnd();
      writer.WritePropertyEnd();
    }

    // Names declared with `const`. Shipped so the runtime can keep them
    // read-only and out of save data while still exposing them as ordinary
    // inspectable globals — see `VariablesState.constantNames`.
    if (this._constantNames.size > 0) {
      writer.InjectObject("constants", [...this._constantNames]);
    }

    if (
      this._structDefinitions != null &&
      Object.keys(this._structDefinitions).length > 0
    ) {
      writer.InjectObject("structDefs", this._structDefinitions);
    }

    writer.WriteObjectEnd();

    if (shouldReturn) return writer.toString();
  }

  /** Builds a fresh state and initializes the globals, unless
   *  `initializeGlobals` is false, which leaves them to the caller: the binary
   *  program's engine runs its own declaration sequence against this story's
   *  globals (see `ProgramStory`). */
  public ResetState(initializeGlobals = true) {
    this.IfAsyncWeCant("ResetState");

    // Reactive dependency tracking is an OBSERVATION MODE, not story state:
    // resetting the state must not silently disable it. The fresh
    // `VariablesState` below defaults the flag off, and the runtime that
    // enabled it (the reactive UI's layout mount) has no hook into every
    // reset path — `Game.rewindStory`, `jumpToPath`, and any future caller
    // each mint a fresh state, and every one that forgot to re-assert the
    // flag froze the mounted `{bindings}` for the whole run (#365: the
    // handler ran, the VM changed, and no change was ever recorded for the
    // refresh to react to). Carry the mode across; the accumulated
    // change-sets deliberately start empty — the globals re-declare below,
    // recording fresh changes as they go.
    const reactiveDepsEnabled =
      this._state?.variablesState?.reactiveDepsEnabled ?? false;

    this._state = new StoryState(this);
    this._state.variablesState.reactiveDepsEnabled = reactiveDepsEnabled;
    this._state.variablesState.ObserveVariableChange(
      this.VariableStateDidChangeEvent.bind(this),
    );

    if (initializeGlobals) {
      this.ResetGlobals();
    } else {
      this.state.variablesState.constantNames = this._constantNames;
    }

    // Last, so that the work `ResetGlobals` itself does through the ordinary
    // running paths (it diverts to `global decl` and continues) does not clear
    // the mark it is here to set.
    this._stateIsPristine = true;
  }

  public ResetErrors() {
    if (this._state === null) {
      return throwNullException("this._state");
    }
    this._state.ResetErrors();
  }

  public ResetCallstack() {
    this.IfAsyncWeCant("ResetCallstack");
    if (this._state === null) {
      return throwNullException("this._state");
    }
    this._stateIsPristine = false;
    this._state.ForceEnd();
  }

  public ResetGlobals() {
    // Re-published on every reset so a reloaded//swapped story can't leave the
    // previous program's constant set behind.
    this.state.variablesState.constantNames = this._constantNames;
    if (this._mainContentContainer.namedContent.get("global decl")) {
      let originalPointer = this.state.currentPointer.copy();

      this.ChoosePath(new Path("global decl"), false);

      this.ContinueInternal();

      this.state.currentPointer = originalPointer;
    }

    this.state.variablesState.SnapshotDefaultGlobals();
  }

  public SwitchFlow(flowName: string) {
    this.IfAsyncWeCant("switch flow");

    this._stateIsPristine = false;
    this.state.SwitchFlow_Internal(flowName);
  }

  public RemoveFlow(flowName: string) {
    this._stateIsPristine = false;
    this.state.RemoveFlow_Internal(flowName);
  }

  public SwitchToDefaultFlow() {
    this._stateIsPristine = false;
    this.state.SwitchToDefaultFlow_Internal();
  }

  public Continue() {
    if (!this._hasValidatedExternals) this.ValidateExternalBindings();

    this.ContinueInternal();
    return this.currentText;
  }

  get canContinue() {
    return this.state.canContinue;
  }

  get asyncContinueComplete() {
    return !this._asyncContinueActive;
  }

  /** Advance the story a single step and leave it in an asynchronous
   *  continue, so the caller decides when the story moves again.
   *  {@link Continue} runs to the end of the current line instead. */
  public ContinueAsync() {
    if (!this._hasValidatedExternals) this.ValidateExternalBindings();

    this.ContinueInternal(true);
  }

  /** Close an in-progress `ContinueAsync` WITHOUT advancing the story, for a
   *  caller that is about to replace the story state outright.
   *
   *  `ResetState`, `ChoosePathString` and the rest refuse to run while a line
   *  is still part-way through (`IfAsyncWeCant`), and until now the only way
   *  past that was a plain `Continue()` — which finishes the line by running
   *  it. That work is wasted whenever the caller is about to discard the state
   *  anyway, and worse, it cannot be declined: a story sitting in a loop that
   *  never completes a line runs forever, with no error raised and nothing to
   *  stop it (#386).
   *
   *  So this ends the continue instead of finishing it. Everything below is
   *  the wrap-up `ContinueInternal` performs when a line is over, minus the
   *  advancing: the open batch of variable observations is closed out.
   *
   *  Closing that batch ANNOUNCES what it recorded: `CompleteVariableObservation`
   *  raises `variableChangedEvent` for every variable the abandoned run touched
   *  before it was stopped. An observer registered through `ObserveVariable`
   *  therefore sees a PART-WAY-THROUGH view — the writes the line had reached,
   *  not the ones it would have finished with — followed by whatever the
   *  caller's replacement re-declares. The `Continue()` this replaces announced
   *  a different thing, the values as of the completed line, so this is a real
   *  difference and not a parity claim. It is stated rather than papered over
   *  because both are announcements of a run that is about to be discarded, and
   *  choosing what an observer should see across an abandoned line is a
   *  decision about observer semantics rather than part of ending the continue.
   *  Nothing in this repository subscribes today.
   *
   *  One deliberate divergence from that wrap-up: it completes the observation
   *  batch only at `_recursiveContinueCount == 1`, and this does it
   *  unconditionally, because a cancel runs from outside any `ContinueInternal`
   *  frame — where that count is zero and the guard would never let the batch
   *  close. The guard below enforces that this is the only way it is used. */
  public CancelAsyncContinue() {
    // Cancelling from inside a live continue would be the original bug wearing
    // a new hat: clearing the flag while `ContinueInternal`'s loop is still on
    // the stack disables the break that ends its slice, so the loop would run
    // the line to its end — and a line that never ends never would. Refuse,
    // the same way the runtime refuses every other operation that is unsafe
    // mid-continue.
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

  /** `stepAtATime` advances a single step and stays in an asynchronous
   *  continue; otherwise the story runs to the end of the current line. */
  public ContinueInternal(stepAtATime = false) {
    this._stateIsPristine = false;
    if (this._profiler != null) this._profiler.PreContinue();

    this._recursiveContinueCount++;

    if (!this._asyncContinueActive) {
      this._asyncContinueActive = stepAtATime;

      if (!this.canContinue) {
        throw new Error(
          "Can't continue - should check canContinue before calling Continue",
        );
      }

      this._state.didSafeExit = false;
      // The step the last continue cut off after its line ended starts this
      // one: its output, whether that output's own line still waits for its
      // newline, and the paths it ran, which belong to the beat that shows it.
      const carried = this._state.TakeCarriedStep();
      this._state.ResetOutput(carried?.output ?? null);
      this._state.lineEndPending = carried?.lineEndPending ?? false;
      this._state.outputCut = null;
      this._state.heldPaths = [];

      if (this._recursiveContinueCount == 1)
        this._state.variablesState.StartVariableObservation();

      if (carried && this.onExecute !== null) {
        for (const path of carried.paths) this.onExecute(path);
      }
    } else if (this._asyncContinueActive && !stepAtATime) {
      this._asyncContinueActive = false;
    }

    // Carried output that ends its line is a line already written, and this
    // continue returns it without stepping.
    let outputStreamEndsInNewline =
      !this._state.inStringEvaluation && this._state.outputStreamEndsInNewline;
    while (!outputStreamEndsInNewline && this.canContinue) {
      try {
        outputStreamEndsInNewline = this.ContinueSingleStep();
      } catch (e) {
        if (!(e instanceof StoryException)) {
          // An engine error leaves this continue for good, so it stops
          // counting as live. A continue still counted after it has left would
          // make `CancelAsyncContinue` refuse for the rest of the story's life,
          // and with it every reset, jump and load (#473). A line an
          // asynchronous continue had open stays open for the caller to cancel.
          this._recursiveContinueCount--;
          throw e;
        }

        this.AddError(e.message, undefined, e.useEndLineNumber, e.raisedPath);
        break;
      }

      // An asynchronous continue advances one step per call, so the caller
      // decides when the story moves again.
      if (this._asyncContinueActive) {
        break;
      }
    }

    this._state.CarryOutputPastCut();

    if (outputStreamEndsInNewline || !this.canContinue) {
      // Paths held while a line end waited, with no cut to carry them to the
      // next continue, ran for this one.
      for (const path of this._state.ReleaseHeldPaths()) {
        if (this.onExecute !== null) this.onExecute(path);
      }

      if (!this.canContinue) {
        if (this.state.callStack.canPopThread)
          this.AddError(
            "Thread available to pop, threads should always be flat by the end of evaluation?",
          );

        if (
          this.state.generatedChoices.length == 0 &&
          !this.state.didSafeExit &&
          this._temporaryEvaluationContainer == null
        ) {
          if (this.state.callStack.CanPop(PushPopType.Tunnel))
            this.AddError(
              "unexpectedly reached end of content. Do you need a '->->' to return from a tunnel?",
            );
          else if (this.state.callStack.CanPop(PushPopType.Function))
            this.AddError(
              "unexpectedly reached end of content. Do you need a '~ return'?",
            );
          else if (!this.state.callStack.canPop)
            this.AddError(
              "ran out of content. Do you need a '-> DONE' or '-> END'?",
            );
          else
            this.AddError(
              "unexpectedly reached end of content for unknown reason. Please debug compiler!",
            );
        }
      }

      this.state.didSafeExit = false;

      if (this._recursiveContinueCount == 1)
        this._state.variablesState.CompleteVariableObservation();

      this._asyncContinueActive = false;
      if (this.onDidContinue !== null) this.onDidContinue();
    }

    this._recursiveContinueCount--;

    if (this._profiler != null) this._profiler.PostContinue();

    // In the following code, we're masking a lot of non-null assertion,
    // because testing for against `hasError` or `hasWarning` makes sure
    // the arrays are present and contain at least one element.
    if (this.state.hasError || this.state.hasWarning) {
      if (this.onError !== null) {
        if (this.state.hasError) {
          const raised = this.state.raisedErrors;
          this.state.currentErrors!.forEach((err, i) => {
            this.onError!(err, ErrorType.Error, null, raised[i] ?? null);
          });
        }
        if (this.state.hasWarning) {
          const raised = this.state.raisedWarnings;
          this.state.currentWarnings!.forEach((err, i) => {
            this.onError!(err, ErrorType.Warning, null, raised[i] ?? null);
          });
        }
        this.ResetErrors();
      } else {
        let sb = new StringBuilder();
        sb.Append("Ink had ");
        if (this.state.hasError) {
          sb.Append(`${this.state.currentErrors!.length}`);
          sb.Append(
            this.state.currentErrors!.length == 1 ? " error" : " errors",
          );
          if (this.state.hasWarning) sb.Append(" and ");
        }
        if (this.state.hasWarning) {
          sb.Append(`${this.state.currentWarnings!.length}`);
          sb.Append(
            this.state.currentWarnings!.length == 1 ? " warning" : " warnings",
          );
          if (this.state.hasWarning) sb.Append(" and ");
        }
        sb.Append(
          ". It is strongly suggested that you assign an error handler to story.onError. The first issue was: ",
        );
        sb.Append(
          this.state.hasError
            ? this.state.currentErrors![0]!
            : this.state.currentWarnings![0]!,
        );

        throw new StoryException(sb.toString());
      }
    }
    // Automatically force a choice (used when simulating routes)
    if (this.simulator) {
      const currentChoices = this._state.currentChoices;
      if (!this.canContinue && currentChoices.length > 0) {
        const sitePath = this.state.previousPointer.path?.toString();
        if (sitePath) {
          const forcedSourcePath = this.simulator.forceChoice(sitePath);
          const forced = currentChoices.find(
            (choice) => choice.sourcePath === forcedSourcePath,
          );
          if (forced != null) {
            this.ChooseChoice(forced);
          }
        }
      }
    }
  }

  // Runs one step, and returns true when the step ended this continue's line.
  public ContinueSingleStep() {
    if (this._profiler != null) this._profiler.PreStep();

    this.Step();

    if (this._profiler != null) this._profiler.PostStep();

    // A step that showed something while a line end was pending cut the
    // output there: the continue ends with that line, and what the step
    // showed after the cut belongs to the next one. Where the story cannot go
    // on, no next continue follows to carry it to, and it stays in this one
    // after the line's newline.
    if (this.state.outputCut !== null) {
      if (this.canContinue) return true;
      this.state.CloseOutputCut();
    }

    if (!this.canContinue && !this.state.callStack.elementIsEvaluateFromGame) {
      this.TryFollowDefaultInvisibleChoice();
    }

    // A newline ends the line, so the continue returns at it. Inside a string
    // evaluation a newline is a character of the value being built.
    return (
      !this.state.inStringEvaluation && this.state.outputStreamEndsInNewline
    );
  }

  public ContinueMaximally() {
    this.IfAsyncWeCant("ContinueMaximally");

    let sb = new StringBuilder();

    while (this.canContinue) {
      sb.Append(this.Continue());
    }

    return sb.toString();
  }

  public ContentAtPath(path: Path) {
    return this.mainContentContainer.ContentAtPath(path);
  }

  public KnotContainerWithName(name: string) {
    let namedContainer = this.mainContentContainer.namedContent.get(name);
    if (namedContainer instanceof Container) return namedContainer;
    else return null;
  }

  /** The stack trace `debug.traceback` prints: each call frame of each
   *  thread, from the outermost, with the path of the container it is in. */
  public CallStackTrace(): string {
    return this.state.callStack.callStackTrace;
  }

  /** How many call frames the current thread has, for `debug.info`. */
  public CallFrameCount(): number {
    return this.state.callStack.elements.length;
  }

  /** The path of the container call frame `index` of the current thread is
   *  in, counting from the outermost, as `debug.info` names a frame, or null
   *  for a frame with no position. */
  public CallFramePath(index: number): string | null {
    const ptr = this.state.callStack.elements[index]?.currentPointer;
    const container = ptr && !ptr.isNull ? ptr.container : null;
    return container?.path?.toString() ?? null;
  }

  /** The value a read of `name` gives when no variable has that name but a
   *  knot or function does: a divert target to it, or null. */
  public FlowValueNamed(name: string): DivertTargetValue | null {
    const knotContainer = this.KnotContainerWithName(name);
    return knotContainer && knotContainer.path
      ? new DivertTargetValue(knotContainer.path)
      : null;
  }

  /** The function a function value names for the shared call handlers: the
   *  container a divert target's path leads to, or null for any other
   *  value. */
  public FunctionTargetOf(value: unknown): FunctionTarget | null {
    if (value instanceof DivertTargetValue && value.value !== null) {
      return new ContainerTarget(
        this.ContentAtPath(value.value).obj,
        value.value,
      );
    }
    return null;
  }

  /** Enters `target`, a function the shared call handlers found
   *  (`FunctionTargetOf`), in a new function frame. */
  public EnterFunction(target: FunctionTarget): void {
    this.state.divertedPointer = this.PointerAtPath(
      (target as ContainerTarget).path!,
    );
    this.state.callStack.Push(
      PushPopType.Function,
      undefined,
      this.state.outputStream.length,
    );
  }

  public PointerAtPath(path: Path) {
    if (path.length == 0) return Pointer.Null;

    let p = new Pointer();

    let pathLengthToUse = path.length;

    let result = null;
    if (path.lastComponent === null) {
      return throwNullException("path.lastComponent");
    }

    if (path.lastComponent.isIndex) {
      pathLengthToUse = path.length - 1;
      result = this.mainContentContainer.ContentAtPath(
        path,
        undefined,
        pathLengthToUse,
      );
      p.container = result.container;
      p.index = path.lastComponent.index;
      if (p.index != null && p.index < 0 && result.container) {
        // Negative indexes represent the distance from the end of the container
        const index = result.container.content.length + p.index;
        if (index >= 0) {
          p.index = index;
        } else {
          p.index = 0;
        }
      }
    } else {
      result = this.mainContentContainer.ContentAtPath(path);
      p.container = result.container;
      p.index = null;
    }

    if (
      result.obj == null ||
      (result.obj == this.mainContentContainer && pathLengthToUse > 0)
    ) {
      this.Error(
        "Failed to find content at path '" +
          path +
          "', and no approximation of it was possible.",
      );
    } else if (result.approximate)
      this.Warning(
        "Failed to find content at path '" +
          path +
          "', so it was approximated to: '" +
          result.obj.path +
          "'.",
      );

    return p;
  }

  public Step() {
    this.stepCount++;
    if (this.stepLimit !== null && this.stepCount > this.stepLimit) {
      throw new StepLimitExceeded();
    }
    if ((this.stepCount & (EXECUTION_WATCH_STEPS - 1)) === 0) {
      executionWatch.listener?.(this);
    }
    this.pausedBeforeCondition = null; // clear any previous pause

    let shouldAddToStream = true;

    let pointer = this.state.currentPointer.copy();
    if (pointer.isNull) {
      return;
    }

    // Container containerToEnter = pointer.Resolve () as Container;
    let containerToEnter = asOrNull(pointer.Resolve(), Container);

    while (containerToEnter) {
      this.VisitContainer(containerToEnter, true);

      // No content? the most we can do is step past it
      if (containerToEnter.content.length == 0) {
        break;
      }

      pointer = Pointer.StartOf(containerToEnter);
      // containerToEnter = pointer.Resolve() as Container;
      containerToEnter = asOrNull(pointer.Resolve(), Container);
    }

    this.state.currentPointer = pointer.copy();

    if (this._profiler != null) this._profiler.Step(this.state.callStack);

    // Is the current content object:
    //  - Normal content
    //  - Or a logic/flow statement - if so, do it
    // Stop flow if we hit a stack pop when we're unable to pop (e.g. return/done statement in knot
    // that was diverted to rather than called as a function)
    let currentContentObj = pointer.Resolve();

    // When simulating routes, we pause before evaluating conditions so we can force their result
    if (this.pauseBeforeEvaluatingConditions) {
      // Conditional divert?
      const divert = asOrNull(currentContentObj, Divert);
      if (divert && divert.isConditional) {
        const sitePath = this.state.previousPointer.path?.toString();
        if (sitePath) {
          this.pausedBeforeCondition = sitePath;
          return; // do NOT consume; do NOT advance
        }
      }

      // Conditional choice?
      const choicePoint = asOrNull(currentContentObj, ChoicePoint);
      if (choicePoint && choicePoint.hasCondition) {
        const sitePath = this.state.previousPointer.path?.toString();
        if (sitePath) {
          this.pausedBeforeCondition = sitePath;
          return; // do NOT consume; do NOT advance
        }
      }
    }

    let isLogicOrFlowControl =
      this.PerformLogicAndFlowControl(currentContentObj);

    // Has flow been forced to end by flow control above?
    if (this.state.currentPointer.isNull) {
      return;
    }

    if (isLogicOrFlowControl) {
      shouldAddToStream = false;
    }

    // Choice with condition?
    // var choicePoint = currentContentObj as ChoicePoint;
    let choicePoint = asOrNull(currentContentObj, ChoicePoint);
    if (choicePoint) {
      let choice = this.ProcessChoice(choicePoint);
      if (choice) {
        this.state.generatedChoices.push(choice);
      }

      currentContentObj = null;
      shouldAddToStream = false;
    }

    // If the container has no content, then it will be
    // the "content" itself, but we skip over it.
    if (currentContentObj instanceof Container) {
      shouldAddToStream = false;
    }

    // Content to add to evaluation stack or the output stream
    if (shouldAddToStream) {
      // If we're pushing a variable pointer onto the evaluation stack, ensure that it's specific
      // to our current (possibly temporary) context index. And make a copy of the pointer
      // so that we're not editing the original runtime object.
      // var varPointer = currentContentObj as VariablePointerValue;
      let varPointer = asOrNull(currentContentObj, VariablePointerValue);
      if (varPointer && varPointer.contextIndex == -1) {
        currentContentObj = openVariablePointer(
          this.state.callStack,
          varPointer.variableName,
        );
      }

      // Expression evaluation content
      if (this.state.inExpressionEvaluation) {
        this.state.PushEvaluationStack(currentContentObj);
      }
      // Output stream content (i.e. not expression evaluation)
      else {
        this.state.PushToOutputStream(currentContentObj);
      }
    }

    // Increment the content pointer, following diverts if necessary
    this.NextContent();

    // Starting a thread should be done after the increment to the content pointer,
    // so that when returning from the thread, it returns to the content after this instruction.
    // var controlCmd = currentContentObj as ;
    let controlCmd = asOrNull(currentContentObj, ControlCommand);
    if (
      controlCmd &&
      controlCmd.commandType == ControlCommand.CommandType.StartThread
    ) {
      this.state.callStack.PushThread();
    }
  }

  public VisitContainer(container: Container, atStart: boolean) {
    if (!container.countingAtStartOnly || atStart) {
      if (container.visitsShouldBeCounted)
        this.state.IncrementVisitCountForContainer(container);

      if (container.turnIndexShouldBeCounted)
        this.state.RecordTurnIndexVisitToContainer(container);
    }
  }

  private _prevContainers: Container[] = [];
  public VisitChangedContainersDueToDivert() {
    let previousPointer = this.state.previousPointer.copy();
    let pointer = this.state.currentPointer.copy();

    if (pointer.isNull || pointer.index == null) return;

    this._prevContainers.length = 0;
    if (!previousPointer.isNull) {
      // Container prevAncestor = previousPointer.Resolve() as Container ?? previousPointer.container as Container;
      let resolvedPreviousAncestor = previousPointer.Resolve();
      let prevAncestor =
        asOrNull(resolvedPreviousAncestor, Container) ||
        asOrNull(previousPointer.container, Container);
      while (prevAncestor) {
        this._prevContainers.push(prevAncestor);
        // prevAncestor = prevAncestor.parent as Container;
        prevAncestor = asOrNull(prevAncestor.parent, Container);
      }
    }

    let currentChildOfContainer = pointer.Resolve();

    if (currentChildOfContainer == null) return;

    // Container currentContainerAncestor = currentChildOfContainer.parent as Container;
    let currentContainerAncestor = asOrNull(
      currentChildOfContainer.parent,
      Container,
    );
    let allChildrenEnteredAtStart = true;
    while (
      currentContainerAncestor &&
      (this._prevContainers.indexOf(currentContainerAncestor) < 0 ||
        currentContainerAncestor.countingAtStartOnly)
    ) {
      // Check whether this ancestor container is being entered at the start,
      // by checking whether the child object is the first.
      let enteringAtStart =
        currentContainerAncestor.content.length > 0 &&
        currentChildOfContainer == currentContainerAncestor.content[0] &&
        allChildrenEnteredAtStart;

      if (!enteringAtStart) allChildrenEnteredAtStart = false;

      // Mark a visit to this container
      this.VisitContainer(currentContainerAncestor, enteringAtStart);

      currentChildOfContainer = currentContainerAncestor;
      // currentContainerAncestor = currentContainerAncestor.parent as Container;
      currentContainerAncestor = asOrNull(
        currentContainerAncestor.parent,
        Container,
      );
    }
  }

  public PopChoiceStringAndTags(tags: string[]) {
    let choiceOnlyStrVal = asOrThrows(
      this.state.PopEvaluationStack(),
      StringValue,
    );

    while (
      this.state.evaluationStack.length > 0 &&
      asOrNull(this.state.PeekEvaluationStack(), Tag) != null
    ) {
      let tag = asOrNull(this.state.PopEvaluationStack(), Tag);
      if (tag) tags.push(tag.text);
    }
    return choiceOnlyStrVal.value;
  }

  public ProcessChoice(choicePoint: ChoicePoint) {
    let showChoice = true;

    // Don't create choice if choice point doesn't pass conditional
    if (choicePoint.hasCondition) {
      // If a simulator is installed, let it force the boolean (true=visible, false=hidden)
      if (this.simulator) {
        const sitePath = this.state.previousPointer.path?.toString();
        if (sitePath) {
          const forced = this.simulator.forceCondition(sitePath);
          // A null verdict means the route says nothing about this site, so
          // the evaluated value stands.
          if (forced != null) {
            // inject forced verdict as an int (ink booleans are ints)
            this.state.PopEvaluationStack();
            this.state.PushEvaluationStack(new IntValue(forced ? 1 : 0));
          }
        }
      }

      let conditionValue = this.state.PopEvaluationStack();

      if (this.onEvaluateCondition)
        this.onEvaluateCondition(this.IsTruthy(conditionValue));

      if (!this.IsTruthy(conditionValue)) {
        showChoice = false;
      }
    }

    let startText = "";
    let choiceOnlyText = "";
    let tags: string[] = [];

    if (choicePoint.hasChoiceOnlyContent) {
      choiceOnlyText = this.PopChoiceStringAndTags(tags) || "";
    }

    if (choicePoint.hasStartContent) {
      startText = this.PopChoiceStringAndTags(tags) || "";
    }

    // Don't create choice if player has already read this content
    if (choicePoint.onceOnly) {
      let visitCount = this.state.VisitCountForContainer(
        choicePoint.choiceTarget,
      );
      if (visitCount > 0) {
        showChoice = false;
      }
    }

    // We go through the full process of creating the choice above so
    // that we consume the content for it, since otherwise it'll
    // be shown on the output stream.
    if (!showChoice) {
      return null;
    }

    let choice = new Choice();
    choice.targetPath = choicePoint.pathOnChoice;
    choice.sourcePath = choicePoint.path.toString();
    choice.isInvisibleDefault = choicePoint.isInvisibleDefault;
    choice.threadAtGeneration = this.state.callStack.ForkThread();
    choice.tags = tags.reverse(); //C# is a stack
    choice.text = this.state.CleanOutputWhitespace(startText + choiceOnlyText);

    return choice;
  }

  public IsTruthy(obj: InkObject) {
    let truthy = false;
    if (obj instanceof Value) {
      let val = obj;

      if (val instanceof DivertTargetValue) {
        let divTarget = val;
        this.Error(
          "Shouldn't use a divert target (to " +
            divTarget.targetPath +
            ") as a conditional value. Did you intend a function call 'likeThis()' or a read count check 'likeThis'? (no arrows)",
        );
        return false;
      }

      return val.isTruthy;
    }
    return truthy;
  }

  public PerformLogicAndFlowControl(contentObj: InkObject | null) {
    if (contentObj == null) {
      return false;
    }

    // Divert
    if (contentObj instanceof Divert) {
      let currentDivert = contentObj;

      if (currentDivert.isConditional) {
        // If simulator provides a forced value, inject it onto the eval stack.
        if (this.simulator) {
          const sitePath = this.state.previousPointer.path?.toString();
          if (sitePath) {
            const forced = this.simulator.forceCondition(sitePath);
            // A null verdict means the route says nothing about this site (it
            // is past the route's end), so the evaluated value stands.
            if (forced != null) {
              // Inject as int (ink booleans are ints)
              this.state.PopEvaluationStack();
              this.state.PushEvaluationStack(new IntValue(forced ? 1 : 0));
            }
          }
        }

        let conditionValue = this.state.PopEvaluationStack();

        if (this.onEvaluateCondition)
          this.onEvaluateCondition(this.IsTruthy(conditionValue));

        // False conditional? Cancel divert
        if (!this.IsTruthy(conditionValue)) return true;
      }

      if (currentDivert.hasVariableTarget) {
        const target = callVariableTarget(
          this,
          currentDivert.variableDivertName,
          currentDivert.callArgCount,
        ) as ContainerTarget | null;
        if (target === null) {
          return true;
        }
        this.state.divertedPointer = this.PointerAtPath(target.path!);
      } else if (currentDivert.isExternal) {
        this.CallExternalFunction(
          currentDivert.targetPathString,
          currentDivert.externalArgs,
        );
        return true;
      } else if (currentDivert.targetPath == null) {
        // The compiler reported this target as not found; reaching it at
        // runtime is a story error rather than a crash.
        this.Error("Divert target not found.");
      } else {
        this.state.divertedPointer = currentDivert.targetPointer.copy();
        // Static-dispatch function calls, detected via `pushesToStack` +
        // Function push-type — the same pair that marks a divert as a
        // Lua-style function call (vs a knot jump / tunnel), pass the
        // function the arguments the call site pushed arranged for its
        // parameters. A story that does not record the count packed a
        // variadic function's arguments where the call was written, and
        // spreads the last arg's MultiValue for a non-variadic function.
        if (
          currentDivert.pushesToStack &&
          currentDivert.stackPushType === PushPopType.Function
        ) {
          const target = new ContainerTarget(
            currentDivert.targetPointer.container,
          );
          if (currentDivert.callArgCount < 0) {
            spreadLastMultiIfNonVariadic(this, target);
          } else {
            arrangeArgsFor(this, target, currentDivert.callArgCount);
          }
        }
      }

      if (currentDivert.pushesToStack) {
        this.state.callStack.Push(
          currentDivert.stackPushType,
          undefined,
          this.state.outputStream.length,
        );
      }

      if (this.state.divertedPointer.isNull && !currentDivert.isExternal) {
        if (
          currentDivert &&
          currentDivert.debugMetadata &&
          currentDivert.debugMetadata.filePath != null
        ) {
          this.Error(
            "Divert target doesn't exist: " +
              currentDivert.debugMetadata.filePath,
          );
        } else {
          this.Error("Divert resolution failed: " + currentDivert);
        }
      }

      return true;
    }

    // Start/end an expression evaluation? Or print out the result?
    else if (contentObj instanceof ControlCommand) {
      let evalCommand = contentObj;

      switch (evalCommand.commandType) {
        case ControlCommand.CommandType.EvalStart:
          this.Assert(
            this.state.inExpressionEvaluation === false,
            "Already in expression evaluation?",
          );
          this.state.inExpressionEvaluation = true;
          break;

        case ControlCommand.CommandType.EvalEnd:
          this.Assert(
            this.state.inExpressionEvaluation === true,
            "Not in expression evaluation mode",
          );
          this.state.inExpressionEvaluation = false;
          break;

        case ControlCommand.CommandType.EvalOutput:
          // If the expression turned out to be empty, there may not be anything on the stack
          if (this.state.evaluationStack.length > 0) {
            let output = this.state.PopEvaluationStack();

            // Functions may evaluate to Void, in which case we skip output
            if (!(output instanceof Void)) {
              // TODO: Should we really always blanket convert to string?
              // It would be okay to have numbers in the output stream the
              // only problem is when exporting text for viewing, it skips over numbers etc.
              let text = new StringValue(output.toString());

              this.state.PushToOutputStream(text);
            }
          }
          break;

        case ControlCommand.CommandType.NoOp:
          break;

        case ControlCommand.CommandType.Duplicate:
          this.state.PushEvaluationStack(this.state.PeekEvaluationStack()!);
          break;

        case ControlCommand.CommandType.PopEvaluatedValue:
          this.state.PopEvaluationStack();
          break;

        case ControlCommand.CommandType.PopFunction:
        case ControlCommand.CommandType.PopTunnel:
          let popType =
            evalCommand.commandType == ControlCommand.CommandType.PopFunction
              ? PushPopType.Function
              : PushPopType.Tunnel;

          let overrideTunnelReturnTarget: DivertTargetValue | null = null;
          if (popType == PushPopType.Tunnel) {
            let popped = this.state.PopEvaluationStack();
            // overrideTunnelReturnTarget = popped as DivertTargetValue;
            overrideTunnelReturnTarget = asOrNull(popped, DivertTargetValue);
            if (overrideTunnelReturnTarget === null) {
              this.Assert(
                popped instanceof Void,
                "Expected void if ->-> doesn't override target",
              );
            }
          }

          if (this.state.TryExitFunctionEvaluationFromGame()) {
            break;
          } else if (
            this.state.callStack.currentElement!.type != popType ||
            !this.state.callStack.canPop
          ) {
            let names: Map<PushPopType, string> = new Map();
            names.set(
              PushPopType.Function,
              "function return statement (return)",
            );
            names.set(PushPopType.Tunnel, "tunnel onwards statement (->->)");

            let expected = names.get(this.state.callStack.currentElement!.type);
            if (!this.state.callStack.canPop) {
              expected = "end of flow (-> END or choice)";
            }

            let errorMsg =
              "Found " + names.get(popType) + ", when expected " + expected;

            this.Error(errorMsg);
          } else {
            this.state.PopCallStack();

            if (overrideTunnelReturnTarget)
              this.state.divertedPointer = this.PointerAtPath(
                overrideTunnelReturnTarget.targetPath,
              );
          }
          break;

        case ControlCommand.CommandType.BeginString:
          this.state.PushToOutputStream(evalCommand);

          this.Assert(
            this.state.inExpressionEvaluation === true,
            "Expected to be in an expression when evaluating a string",
          );
          this.state.inExpressionEvaluation = false;
          break;

        // Leave it to story.currentText and story.currentTags to sort out the text from the tags
        // This is mostly because we can't always rely on the existence of EndTag, and we don't want
        // to try and flatten dynamic tags to strings every time \n is pushed to output
        case ControlCommand.CommandType.BeginTag:
          this.state.PushToOutputStream(evalCommand);
          break;

        // EndTag has 2 modes:
        //  - When in string evaluation (for choices)
        //  - Normal
        //
        // The only way you could have an EndTag in the middle of
        // string evaluation is if we're currently generating text for a
        // choice, such as:
        //
        //   + choice # tag
        //
        // In the above case, the ink will be run twice:
        //  - First, to generate the choice text. String evaluation
        //    will be on, and the final string will be pushed to the
        //    evaluation stack, ready to be popped to make a Choice
        //    object.
        //  - Second, when ink generates text after choosing the choice.
        //    On this ocassion, it's not in string evaluation mode.
        //
        // On the writing side, we disallow manually putting tags within
        // strings like this:
        //
        //   {"hello # world"}
        //
        // So we know that the tag must be being generated as part of
        // choice content. Therefore, when the tag has been generated,
        // we push it onto the evaluation stack in the exact same way
        // as the string for the choice content.
        case ControlCommand.CommandType.EndTag: {
          if (this.state.inStringEvaluation) {
            captureTag(this, (text) => this.state.CleanOutputWhitespace(text));
          } else {
            // Otherwise! Simply push EndTag, so that in the output stream we
            // have a structure of: [BeginTag, "the tag content", EndTag]
            this.state.PushToOutputStream(evalCommand);
          }
          break;
        }

        case ControlCommand.CommandType.EndString: {
          const captured = captureString(this.state);
          // Return to expression evaluation (from content mode)
          this.state.inExpressionEvaluation = true;
          this.state.PushEvaluationStack(captured);
          break;
        }

        case ControlCommand.CommandType.BeginObject:
          // Marker pushed onto the eval stack — EndObject walks back to it,
          // collecting each (key, value) pair between, and assembles the
          // ObjectValue.
          this.state.PushEvaluationStack(evalCommand);
          break;

        case ControlCommand.CommandType.EndObject: {
          const stack = this.state.evaluationStack;
          let markerIdx = -1;
          for (let i = stack.length - 1; i >= 0; --i) {
            const obj = stack[i];
            const cmd = asOrNull(obj, ControlCommand);
            if (
              cmd &&
              cmd.commandType === ControlCommand.CommandType.BeginObject
            ) {
              markerIdx = i;
              break;
            }
          }
          if (markerIdx < 0) {
            throw new StoryException(
              "Expected BeginObject marker on evaluation stack",
            );
          }
          const between = stack.splice(markerIdx, stack.length - markerIdx);
          // between[0] is the BeginObject marker; the rest are alternating
          // key, value, key, value, ... pairs in push order.
          this.state.PushEvaluationStack(tableFromPairs(between, 1));
          break;
        }

        case ControlCommand.CommandType.IndexValue: {
          const indexKey = this.state.PopEvaluationStack();
          const indexBase = this.state.PopEvaluationStack();
          this.state.PushEvaluationStack(indexValue(this, indexBase, indexKey));
          break;
        }

        case ControlCommand.CommandType.StoreIndex: {
          // Pops value, key, container off the eval stack and mutates
          // container[key] = value in place.
          const storeValue = this.state.PopEvaluationStack();
          const storeKey = this.state.PopEvaluationStack();
          const storeBase = this.state.PopEvaluationStack();
          storeIndex(this, storeBase, storeKey, storeValue);
          break;
        }

        case ControlCommand.CommandType.CallValueAsFunction:
          callValueAsFunction(this, evalCommand._callValueArgCount ?? -1);
          break;

        case ControlCommand.CommandType.BeginScope:
          // Push a new innermost temporary-variable scope on the
          // current call-stack element. Sparkdown emits this at the
          // start of every block (`if`/`for`/`while`/`repeat`/`do`)
          // so `local x` declarations follow Luau's block scoping —
          // an inner `local x` shadows an outer `x` for the rest of
          // the inner block, then the outer is visible again after
          // the matching `EndScope`.
          this.state.callStack.currentElement!.PushScope();
          break;

        case ControlCommand.CommandType.EndScope:
          // Pop the innermost temporary-variable scope. Refuses to
          // pop the outermost (function-level) frame, which would
          // leave the call-stack element with no scope frames at
          // all and break subsequent temp-var lookups.
          this.state.callStack.currentElement!.PopScope(
            this.state.callStack.cellBarrier,
          );
          break;

        case ControlCommand.CommandType.TurnsSince:
        case ControlCommand.CommandType.ReadCount:
          let target = this.state.PopEvaluationStack();
          if (!(target instanceof DivertTargetValue)) {
            let extraNote = "";
            if (target instanceof IntValue)
              extraNote =
                ". Did you accidentally pass a read count ('knot_name') instead of a target ('-> knot_name')?";
            this.Error(
              "TURNS_SINCE / READ_COUNT expected a divert target (knot, stitch, label name), but saw " +
                target +
                extraNote,
            );
            break;
          }

          // var divertTarget = target as DivertTargetValue;
          let divertTarget = asOrThrows(target, DivertTargetValue);
          // var container = ContentAtPath (divertTarget.targetPath).correctObj as Container;
          let container = asOrNull(
            this.ContentAtPath(divertTarget.targetPath).correctObj,
            Container,
          );

          let eitherCount;
          if (container != null) {
            if (
              evalCommand.commandType == ControlCommand.CommandType.TurnsSince
            )
              eitherCount = this.state.TurnsSinceForContainer(container);
            else eitherCount = this.state.VisitCountForContainer(container);
          } else {
            if (
              evalCommand.commandType == ControlCommand.CommandType.TurnsSince
            )
              eitherCount = -1;
            else eitherCount = 0;

            this.Warning(
              "Failed to find container for " +
                evalCommand.toString() +
                " lookup at " +
                divertTarget.targetPath.toString(),
            );
          }

          this.state.PushEvaluationStack(new IntValue(eitherCount));
          break;

        case ControlCommand.CommandType.VisitIndex:
          let count =
            this.state.VisitCountForContainer(
              this.state.currentPointer.container,
            ) - 1; // index not count
          this.state.PushEvaluationStack(new IntValue(count));
          break;

        case ControlCommand.CommandType.HoldForChoices: {
          // The block's own choices are the pending ones whose choice point
          // lies inside the block's container, however the run entered the
          // block. Choices generated elsewhere (before the block, or by a
          // thread started in it) are not the block's.
          let blockContainer = this.state.currentPointer.container;
          for (let i = 0; i < evalCommand._holdLevels; i++) {
            const parent = asOrNull(blockContainer?.parent ?? null, Container);
            if (parent === null) break;
            blockContainer = parent;
          }
          const block = blockContainer?.path.toString() ?? "";
          const offered = this.state.generatedChoices.some(
            (choice) =>
              block === "" ||
              choice.sourcePath === block ||
              choice.sourcePath.startsWith(block + "."),
          );
          if (offered) {
            this.StopFlowInThread();
          }
          break;
        }

        case ControlCommand.CommandType.SequenceShuffleIndex:
          let shuffleIndex = this.NextSequenceShuffleIndex();
          this.state.PushEvaluationStack(new IntValue(shuffleIndex!));
          break;

        case ControlCommand.CommandType.StartThread:
          // Handled in main step function
          break;

        case ControlCommand.CommandType.Done:
          this.StopFlowInThread();
          break;

        // Force flow to end completely
        case ControlCommand.CommandType.End:
          this.state.ForceEnd();
          break;

        case ControlCommand.CommandType.ListFromInt:
          // var intVal = state.PopEvaluationStack () as IntValue;
          let intVal = asOrNull(this.state.PopEvaluationStack(), IntValue);
          // var listNameVal = state.PopEvaluationStack () as StringValue;
          let listNameVal = asOrThrows(
            this.state.PopEvaluationStack(),
            StringValue,
          );

          if (intVal === null) {
            throw new StoryException(
              "Passed non-integer when creating a list element from a numerical value.",
            );
          }

          let generatedListValue = null;

          if (this.listDefinitions === null) {
            return throwNullException("this.listDefinitions");
          }
          let foundListDef = this.listDefinitions.TryListGetDefinition(
            listNameVal.value,
            null,
          );
          if (foundListDef.exists) {
            // Originally a primitive type, but here, can be null.
            // TODO: Replace by default value?
            if (intVal.value === null) {
              return throwNullException("minInt.value");
            }

            let foundItem = foundListDef.result!.TryGetItemWithValue(
              intVal.value,
              InkListItem.Null,
            );
            if (foundItem.exists) {
              generatedListValue = new ListValue(
                foundItem.result!,
                intVal.value,
              );
            }
          } else {
            throw new StoryException(
              "Failed to find list called " + listNameVal.value,
            );
          }

          if (generatedListValue == null) generatedListValue = new ListValue();

          this.state.PushEvaluationStack(generatedListValue);
          break;

        case ControlCommand.CommandType.ListRange:
          let max = asOrNull(this.state.PopEvaluationStack(), Value);
          let min = asOrNull(this.state.PopEvaluationStack(), Value);

          // var targetList = state.PopEvaluationStack () as ListValue;
          let targetList = asOrNull(this.state.PopEvaluationStack(), ListValue);

          if (targetList === null || min === null || max === null)
            throw new StoryException(
              "Expected list, minimum and maximum for LIST_RANGE",
            );

          if (targetList.value === null) {
            return throwNullException("targetList.value");
          }
          let result = targetList.value.ListWithSubRange(
            min.valueObject,
            max.valueObject,
          );

          this.state.PushEvaluationStack(new ListValue(result));
          break;

        case ControlCommand.CommandType.ListRandom: {
          let listVal = this.state.PopEvaluationStack() as ListValue;
          if (listVal === null)
            throw new StoryException("Expected list for LIST_RANDOM");

          let list = listVal.value;

          let newList: InkList | null = null;

          if (list === null) {
            throw throwNullException("list");
          }
          if (list.Count == 0) {
            newList = new InkList();
          } else {
            // Generate a random index for the element to take
            let resultSeed = this.state.storySeed + this.state.previousRandom;
            let random = new PRNG(resultSeed);

            let nextRandom = random.next();
            let listItemIndex = nextRandom % list.Count;

            // This bit is a little different from the original
            // C# code, since iterators do not work in the same way.
            // First, we iterate listItemIndex - 1 times, calling next().
            // The listItemIndex-th time is made outside of the loop,
            // in order to retrieve the value.
            let listEnumerator = list.entries();
            for (let i = 0; i <= listItemIndex - 1; i++) {
              listEnumerator.next();
            }
            let value = listEnumerator.next().value!;
            let randomItem: KeyValuePair<InkListItem, number> = {
              Key: InkListItem.fromSerializedKey(value[0]),
              Value: value[1],
            };

            // Origin list is simply the origin of the one element
            if (randomItem.Key.originName === null) {
              return throwNullException("randomItem.Key.originName");
            }
            newList = new InkList(randomItem.Key.originName, this);
            newList.Add(randomItem.Key, randomItem.Value);

            this.state.previousRandom = nextRandom;
          }

          this.state.PushEvaluationStack(new ListValue(newList));
          break;
        }

        case ControlCommand.CommandType.PackTuple: {
          packTuple(this, evalCommand._tupleArity);
          break;
        }

        case ControlCommand.CommandType.UnpackTuple: {
          unpackTuple(this, evalCommand._tupleArity);
          break;
        }

        case ControlCommand.CommandType.ShortCircuit: {
          // Conditional content-pointer jumps, shared by Lua's
          // short-circuiting `and`/`or` and the `if-then-else`
          // EXPRESSION form. Ops:
          //   - "jump": unconditional skip (no stack interaction) —
          //     emitted after a ternary's then-container to hop over
          //     the else-container.
          //   - "if": pop the condition; falsy skips (over the
          //     then-container + its trailing jump).
          //   - "and"/"or": peek the LHS; if it alone decides the
          //     expression (falsy for `and`, truthy for `or`), leave
          //     it as the result and skip the RHS container,
          //     otherwise pop it so the RHS produces the value.
          // In every case "skip N" means `index += N` here plus
          // Step's tail-end NextContent advancing one further,
          // landing just past N content elements.
          const scOp = evalCommand._shortCircuitOp;
          const jump = () => {
            const p = this.state.currentPointer.copy();
            p.index = (p.index ?? 0) + evalCommand._shortCircuitSkipCount;
            this.state.currentPointer = p;
          };
          if (scOp === "jump") {
            jump();
            break;
          }
          if (scOp === "if") {
            if (!popLuauCondition(this)) {
              jump();
            }
            break;
          }
          if (shortCircuitDecides(this, scOp as "and" | "or")) {
            jump();
          }
          break;
        }

        case ControlCommand.CommandType.RunStdLibFunction: {
          // Generic dispatcher for state-aware Luau builtins. Reads
          // the function name + arity off the ControlCommand instance
          // (set at lower time and round-tripped through the
          // `stdlib:<name>:<arity>` JSON token), looks up the registry,
          // pops `arity` values, and calls the JS implementation
          // with `(story, args)`. If `fn` returns a non-undefined
          // value, push it back onto the eval stack (auto-wrapping
          // JS primitives via `Value.Create`). This replaces the
          // entire per-function ControlCommand boilerplate —
          // adding a new state-aware builtin is now one entry in
          // `STDLIB` in StdLib.ts.
          const name = evalCommand._stdLibName;
          const arity = evalCommand._stdLibArity;
          const entry = lookupStateAwareStdLib(name);
          if (!entry) {
            this.Error(`Unknown stdlib function '${name}'`);
            break;
          }
          // Pop args off the stack in LIFO order, then reverse to
          // hand them to the function in source order (arg 0 first).
          const args: any[] = [];
          for (let i = 0; i < arity; i++) {
            args.unshift(this.state.PopEvaluationStack());
          }
          spreadCallArgs(args);
          pushStdLibResult(this, entry.fn(this, args));
          break;
        }

        default:
          this.Error("unhandled ControlCommand: " + evalCommand);
          break;
      }

      return true;
    }

    // Variable assignment
    else if (contentObj instanceof VariableAssignment) {
      let varAss = contentObj;
      let assignedVal = this.state.PopEvaluationStack();

      // Lua/Luau `local x = f()` where `f` returns multiple values
      // assigns only the FIRST value to `x` and discards the rest, and
      // nil when `f` returns none (`oneValue`). Multi-target assignment
      // uses an `UnpackTuple` ControlCommand upstream, so each
      // `VariableAssignment` in that lowering already receives an
      // unwrapped value — this guard is for the single-target case. The
      // synthetic `__varargs__` slot bound at a variadic function's entry
      // is an exception: it must keep the MultiValue intact so `...` in
      // the body reads back the full tuple of extra args.
      if (!varAss.isVarargsSlot) {
        assignedVal = oneValue(assignedVal);
      }

      this.state.variablesState.Assign(varAss, assignedVal);

      return true;
    }

    // Variable reference
    else if (contentObj instanceof VariableReference) {
      let varRef = contentObj;
      let foundValue = null;

      // Explicit read count value
      if (varRef.pathForCount != null) {
        let container = varRef.containerForCount;
        let count = this.state.VisitCountForContainer(container);
        foundValue = new IntValue(count);
      }

      // Normal variable reference
      else {
        foundValue = readVariable(this, varRef.name);
      }

      this.state.PushEvaluationStack(foundValue);

      return true;
    }

    // Native function call
    else if (contentObj instanceof NativeFunctionCall) {
      let func = contentObj;
      let funcParams = this.state.PopEvaluationStack(func.numberOfParameters);
      this.state.PushEvaluationStack(
        callNativeFunction(this, func, funcParams),
      );
      return true;
    }

    // No control content, must be ordinary content
    return false;
  }

  public ChoosePathString(
    path: string,
    resetCallstack = true,
    args: any[] = [],
  ) {
    this.IfAsyncWeCant("call ChoosePathString right now");
    if (this.onChoosePathString !== null) this.onChoosePathString(path, args);

    if (resetCallstack) {
      this.ResetCallstack();
    } else {
      if (this.state.callStack.currentElement!.type == PushPopType.Function) {
        let funcDetail = "";
        let container =
          this.state.callStack.currentElement!.currentPointer.container;
        if (container != null) {
          funcDetail = "(" + container.path.toString() + ") ";
        }
        throw new Error(
          "Story was running a function " +
            funcDetail +
            "when you called ChoosePathString(" +
            path +
            ") - this is almost certainly not not what you want! Full stack trace: \n" +
            this.state.callStack.callStackTrace,
        );
      }
    }

    // A cut carried output from the path the host is leaving.
    this.state.DiscardLineEnd();
    this.state.PassArgumentsToEvaluationStack(args);
    this.ChoosePath(new Path(path));
  }

  public IfAsyncWeCant(activityStr: string) {
    if (this._asyncContinueActive)
      throw new Error(
        "Can't " +
          activityStr +
          ". Story is in the middle of a ContinueAsync(). Make more ContinueAsync() calls or a single Continue() call beforehand.",
      );
  }

  public ChoosePath(p: Path, incrementingTurnIndex: boolean = true) {
    this._stateIsPristine = false;
    this.state.SetChosenPath(p, incrementingTurnIndex);

    // Take a note of newly visited containers for read counts etc
    this.VisitChangedContainersDueToDivert();
  }

  public ChooseChoiceIndex(choiceIdx: number) {
    choiceIdx = choiceIdx;
    let choices = this.currentChoices;
    this.Assert(
      choiceIdx >= 0 && choiceIdx < choices.length,
      "choice out of range",
    );

    let choiceToChoose = choices[choiceIdx]!;
    this.ChooseChoice(choiceToChoose);
  }

  public ChooseChoice(choiceToChoose: Choice) {
    if (this.onMakeChoice !== null) this.onMakeChoice(choiceToChoose);

    if (choiceToChoose.threadAtGeneration === null) {
      return throwNullException("choiceToChoose.threadAtGeneration");
    }
    if (choiceToChoose.targetPath === null) {
      return throwNullException("choiceToChoose.targetPath");
    }

    const previousPointer = this.state.previousPointer.copy();
    const currentPointer = this.state.currentPointer.copy();

    // What a choice leads to starts a new box, so no line before the choice
    // is one a `..` after it joins.
    this.state.lineJoinable = false;
    this.state.callStack.currentThread = choiceToChoose.threadAtGeneration;

    this.state.previousPointer = previousPointer;
    this.state.currentPointer = currentPointer;

    this.ChoosePath(choiceToChoose.targetPath);
  }

  public HasFunction(functionName: string) {
    try {
      return this.KnotContainerWithName(functionName) != null;
    } catch (e) {
      return false;
    }
  }

  public EvaluateFunction(
    functionName: string,
    args: any[] = [],
    returnTextOutput: boolean = false,
  ): Story.EvaluateFunctionTextOutput | any {
    // EvaluateFunction behaves slightly differently than the C# version.
    // In C#, you can pass a (second) parameter `out textOutput` to get the
    // text outputted by the function. This is not possible in js. Instead,
    // we maintain the regular signature (functionName, args), plus an
    // optional third parameter returnTextOutput. If set to true, we will
    // return both the textOutput and the returned value, as an object.

    if (this.onEvaluateFunction !== null)
      this.onEvaluateFunction(functionName, args);

    this.IfAsyncWeCant("evaluate a function");

    if (functionName == null) {
      throw new Error("Function is null");
    } else if (functionName == "" || functionName.trim() == "") {
      throw new Error("Function is empty or white space.");
    }

    let funcContainer = this.KnotContainerWithName(functionName);
    if (funcContainer == null) {
      throw new Error("Function doesn't exist: '" + functionName + "'");
    }

    let outputStreamBefore: InkObject[] = [];
    outputStreamBefore.push(...this.state.outputStream);
    const lineEnd = this._state.SuspendLineEnd();
    this._state.ResetOutput();

    this.state.StartFunctionEvaluationFromGame(funcContainer, args);
    // A function takes the host's arguments as a call gives them
    // (`arrangeArgsFor`); a flow that binds nothing, as a scene does, takes
    // them as they are.
    const target = new ContainerTarget(funcContainer);
    if (target.bindings > 0) {
      arrangeArgsFor(this, target, args?.length ?? 0);
    }

    // Evaluate the function, and collect the string output
    let stringOutput = new StringBuilder();
    while (this.canContinue) {
      stringOutput.Append(this.Continue());
    }
    let textOutput = stringOutput.toString();

    this._state.ResetOutput(outputStreamBefore);
    this._state.ResumeLineEnd(lineEnd);

    let result = this.state.CompleteFunctionEvaluationFromGame();
    if (this.onCompleteEvaluateFunction != null)
      this.onCompleteEvaluateFunction(functionName, args, textOutput, result);

    return returnTextOutput ? { returned: result, output: textOutput } : result;
  }

  /**
   * Invoke a sparkdown function value from inside a stdlib JS impl,
   * synchronously, and return whatever it pushed onto the eval stack.
   *
   * Unblocks "stdlib that takes a user function":
   * - `table.sort(t, cmp)` — comparator
   * - `string.gsub(s, p, fn)` — replacement
   * - `pcall` / `xpcall` — protected call (the call half)
   *
   * `fnValue` may be:
   * - An `ObjectValue` carrying a closure marker (`__closure_fn` /
   *   `__closure_upvals` / `__closure_user_arity`) — anonymous
   *   function literal with captured upvalues.
   * - A `DivertTargetValue` — bare knot reference (no upvalues).
   * - A `VariablePointerValue` — recursively resolved.
   *
   * Driving the inner call: this routine snapshots callstack depth,
   * eval stack depth, currentPointer, and output stream. It sets up
   * the divert exactly the same way `CallValueAsFunction` does, then
   * loops `Step()` until the inner Function frame pops (callstack
   * back to the snapshot). Return values left above the snapshot
   * eval-stack height are collected and returned. The output stream
   * is restored on the way out so the callback can't leak narrative
   * text into the calling story flow.
   *
   * The callback runs inside the step that called it, so it works the
   * same during `ContinueAsync()` as during `Continue()`: it never
   * starts a continue of its own. Route search's pause before
   * conditions is off while it runs, since the conditions route search
   * forces are the story's decisions, not ones inside a callback.
   *
   * Errors inside the callback propagate via `story.Error`; without
   * a `pcall` trap (#98), they abort the whole story — that's the
   * same behaviour as any other runtime error today.
   */
  public CallLuauFunction(
    fnValue: AbstractValue,
    args: AbstractValue[],
  ): AbstractValue[] {
    // VariablePointerValue: deref and recurse.
    if (fnValue instanceof VariablePointerValue) {
      const resolved = this.state.variablesState.GetVariableWithName(
        fnValue.variableName,
      ) as AbstractValue | null;
      if (resolved == null) {
        throw new StoryException(
          "CallLuauFunction: variable pointer references unresolved variable",
        );
      }
      return this.CallLuauFunction(resolved, args);
    }

    // `__stdlib_fn` marker: stdlib builtin referenced first-class —
    // dispatch the entry directly (there's no ink frame to drive).
    const stdlibResults = tryInvokeStdLibMarkerValue(this, fnValue, args);
    if (stdlibResults != null) return stdlibResults;

    const savedCallStackLen = this.state.callStack.elements.length;
    const savedEvalLen = this.state.evaluationStack.length;
    const savedPointer = this.state.currentPointer.copy();
    const outputStreamBefore: InkObject[] = [...this.state.outputStream];
    const lineEnd = this.state.SuspendLineEnd();
    this.state.ResetOutput();
    const pauseBeforeConditions = this.pauseBeforeEvaluatingConditions;
    this.pauseBeforeEvaluatingConditions = false;

    let path: Path | null = null;
    try {
      // Lua call-site semantics: discard extra args / pad missing
      // with nil (see normalizeLuauCallArgs).
      const callArgs = normalizeLuauCallArgs(this, fnValue, args);
      // Closure case: extractClosureTarget modifies the eval stack
      // (pops user args, pushes upvals, re-pushes user args). So push
      // user args first, then let it rearrange.
      if (fnValue instanceof ObjectValue) {
        for (const a of callArgs) this.state.PushEvaluationStack(a);
        const target = extractClosureTarget(fnValue, this);
        if (target == null) {
          // Not a closure-shaped ObjectValue. Restore stack + bail.
          for (let i = 0; i < callArgs.length; i++)
            this.state.PopEvaluationStack();
          // `__call` metamethod: a plain table is callable when its
          // metatable defines `__call`; Lua rewrites `t(args...)` to
          // `__call(t, args...)`. Recurse with the handler so chained
          // callables (handler itself a `__call` table) also resolve.
          const callHandler = lookupMetamethod(fnValue, "__call");
          if (callHandler != null && !(callHandler instanceof NullValue)) {
            return this.CallLuauFunction(callHandler, [fnValue, ...args]);
          }
          throw new StoryException(
            "CallLuauFunction: ObjectValue is not a closure (missing `__closure_fn`)",
          );
        }
        path = (target as ContainerTarget).path;
      } else if (fnValue instanceof DivertTargetValue) {
        for (const a of callArgs) this.state.PushEvaluationStack(a);
        path = fnValue.value;
      } else {
        throw new StoryException(
          `CallLuauFunction: expected a function value, got ${fnValue}`,
        );
      }

      if (path == null) {
        throw new StoryException(
          "CallLuauFunction: could not resolve function value to a path",
        );
      }

      // Set up the divert exactly like the in-bytecode
      // CallValueAsFunction handler (line ~1755 in this file).
      this.state.divertedPointer = this.PointerAtPath(path);
      this.state.callStack.Push(
        PushPopType.Function,
        undefined,
        this.state.outputStream.length,
      );
      // CRITICAL: when the in-bytecode CallValueAsFunction sets up
      // the divert, Step's tail-end `NextContent()` consumes
      // `divertedPointer` to advance to the function body. Since
      // we're calling from JS (outside the op-processing path), we
      // must drive `NextContent()` manually first — otherwise the
      // next `Step()` will re-process the current op (the
      // `RunStdLibFunction` for OUR caller), re-entering us with
      // the wrong eval-stack state.
      this.NextContent();

      // Drive Step until the inner Function frame pops back. Bound the
      // steps to avoid hangs on misbehaving callbacks, counting the steps
      // of callbacks nested inside this one, which all run inside one of
      // its own steps.
      const MAX_STEPS = 100000;
      const firstStep = this.stepCount;
      while (
        this.state.callStack.elements.length > savedCallStackLen &&
        !this.state.currentPointer.isNull
      ) {
        this.Step();
        if (this.stepCount - firstStep > MAX_STEPS) {
          throw new StoryException(
            "CallLuauFunction: callback exceeded step limit (possible infinite loop)",
          );
        }
      }

      // Collect return values left above the saved eval-stack height.
      const results: AbstractValue[] = [];
      while (this.state.evaluationStack.length > savedEvalLen) {
        results.unshift(this.state.PopEvaluationStack() as AbstractValue);
      }
      return results;
    } catch (e) {
      // The pointer is restored to the caller's below, so an error the
      // callback raised keeps the path of the content that raised it. An
      // error from a callback nested inside this one already carries its own.
      if (e instanceof StoryException && e.raisedPath == null) {
        e.raisedPath = this.state.currentPointer.path?.toString() ?? null;
      }
      throw e;
    } finally {
      // Restore everything — output stream, currentPointer (in case
      // the inner ~ret restored it to something unexpected), and
      // ensure we don't leave the callstack inflated if an exception
      // unwound mid-call.
      while (this.state.callStack.elements.length > savedCallStackLen) {
        this.state.PopCallStack();
      }
      this.state.currentPointer = savedPointer;
      this.state.ResetOutput(outputStreamBefore);
      this.state.ResumeLineEnd(lineEnd);
      this.pauseBeforeEvaluatingConditions = pauseBeforeConditions;
    }
  }

  /**
   * Protected variant of `CallLuauFunction`. Implements `pcall`'s
   * trap: drive the inner function; if it throws a `StoryException`
   * (from `story.Error`) or adds a runtime error to
   * `state.currentErrors`, capture the message and return
   * `{ ok: false, errorMessage }` instead of letting the error
   * abort the story.
   *
   * The trapped error is REMOVED from `state.currentErrors` — pcall's
   * contract is "the error doesn't escape the protected block." If
   * the user wants to surface it, they re-raise or log it via the
   * second return.
   */
  public CallLuauFunctionProtected(
    fnValue: AbstractValue,
    args: AbstractValue[],
  ): {
    ok: boolean;
    values: AbstractValue[];
    errorMessage?: string;
  } {
    if (fnValue instanceof VariablePointerValue) {
      const resolved = this.state.variablesState.GetVariableWithName(
        fnValue.variableName,
      ) as AbstractValue | null;
      if (resolved == null) {
        return {
          ok: false,
          values: [],
          errorMessage:
            "pcall: variable pointer references unresolved variable",
        };
      }
      return this.CallLuauFunctionProtected(resolved, args);
    }

    // `__stdlib_fn` marker: stdlib builtin referenced first-class
    // (e.g. `pcall(rawequal, "a", "a")`). Dispatch the entry directly
    // and trap anything it raises — both `story.Error` throws and
    // errors recorded on `state.currentErrors`.
    if (
      fnValue instanceof ObjectValue &&
      (fnValue.value as Map<string, AbstractValue>)?.get("__stdlib_fn") != null
    ) {
      const errCountBefore = this.state.currentErrors?.length ?? 0;
      try {
        const values = tryInvokeStdLibMarkerValue(this, fnValue, args);
        if (values != null) {
          const errsNow = this.state.currentErrors;
          if (errsNow && errsNow.length > errCountBefore) {
            const msg = errsNow[errCountBefore]!;
            errsNow.length = errCountBefore;
            return { ok: false, values: [], errorMessage: msg };
          }
          return { ok: true, values };
        }
      } catch (e) {
        if (e instanceof StoryException) {
          const errsNow = this.state.currentErrors;
          if (errsNow && errsNow.length > errCountBefore) {
            errsNow.length = errCountBefore;
          }
          return { ok: false, values: [], errorMessage: e.message };
        }
        throw e;
      }
    }

    const savedCallStackLen = this.state.callStack.elements.length;
    const savedEvalLen = this.state.evaluationStack.length;
    const savedPointer = this.state.currentPointer.copy();
    const outputStreamBefore: InkObject[] = [...this.state.outputStream];
    const savedErrorCount = this.state.currentErrors?.length ?? 0;
    const lineEnd = this.state.SuspendLineEnd();
    this.state.ResetOutput();
    const pauseBeforeConditions = this.pauseBeforeEvaluatingConditions;
    this.pauseBeforeEvaluatingConditions = false;

    let path: Path | null = null;
    let trappedError: string | null = null;
    try {
      // Lua call-site semantics: discard extra args / pad missing
      // with nil (see normalizeLuauCallArgs).
      const callArgs = normalizeLuauCallArgs(this, fnValue, args);
      if (fnValue instanceof ObjectValue) {
        for (const a of callArgs) this.state.PushEvaluationStack(a);
        const target = extractClosureTarget(fnValue, this);
        if (target == null) {
          for (let i = 0; i < callArgs.length; i++)
            this.state.PopEvaluationStack();
          // `__call` metamethod: same callable-table rewrite as
          // CallLuauFunction — `t(args...)` → `__call(t, args...)`.
          const callHandler = lookupMetamethod(fnValue, "__call");
          if (callHandler != null && !(callHandler instanceof NullValue)) {
            return this.CallLuauFunctionProtected(callHandler, [
              fnValue,
              ...args,
            ]);
          }
          return {
            ok: false,
            values: [],
            errorMessage:
              "pcall: target ObjectValue is not a closure (missing `__closure_fn`)",
          };
        }
        path = (target as ContainerTarget).path;
      } else if (fnValue instanceof DivertTargetValue) {
        for (const a of callArgs) this.state.PushEvaluationStack(a);
        path = fnValue.value;
      } else {
        return {
          ok: false,
          values: [],
          errorMessage: `pcall: expected a function value, got ${fnValue}`,
        };
      }

      if (path == null) {
        return {
          ok: false,
          values: [],
          errorMessage: "pcall: could not resolve function value to a path",
        };
      }

      this.state.divertedPointer = this.PointerAtPath(path);
      this.state.callStack.Push(
        PushPopType.Function,
        undefined,
        this.state.outputStream.length,
      );
      this.NextContent();

      // Bounded as in `CallLuauFunction`, nested callbacks' steps included.
      const MAX_STEPS = 100000;
      const firstStep = this.stepCount;
      while (
        this.state.callStack.elements.length > savedCallStackLen &&
        !this.state.currentPointer.isNull
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
        // Also check the "errors added without throwing" path —
        // some stdlib impls call `story.AddError` directly rather
        // than `story.Error`. Truncate any new errors so they don't
        // surface to the host, and treat the first as our message.
        const errs = this.state.currentErrors;
        if (errs && errs.length > savedErrorCount) {
          trappedError = errs[savedErrorCount]!;
          // Truncate.
          errs.length = savedErrorCount;
          break;
        }
        if (this.stepCount - firstStep > MAX_STEPS) {
          trappedError =
            "pcall: callback exceeded step limit (possible infinite loop)";
          break;
        }
      }

      // Truncate any errors added during the call (covers errors
      // added via story.AddError between the last check and now).
      const errs2 = this.state.currentErrors;
      if (errs2 && errs2.length > savedErrorCount) {
        if (trappedError == null) trappedError = errs2[savedErrorCount]!;
        errs2.length = savedErrorCount;
      }

      if (trappedError != null) {
        return { ok: false, values: [], errorMessage: trappedError };
      }

      const results: AbstractValue[] = [];
      while (this.state.evaluationStack.length > savedEvalLen) {
        results.unshift(this.state.PopEvaluationStack() as AbstractValue);
      }
      // Empty-return functions push a `Void` sentinel at PopFunction
      // time. From pcall's perspective that's "the function returned
      // zero values" — so `pcall(function() end)` returns just
      // `(true)` rather than `(true, void)`. Strip leading Voids so
      // the wrapping `MultiValue([true, ...values])` in `pcall` /
      // `xpcall` reflects the actual return count Lua sees.
      while (results.length > 0 && results[0] instanceof Void) {
        results.shift();
      }
      return { ok: true, values: results };
    } finally {
      while (this.state.callStack.elements.length > savedCallStackLen) {
        this.state.PopCallStack();
      }
      // Drop any partial eval-stack residue from a failed call.
      while (this.state.evaluationStack.length > savedEvalLen) {
        this.state.PopEvaluationStack();
      }
      this.state.currentPointer = savedPointer;
      this.state.ResetOutput(outputStreamBefore);
      this.state.ResumeLineEnd(lineEnd);
      this.pauseBeforeEvaluatingConditions = pauseBeforeConditions;
    }
  }

  public EvaluateExpression(exprContainer: Container) {
    let startCallStackHeight = this.state.callStack.elements.length;

    this.state.callStack.Push(PushPopType.Tunnel);

    this._temporaryEvaluationContainer = exprContainer;

    this.state.GoToStart();

    let evalStackHeight = this.state.evaluationStack.length;

    this.Continue();

    this._temporaryEvaluationContainer = null;

    // Should have fallen off the end of the Container, which should
    // have auto-popped, but just in case we didn't for some reason,
    // manually pop to restore the state (including currentPath).
    if (this.state.callStack.elements.length > startCallStackHeight) {
      this.state.PopCallStack();
    }

    let endStackHeight = this.state.evaluationStack.length;
    if (endStackHeight > evalStackHeight) {
      return this.state.PopEvaluationStack();
    } else {
      return null;
    }
  }

  public allowExternalFunctionFallbacks: boolean = false;

  public collapseWhitespace: boolean = true;

  public processEscapes: boolean = true;

  /**
   * Optional callback that formats the message passed to the `error`
   * stdlib BEFORE it's thrown. The default behaviour passes the
   * message through unchanged, matching how an LSP host wants
   * errors (it shows source/line separately in its own UI).
   *
   * The conformance test harness sets this to prepend
   * `<sourceBasename>:<line>: ` so Luau-spec assertions like
   * `pcall(function() error("oops") end)` returning
   * `"<file>:<line>: oops"` can be checked precisely.
   *
   * Signature: receives `this` story and the raw message, returns
   * the formatted string. Implementations typically read
   * `story.currentDebugMetadata` to look up source/line info.
   */
  public errorMessageFormatter?: (story: Story, message: string) => string;

  public CallExternalFunction(
    funcName: string | null,
    numberOfArguments: number,
  ) {
    if (funcName === null) {
      return throwNullException("funcName");
    }
    let funcDef = this._externals.get(funcName);
    let fallbackFunctionContainer = null;

    let foundExternal = typeof funcDef !== "undefined";

    if (!foundExternal) {
      if (this.allowExternalFunctionFallbacks) {
        fallbackFunctionContainer = this.KnotContainerWithName(funcName);
        this.Assert(
          fallbackFunctionContainer !== null,
          "Trying to call external function '" +
            funcName +
            "' which has not been bound, and fallback ink function could not be found.",
        );

        // Divert direct into fallback function and we're done
        this.state.callStack.Push(
          PushPopType.Function,
          undefined,
          this.state.outputStream.length,
        );
        this.state.divertedPointer = Pointer.StartOf(fallbackFunctionContainer);
        return;
      } else {
        this.Assert(
          false,
          "Trying to call external function '" +
            funcName +
            "' which has not been bound (and ink fallbacks disabled).",
        );
      }
    }

    // Pop arguments
    let args: any[] = [];
    for (let i = 0; i < numberOfArguments; ++i) {
      // var poppedObj = state.PopEvaluationStack () as Value;
      let poppedObj = asOrThrows(this.state.PopEvaluationStack(), Value);
      let valueObj = poppedObj.valueObject;
      args.push(valueObj);
    }

    // Reverse arguments from the order they were popped,
    // so they're the right way round again.
    args.reverse();

    // Run the function!
    let funcResult = funcDef!.function(args);

    // Convert return value (if any) to the a type that the ink engine can use
    let returnObj = null;
    if (funcResult != null) {
      returnObj = Value.Create(funcResult);
      this.Assert(
        returnObj !== null,
        "Could not create ink value from returned object of type " +
          typeof funcResult,
      );
    } else {
      returnObj = new Void();
    }

    this.state.PushEvaluationStack(returnObj);
  }

  public BindExternalFunctionGeneral(
    funcName: string,
    func: Story.ExternalFunction,
  ) {
    this.IfAsyncWeCant("bind an external function");
    this.Assert(
      !this._externals.has(funcName),
      "Function '" + funcName + "' has already been bound.",
    );
    this._externals.set(funcName, { function: func });
  }

  public TryCoerce(value: any) {
    // We're skipping type coercition in this implementation. First of, js
    // is loosely typed, so it's not that important. Secondly, there is no
    // clean way (AFAIK) for the user to describe what type of parameters
    // they expect.
    return value;
  }

  public BindExternalFunction(funcName: string, func: Story.ExternalFunction) {
    this.Assert(func != null, "Can't bind a null function");

    this.BindExternalFunctionGeneral(
      funcName,
      (args: any) => {
        this.Assert(
          args.length >= func.length,
          "External function expected " + func.length + " arguments",
        );

        let coercedArgs = [];
        for (let i = 0, l = args.length; i < l; i++) {
          coercedArgs[i] = this.TryCoerce(args[i]);
        }
        return func.apply(null, coercedArgs);
      },
    );
  }

  public UnbindExternalFunction(funcName: string) {
    this.IfAsyncWeCant("unbind an external a function");
    this.Assert(
      this._externals.has(funcName),
      "Function '" + funcName + "' has not been bound.",
    );
    this._externals.delete(funcName);
  }

  public ValidateExternalBindings(): void;
  public ValidateExternalBindings(
    c: Container | null,
    missingExternals: Set<string>,
  ): void;
  public ValidateExternalBindings(
    o: InkObject | null,
    missingExternals: Set<string>,
  ): void;
  public ValidateExternalBindings() {
    let c: Container | null = null;
    let o: InkObject | null = null;
    let missingExternals: Set<string> = arguments[1] || new Set();

    if (arguments[0] instanceof Container) {
      c = arguments[0];
    }

    if (arguments[0] instanceof InkObject) {
      o = arguments[0];
    }

    if (c === null && o === null) {
      this.ValidateExternalBindings(
        this._mainContentContainer,
        missingExternals,
      );
      this._hasValidatedExternals = true;

      // No problem! Validation complete
      if (missingExternals.size == 0) {
        this._hasValidatedExternals = true;
      } else {
        let message = "Error: Missing function binding for external";
        message += missingExternals.size > 1 ? "s" : "";
        message += ": '";
        message += Array.from(missingExternals).join("', '");
        message += "' ";
        message += this.allowExternalFunctionFallbacks
          ? ", and no fallback ink function found."
          : " (ink fallbacks disabled)";

        this.Error(message);
      }
    } else if (c != null) {
      for (let innerContent of c.content) {
        let container = innerContent as Container;
        if (container == null || !container.hasValidName)
          this.ValidateExternalBindings(innerContent, missingExternals);
      }
      for (let [, value] of c.namedContent) {
        this.ValidateExternalBindings(
          asOrNull(value, InkObject),
          missingExternals,
        );
      }
    } else if (o != null) {
      let divert = asOrNull(o, Divert);
      if (divert && divert.isExternal) {
        let name = divert.targetPathString;
        if (name === null) {
          return throwNullException("name");
        }
        if (!this._externals.has(name)) {
          if (this.allowExternalFunctionFallbacks) {
            let fallbackFound =
              this.mainContentContainer.namedContent.has(name);
            if (!fallbackFound) {
              missingExternals.add(name);
            }
          } else {
            missingExternals.add(name);
          }
        }
      }
    }
  }

  public ObserveVariable(
    variableName: string,
    observer: Story.VariableObserver,
  ) {
    this.IfAsyncWeCant("observe a new variable");

    if (this._variableObservers === null) this._variableObservers = new Map();

    if (!this.state.variablesState.GlobalVariableExistsWithName(variableName))
      throw new Error(
        "Cannot observe variable '" +
          variableName +
          "' because it wasn't declared in the ink story.",
      );

    if (this._variableObservers.has(variableName)) {
      this._variableObservers.get(variableName)!.push(observer);
    } else {
      this._variableObservers.set(variableName, [observer]);
    }
  }

  public ObserveVariables(
    variableNames: string[],
    observers: Story.VariableObserver[],
  ) {
    for (let i = 0, l = variableNames.length; i < l; i++) {
      this.ObserveVariable(variableNames[i]!, observers[i]!);
    }
  }

  public RemoveVariableObserver(
    observer?: Story.VariableObserver,
    specificVariableName?: string,
  ) {
    // A couple of things to know about this method:
    //
    // 1. Since `RemoveVariableObserver` is exposed to the JavaScript world,
    //    optionality is marked as `undefined` rather than `null`.
    //    To keep things simple, null-checks are performed using regular
    //    equality operators, where undefined == null.
    //
    // 2. Since C# delegates are translated to arrays of functions,
    //    -= becomes a call to splice and null-checks are replaced by
    //    emptiness-checks.
    //
    this.IfAsyncWeCant("remove a variable observer");

    if (this._variableObservers === null) return;

    if (specificVariableName != null) {
      if (this._variableObservers.has(specificVariableName)) {
        if (observer != null) {
          let variableObservers =
            this._variableObservers.get(specificVariableName);
          if (variableObservers != null) {
            variableObservers.splice(variableObservers.indexOf(observer), 1);
            if (variableObservers.length === 0) {
              this._variableObservers.delete(specificVariableName);
            }
          }
        } else {
          this._variableObservers.delete(specificVariableName);
        }
      }
    } else if (observer != null) {
      let keys = this._variableObservers.keys();
      for (let varName of keys) {
        let variableObservers = this._variableObservers.get(varName);
        if (variableObservers != null) {
          variableObservers.splice(variableObservers.indexOf(observer), 1);
          if (variableObservers.length === 0) {
            this._variableObservers.delete(varName);
          }
        }
      }
    }
  }

  public VariableStateDidChangeEvent(
    variableName: string,
    newValueObj: InkObject,
  ) {
    // Before the observer check below: a global written from outside the story
    // leaves the state no longer the one a reset built, whether or not anybody
    // is watching that variable.
    this._stateIsPristine = false;

    if (this._variableObservers === null) return;

    let observers = this._variableObservers.get(variableName);
    if (typeof observers !== "undefined") {
      if (!(newValueObj instanceof Value)) {
        throw new Error(
          "Tried to get the value of a variable that isn't a standard type",
        );
      }
      // var val = newValueObj as Value;
      let val = asOrThrows(newValueObj, Value);

      for (let observer of observers) {
        observer(variableName, val.valueObject);
      }
    }
  }

  get globalTags() {
    return this.TagsAtStartOfFlowContainerWithPathString("");
  }

  public TagsForContentAtPath(path: string) {
    return this.TagsAtStartOfFlowContainerWithPathString(path);
  }

  public TagsAtStartOfFlowContainerWithPathString(pathString: string) {
    let path = new Path(pathString);

    let flowContainer = this.ContentAtPath(path).container;
    if (flowContainer === null) {
      return throwNullException("flowContainer");
    }
    // Descend into the first sub-container as long as it's a structural
    // wrapper around the real flow body (vanilla ink shape). Stop the
    // descent if this level already has MULTIPLE consecutive per-line
    // tag wrapper containers at the front — that's sparkdown's per-line
    // tag layout, and we need to walk all those siblings to collect
    // every leading tag, not just the first one. (When there's only a
    // single leading tag wrapper, descending into it gives identical
    // results to walking the wrapper's contents from outside.)
    const isTagWrapper = (obj: InkObject | undefined): boolean => {
      if (!(obj instanceof Container)) return false;
      const first = obj.content[0];
      const cmd = asOrNull(first, ControlCommand);
      return (
        cmd != null && cmd.commandType == ControlCommand.CommandType.BeginTag
      );
    };
    while (true) {
      let firstContent: InkObject = flowContainer.content[0]!;
      if (firstContent instanceof Container) {
        if (
          isTagWrapper(firstContent) &&
          isTagWrapper(flowContainer.content[1])
        ) {
          break;
        }
        flowContainer = firstContent;
      } else break;
    }

    let inTag = false;
    let tags: string[] | null = null;

    // Collect every BeginTag/StringValue/EndTag triplet at the start of
    // the flow. Sparkdown's compile pipeline chunks each top-level
    // `# tag` line into its own sibling display-line container, so the
    // walk must descend into those wrapper containers as long as they
    // hold ONLY tag triplets (no non-tag runtime content). The vanilla
    // ink form produces a single container with tags as flat children,
    // which this loop still handles via the non-Container branch.
    const pushFromSequence = (items: ReadonlyArray<InkObject>): boolean => {
      // Returns `true` to keep walking later siblings; `false` once a
      // non-tag, non-control-command item ends the run of leading tags.
      for (const c of items) {
        const command = asOrNull(c, ControlCommand);
        if (command != null) {
          if (command.commandType == ControlCommand.CommandType.BeginTag) {
            inTag = true;
          } else if (
            command.commandType == ControlCommand.CommandType.EndTag
          ) {
            inTag = false;
          }
          continue;
        }
        if (inTag) {
          const str = asOrNull(c, StringValue);
          if (str !== null) {
            if (tags === null) tags = [];
            if (str.value !== null) tags.push(str.value);
          } else {
            this.Error(
              "Tag contained non-text content. Only plain text is allowed when using globalTags or TagsAtContentPath. If you want to evaluate dynamic content, you need to use story.Continue().",
            );
          }
          continue;
        }
        // A wrapper container at the front of the flow: descend if its
        // first item is a BeginTag (this is sparkdown's per-line tag
        // wrapper). Otherwise the run of leading tags has ended.
        const innerContainer = asOrNull(c, Container);
        if (innerContainer != null) {
          const innerFirst = innerContainer.content[0];
          const innerCommand = asOrNull(innerFirst, ControlCommand);
          if (
            innerCommand != null &&
            innerCommand.commandType == ControlCommand.CommandType.BeginTag
          ) {
            if (!pushFromSequence(innerContainer.content)) return false;
            continue;
          }
        }
        return false;
      }
      return true;
    };

    pushFromSequence(flowContainer.content);

    return tags;
  }

  public BuildStringOfHierarchy() {
    let sb = new StringBuilder();

    this.mainContentContainer.BuildStringOfHierarchy(
      sb,
      0,
      this.state.currentPointer.Resolve(),
    );

    return sb.toString();
  }

  public BuildStringOfContainer(container: Container) {
    let sb = new StringBuilder();
    container.BuildStringOfHierarchy(
      sb,
      0,
      this.state.currentPointer.Resolve(),
    );
    return sb.toString();
  }

  // What `done` does: ends the current thread, or ends the flow safely when
  // no thread is left to pop.
  protected StopFlowInThread() {
    // We may exist in the context of the initial
    // act of creating the thread, or in the context of
    // evaluating the content.
    if (this.state.callStack.canPopThread) {
      this.state.callStack.PopThread();
    }

    // In normal flow - allow safe exit without warning
    else {
      this.state.didSafeExit = true;

      // Stop flow in current thread
      this.state.currentPointer = Pointer.Null;
    }
  }

  // Reports a content path the story ran (`onExecute`). While a line end
  // waits, which continue shows what the path ran for is not yet known, so the
  // path is held (`StoryState.heldPaths`) until the run shows something or the
  // continue ends.
  // The pointer's path is read only when a host listens, as reading it is not
  // safe for every pointer the story steps through.
  protected AnnounceExecution(pointer: Pointer) {
    if (this.onExecute === null) return;
    const path = pointer.path?.toString();
    if (this.state.lineEndPending || this.state.outputCut !== null) {
      if (path !== undefined) this.state.heldPaths.push(path);
      return;
    }
    this.onExecute(path);
  }

  public NextContent() {
    this.state.previousPointer = this.state.currentPointer.copy();

    if (!this.state.divertedPointer.isNull) {
      this.AnnounceExecution(this.state.currentPointer);

      this.state.currentPointer = this.state.divertedPointer.copy();
      this.state.divertedPointer = Pointer.Null;

      this.VisitChangedContainersDueToDivert();

      if (!this.state.currentPointer.isNull) {
        return;
      }
    }

    this.AnnounceExecution(this.state.previousPointer);

    let successfulPointerIncrement = this.IncrementContentPointer();

    if (!successfulPointerIncrement) {
      let didPop = false;

      if (this.state.callStack.CanPop(PushPopType.Function)) {
        this.state.PopCallStack(PushPopType.Function);

        if (this.state.inExpressionEvaluation) {
          this.state.PushEvaluationStack(new Void());
        }

        didPop = true;
      } else if (this.state.callStack.canPopThread) {
        this.state.callStack.PopThread();

        didPop = true;
      } else if (this.state.TryExitFunctionEvaluationFromGame()) {
        // A function a host evaluates returns no value when it runs off its
        // end, as a function a call enters does, whatever arguments it left.
        this.state.PushEvaluationStack(new Void());
      }

      if (didPop && !this.state.currentPointer.isNull) {
        this.NextContent();
      }
    }
  }

  public IncrementContentPointer() {
    let successfulIncrement = true;

    let pointer = this.state.currentPointer.copy();
    pointer.index ??= 0;
    pointer.index++;

    if (pointer.container === null) {
      return throwNullException("pointer.container");
    }
    while (
      pointer.index != null &&
      pointer.index >= pointer.container.content.length
    ) {
      successfulIncrement = false;

      // Container nextAncestor = pointer.container.parent as Container;
      let nextAncestor = asOrNull(pointer.container.parent, Container);
      if (nextAncestor instanceof Container === false) {
        break;
      }

      let indexInAncestor = nextAncestor!.content.indexOf(pointer.container);
      if (indexInAncestor == -1) {
        break;
      }

      pointer = new Pointer(nextAncestor, indexInAncestor);

      pointer.index ??= 0;
      pointer.index++;

      successfulIncrement = true;
      if (pointer.container === null) {
        return throwNullException("pointer.container");
      }
    }

    if (!successfulIncrement) pointer = Pointer.Null;

    this.state.callStack.currentElement!.previousPointer =
      this.state.callStack.currentElement!.currentPointer.copy();
    this.state.callStack.currentElement!.currentPointer = pointer.copy();

    return successfulIncrement;
  }

  public TryFollowDefaultInvisibleChoice() {
    let allChoices = this._state.currentChoices;

    let invisibleChoices = allChoices.filter((c) => c.isInvisibleDefault);

    if (
      invisibleChoices.length == 0 ||
      allChoices.length > invisibleChoices.length
    )
      return false;

    let choice = invisibleChoices[0];

    if (choice!.targetPath === null) {
      return throwNullException("choice.targetPath");
    }

    if (choice!.threadAtGeneration === null) {
      return throwNullException("choice.threadAtGeneration");
    }

    this.state.callStack.currentThread = choice!.threadAtGeneration;

    this.ChoosePath(choice!.targetPath, false);

    return true;
  }

  public NextSequenceShuffleIndex() {
    // var numElementsIntVal = state.PopEvaluationStack () as IntValue;
    let numElementsIntVal = asOrNull(this.state.PopEvaluationStack(), IntValue);
    if (!(numElementsIntVal instanceof IntValue)) {
      this.Error("expected number of elements in sequence for shuffle index");
      return 0;
    }

    let seqContainer = this.state.currentPointer.container;
    if (seqContainer === null) {
      return throwNullException("seqContainer");
    }

    // Originally a primitive type, but here, can be null.
    // TODO: Replace by default value?
    if (numElementsIntVal.value === null) {
      return throwNullException("numElementsIntVal.value");
    }
    let numElements = numElementsIntVal.value;

    // var seqCountVal = state.PopEvaluationStack () as IntValue;
    let seqCountVal = asOrThrows(this.state.PopEvaluationStack(), IntValue);
    let seqCount = seqCountVal.value;

    // Originally a primitive type, but here, can be null.
    // TODO: Replace by default value?
    if (seqCount === null) {
      return throwNullException("seqCount");
    }

    return sequenceShuffleIndex(
      seqContainer.path.toString(),
      seqCount,
      numElements,
      this.state.storySeed,
    );
  }

  public Error(message: string, useEndLineNumber = false): never {
    let e = new StoryException(message);
    e.useEndLineNumber = useEndLineNumber;
    throw e;
  }

  /** Raise `message` in place of `cause`, an error a callback raised, keeping
   *  where the callback raised it. */
  public ErrorFrom(message: string, cause: unknown): never {
    let e = new StoryException(message);
    if (cause instanceof StoryException) {
      e.raisedPath = cause.raisedPath;
    }
    throw e;
  }

  public Warning(message: string) {
    this.AddError(message, true);
  }

  public AddError(
    message: string,
    isWarning = false,
    useEndLineNumber = false,
    raisedPath: string | null = null,
  ) {
    let dm = this.currentDebugMetadata;

    // The content being executed as the error is raised, unless the error
    // names it itself (`StoryException.raisedPath`). An error raised after the
    // story ran out of content has no current pointer, so it names the last
    // content that ran.
    const at = this.state.currentPointer.isNull
      ? this.state.previousPointer
      : this.state.currentPointer;
    const raised: RaisedError = {
      message,
      path: raisedPath ?? at.path?.toString() ?? null,
    };

    let errorTypeStr = isWarning ? "WARNING" : "ERROR";

    if (dm != null) {
      let lineNum = useEndLineNumber ? dm.endLineNumber : dm.startLineNumber;
      message =
        "RUNTIME " +
        errorTypeStr +
        ": '" +
        dm.fileName +
        "' line " +
        lineNum +
        ": " +
        message;
    } else if (!this.state.currentPointer.isNull) {
      message =
        "RUNTIME " +
        errorTypeStr +
        ": (" +
        this.state.currentPointer +
        "): " +
        message;
    } else {
      message = "RUNTIME " + errorTypeStr + ": " + message;
    }

    this.state.AddError(message, isWarning, raised);

    // In a broken state don't need to know about any other errors.
    if (!isWarning) this.state.ForceEnd();
  }

  public Assert(condition: boolean, message: string | null = null) {
    if (condition == false) {
      if (message == null) {
        message = "Story assert";
      }

      throw new Error(message + " " + this.currentDebugMetadata);
    }
  }

  get currentDebugMetadata(): DebugMetadata | null {
    let dm: DebugMetadata | null;

    let pointer = this.state.currentPointer;
    if (!pointer.isNull && pointer.Resolve() !== null) {
      dm = pointer.Resolve()!.debugMetadata;
      if (dm !== null) {
        return dm;
      }
    }

    for (let i = this.state.callStack.elements.length - 1; i >= 0; --i) {
      pointer = this.state.callStack.elements[i]!.currentPointer;
      if (!pointer.isNull && pointer.Resolve() !== null) {
        dm = pointer.Resolve()!.debugMetadata;
        if (dm !== null) {
          return dm;
        }
      }
    }

    for (let i = this.state.outputStream.length - 1; i >= 0; --i) {
      let outputObj = this.state.outputStream[i];
      dm = outputObj!.debugMetadata;
      if (dm !== null) {
        return dm;
      }
    }

    return null;
  }

  get mainContentContainer() {
    if (this._temporaryEvaluationContainer) {
      return this._temporaryEvaluationContainer;
    } else {
      return this._mainContentContainer;
    }
  }

  /**
   * `_mainContentContainer` is almost guaranteed to be set in the
   * constructor, unless the json is malformed.
   */
  private _mainContentContainer!: Container;
  private _listDefinitions: ListDefinitionsOrigin | null = null;
  /** Names declared with `const` — see where `rootObject["constants"]` is read. */
  private _constantNames: Set<string> = new Set<string>();
  get constantNames(): Set<string> {
    return this._constantNames;
  }

  private _structDefinitions: Record<string, any> | null = null;

  private _externals: Map<string, Story.ExternalFunctionDef>;
  private _variableObservers: Map<string, Story.VariableObserver[]> | null =
    null;
  private _hasValidatedExternals: boolean = false;

  private _temporaryEvaluationContainer: Container | null = null;

  /**
   * `state` is almost guaranteed to be set in the constructor, unless
   * using the compiler-specific constructor which will likely not be used in
   * the real world.
   */
  private _state!: StoryState;

  /** True while the state is the one `ResetState` built and nothing has run
   *  against it yet. See {@link stateIsPristine}. */
  private _stateIsPristine: boolean = false;

  private _asyncContinueActive: boolean = false;

  private _recursiveContinueCount: number = 0;

  private _profiler: any | null = null; // TODO: Profiler
}

export namespace Story {
  export interface EvaluateFunctionTextOutput {
    returned: any;
    output: string;
  }

  export interface ExternalFunctionDef {
    function: ExternalFunction;
  }

  export type VariableObserver = (variableName: string, newValue: any) => void;
  export type ExternalFunction = (...args: any) => any;
}
