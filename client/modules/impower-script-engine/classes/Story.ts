import { ErrorHandler } from "../types/ErrorHandler";
import { ErrorType } from "../types/ErrorType";
import { PushPopType } from "../types/PushPopType";
import { createValue } from "../utils/createValue";
import { Choice } from "./Choice";
import { ChoicePoint } from "./ChoicePoint";
import { Container, isContainer } from "./Container";
import { ControlCommand } from "./ControlCommand";
import { DebugMetadata } from "./DebugMetadata";
import { Divert } from "./Divert";
import { DivertTargetValue } from "./DivertTargetValue";
import { ImpowerList, KeyValuePair } from "./ImpowerList";
import {
  ImpowerListItem,
  ImpowerListItemFromSerializedKey,
} from "./ImpowerListItem";
import { ImpowerObject } from "./ImpowerObject";
import { IntValue } from "./IntValue";
import { JsonReader } from "./JsonReader";
import { JsonSerialisation } from "./JsonSerialisation";
import { JsonWriter } from "./JsonWriter";
import { ListDefinition } from "./ListDefinition";
import { ListDefinitionsOrigin } from "./ListDefinitionsOrigin";
import { ListValue } from "./ListValue";
import { NativeFunctionCall } from "./NativeFunctionCall";
import { NullException } from "./NullException";
import { Path } from "./Path";
import { Pointer } from "./Pointer";
import { PRNG } from "./PRNG";
import { Profiler } from "./Profiler";
import { SearchResult } from "./SearchResult";
import { Stopwatch } from "./StopWatch";
import { StoryException } from "./StoryException";
import { StoryState } from "./StoryState";
import { StringBuilder } from "./StringBuilder";
import { StringValue } from "./StringValue";
import { Tag } from "./Tag";
import { Value } from "./Value";
import { VariableAssignment } from "./VariableAssignment";
import { VariablePointerValue } from "./VariablePointerValue";
import { VariableReference } from "./VariableReference";
import { VariablesState } from "./VariablesState";
import { Void } from "./Void";

if (!Number.isInteger) {
  Number.isInteger = function isInteger(nVal: unknown): boolean {
    return (
      typeof nVal === "number" &&
      Number.isFinite(nVal) &&
      nVal > -9007199254740992 &&
      nVal < 9007199254740992 &&
      Math.floor(nVal) === nVal
    );
  };
}

export class Story extends ImpowerObject {
  public static inkVersionCurrent = 20;

  public inkVersionMinimumCompatible = 18;

  get currentChoices(): Choice[] {
    const choices: Choice[] = [];

    if (this._state === null) {
      throw new NullException("this._state");
    }
    this._state.currentChoices.forEach((c) => {
      if (!c.isInvisibleDefault) {
        c.index = choices.length;
        choices.push(c);
      }
    });

    return choices;
  }

  get currentText(): string {
    this.IfAsyncWeCant("call currentText since it's a work in progress");
    return this.state.currentText;
  }

  get currentTags(): string[] {
    this.IfAsyncWeCant("call currentTags since it's a work in progress");
    return this.state.currentTags;
  }

  get currentErrors(): string[] {
    return this.state.currentErrors;
  }

  get currentWarnings(): string[] {
    return this.state.currentWarnings;
  }

  get currentFlowName(): string {
    return this.state.currentFlowName;
  }

  get hasError(): boolean {
    return this.state.hasError;
  }

  get hasWarning(): boolean {
    return this.state.hasWarning;
  }

  get variablesState(): VariablesState {
    return this.state.variablesState;
  }

  get listDefinitions(): ListDefinitionsOrigin {
    return this._listDefinitions;
  }

  get state(): StoryState {
    return this._state;
  }

  public onError: ErrorHandler = null;

  public onDidContinue: () => void = null;

  public onMakeChoice: (arg1: Choice) => void = null;

  public onEvaluateFunction: (arg1: string, arg2: unknown[]) => void = null;

  public onCompleteEvaluateFunction: (
    arg1: string,
    arg2: unknown[],
    arg3: string,
    arg4: unknown
  ) => void = null;

  public onChoosePathString: (arg1: string, arg2: unknown[]) => void = null;

  // TODO: Implement Profiler
  public StartProfiling(): void {
    /* */
  }

  public EndProfiling(): void {
    /* */
  }

  constructor(contentContainer: Container, lists: ListDefinition[]);

  constructor(jsonString: string);

  constructor(json: Record<string, unknown>);

  constructor(...args) {
    super();

    // Discrimination between constructors
    let contentContainer: Container;
    let lists: ListDefinition[] = null;
    let json: Record<string, unknown> = null;

    if (isContainer(args[0])) {
      [contentContainer] = args;

      if (typeof args[1] !== "undefined") {
        lists = args[1] as ListDefinition[];
      }

      // ------ Story (Container contentContainer, List<Runtime.ListDefinition> lists = null)
      this._mainContentContainer = contentContainer;
      // ------
    } else if (typeof args[0] === "string") {
      const jsonString = args[0] as string;
      json = new JsonReader(jsonString).ToDictionary();
    } else {
      json = args[0] as Record<string, unknown>;
    }

    // ------ Story (Container contentContainer, List<Runtime.ListDefinition> lists = null)
    if (lists != null) this._listDefinitions = new ListDefinitionsOrigin(lists);

    this._externals = {};
    // ------

    // ------ Story(string jsonString) : this((Container)null)
    if (json !== null) {
      const rootObject: Record<string, unknown> = json;

      const versionObj = rootObject.inkVersion;
      if (versionObj == null)
        throw new Error(
          "ink version number not found. Are you sure it's a valid .ink.json file?"
        );

      const formatFromFile = Number(versionObj);
      if (formatFromFile > Story.inkVersionCurrent) {
        throw new Error(
          "Version of ink used to build story was newer than the current version of the engine"
        );
      } else if (formatFromFile < this.inkVersionMinimumCompatible) {
        throw new Error(
          "Version of ink used to build story is too old to be loaded by this version of the engine"
        );
      } else if (formatFromFile !== Story.inkVersionCurrent) {
        console.warn(
          "WARNING: Version of ink used to build story doesn't match current version of engine. Non-critical, but recommend synchronising."
        );
      }

      const rootToken = rootObject.root;
      if (rootToken == null)
        throw new Error(
          "Root node for ink not found. Are you sure it's a valid .ink.json file?"
        );

      const listDefsObj = rootObject.listDefs as Record<string, unknown>;
      if (listDefsObj) {
        this._listDefinitions =
          JsonSerialisation.JTokenToListDefinitions(listDefsObj);
      }

      const containerObj = JsonSerialisation.JTokenToRuntimeObject(rootToken);
      this._mainContentContainer = isContainer(containerObj)
        ? containerObj
        : null;

      this.ResetState();
    }
    // ------
  }

  // Merge together `public string ToJson()` and `void ToJson(SimpleJson.Writer writer)`.
  // Will only return a value if writer was not provided.
  public ToJson(writer?: JsonWriter): string {
    let shouldReturn = false;

    if (!writer) {
      shouldReturn = true;
      writer = new JsonWriter();
    }

    writer.WriteObjectStart();

    writer.WriteIntProperty("inkVersion", Story.inkVersionCurrent);

    writer.WriteProperty("root", (w) =>
      JsonSerialisation.WriteRuntimeContainer(w, this._mainContentContainer)
    );

    if (this._listDefinitions != null) {
      writer.WritePropertyStart("listDefs");
      writer.WriteObjectStart();

      this._listDefinitions.lists.forEach((def) => {
        writer.WritePropertyStart(def.name);
        writer.WriteObjectStart();

        Object.entries(def.items).forEach(([key, value]) => {
          const item = ImpowerListItemFromSerializedKey(key);
          const val = value;
          writer.WriteIntProperty(item.itemName, val);
        });

        writer.WriteObjectEnd();
        writer.WritePropertyEnd();
      });

      writer.WriteObjectEnd();
      writer.WritePropertyEnd();
    }

    writer.WriteObjectEnd();

    if (shouldReturn) {
      return writer.ToString();
    }
    return null;
  }

  public ResetState(): void {
    this.IfAsyncWeCant("ResetState");

    this._state = new StoryState(this);
    this._state.variablesState.ObserveVariableChange(
      this.VariableStateDidChangeEvent.bind(this)
    );

    this.ResetGlobals();
  }

  public ResetErrors(): void {
    if (this._state === null) {
      throw new NullException("this._state");
    }
    this._state.ResetErrors();
  }

  public ResetCallstack(): void {
    this.IfAsyncWeCant("ResetCallstack");
    if (this._state === null) {
      throw new NullException("this._state");
    }
    this._state.ForceEnd();
  }

  public ResetGlobals(): void {
    if (this._mainContentContainer.namedContent["global decl"]) {
      const originalPointer = this.state.currentPointer.copy();

      this.ChoosePath(new Path("global decl"), false);

      this.ContinueInternal();

      this.state.currentPointer = originalPointer;
    }

    this.state.variablesState.SnapshotDefaultGlobals();
  }

  public SwitchFlow(flowName: string): void {
    this.IfAsyncWeCant("switch flow");
    if (this._asyncSaving) {
      throw new Error(
        `Story is already in background saving mode, can't switch flow to ${flowName}`
      );
    }

    this.state.SwitchFlow_Internal(flowName);
  }

  public RemoveFlow(flowName: string): void {
    this.state.RemoveFlow_Internal(flowName);
  }

  public SwitchToDefaultFlow(): void {
    this.state.SwitchToDefaultFlow_Internal();
  }

  public Continue(): string {
    this.ContinueAsync(0);
    return this.currentText;
  }

  get canContinue(): boolean {
    return this.state.canContinue;
  }

  get asyncContinueComplete(): boolean {
    return !this._asyncContinueActive;
  }

  public ContinueAsync(millisecsLimitAsync: number): void {
    if (!this._hasValidatedExternals) {
      this.ValidateExternalBindings();
    }

    this.ContinueInternal(millisecsLimitAsync);
  }

  public ContinueInternal(millisecsLimitAsync = 0): void {
    if (this._profiler) {
      this._profiler.PreContinue();
    }

    const isAsyncTimeLimited = millisecsLimitAsync > 0;
    this._recursiveContinueCount += 1;

    if (!this._asyncContinueActive) {
      this._asyncContinueActive = isAsyncTimeLimited;

      if (!this.canContinue) {
        throw new Error(
          "Can't continue - should check canContinue before calling Continue"
        );
      }

      this._state.didSafeExit = false;
      this._state.ResetOutput();

      if (this._recursiveContinueCount === 1) {
        this._state.variablesState.batchObservingVariableChanges = true;
      }
    }

    const durationStopwatch = new Stopwatch();
    durationStopwatch.Start();

    let outputStreamEndsInNewline = false;
    this._sawLookaheadUnsafeFunctionAfterNewline = false;
    do {
      try {
        outputStreamEndsInNewline = this.ContinueSingleStep();
      } catch (e) {
        if (!(e instanceof StoryException)) {
          throw e;
        }

        this.AddError(e.message, undefined, e.useEndLineNumber);
        break;
      }

      if (outputStreamEndsInNewline) {
        break;
      }

      if (
        this._asyncContinueActive &&
        durationStopwatch.ElapsedMilliseconds > millisecsLimitAsync
      ) {
        break;
      }
    } while (this.canContinue);

    durationStopwatch.Stop();

    if (outputStreamEndsInNewline || !this.canContinue) {
      if (this._stateSnapshotAtLastNewline !== null) {
        this.RestoreStateSnapshot();
      }

      if (!this.canContinue) {
        if (this.state.callStack.canPopThread)
          this.AddError(
            "Thread available to pop, threads should always be flat by the end of evaluation?"
          );

        if (
          this.state.generatedChoices.length === 0 &&
          !this.state.didSafeExit &&
          this._temporaryEvaluationContainer == null
        ) {
          if (this.state.callStack.CanPop("Tunnel"))
            this.AddError(
              "unexpectedly reached end of content. Do you need a '->->' to return from a tunnel?"
            );
          else if (this.state.callStack.CanPop("Function"))
            this.AddError(
              "unexpectedly reached end of content. Do you need a '~ return'?"
            );
          else if (!this.state.callStack.canPop)
            this.AddError(
              "ran out of content. Do you need a '-> DONE' or '-> END'?"
            );
          else
            this.AddError(
              "unexpectedly reached end of content for unknown reason. Please debug compiler!"
            );
        }
      }

      this.state.didSafeExit = false;
      this._sawLookaheadUnsafeFunctionAfterNewline = false;

      if (this._recursiveContinueCount === 1) {
        this._state.variablesState.batchObservingVariableChanges = false;
      }

      this._asyncContinueActive = false;
      if (this.onDidContinue) {
        this.onDidContinue();
      }
    }

    this._recursiveContinueCount -= 1;

    if (this._profiler) {
      this._profiler.PostContinue();
    }

    // In the following code, we're masking a lot of non-null assertion,
    // because testing for against `hasError` or `hasWarning` makes sure
    // the arrays are present and contain at least one element.
    if (this.state.hasError || this.state.hasWarning) {
      if (this.onError !== null) {
        if (this.state.hasError && this.state.currentErrors) {
          this.state.currentErrors.forEach((err) => {
            this.onError(err, ErrorType.Error);
          });
        }
        if (this.state.hasWarning && this.state.currentWarnings) {
          this.state.currentWarnings.forEach((err) => {
            this.onError(err, ErrorType.Warning);
          });
        }
        this.ResetErrors();
      } else {
        const sb = new StringBuilder();
        sb.Append("Impower had ");
        if (this.state.hasError) {
          sb.Append(`${this.state.currentErrors?.length}`);
          sb.Append(
            this.state.currentErrors?.length === 1 ? " error" : "errors"
          );
          if (this.state.hasWarning) sb.Append(" and ");
        }
        if (this.state.hasWarning) {
          sb.Append(`${this.state.currentWarnings?.length}`);
          sb.Append(
            this.state.currentWarnings?.length === 1 ? " warning" : "warnings"
          );
          if (this.state.hasWarning) sb.Append(" and ");
        }
        sb.Append(
          ". It is strongly suggested that you assign an error handler to story.onError. The first issue was: "
        );
        sb.Append(
          this.state.hasError
            ? this.state.currentErrors?.[0]
            : this.state.currentWarnings?.[0]
        );

        throw new StoryException(sb.toString());
      }
    }
  }

  public ContinueSingleStep(): boolean {
    if (this._profiler) {
      this._profiler.PreStep();
    }

    this.Step();

    if (this._profiler) {
      this._profiler.PostStep();
    }

    if (!this.canContinue && !this.state.callStack.elementIsEvaluateFromGame) {
      this.TryFollowDefaultInvisibleChoice();
    }

    if (this._profiler) {
      this._profiler.PreSnapshot();
    }

    if (!this.state.inStringEvaluation) {
      if (this._stateSnapshotAtLastNewline !== null) {
        if (this._stateSnapshotAtLastNewline.currentTags === null) {
          throw new NullException("this._stateAtLastNewline.currentTags");
        }
        if (this.state.currentTags === null) {
          throw new NullException("this.state.currentTags");
        }

        const change = this.CalculateNewlineOutputStateChange(
          this._stateSnapshotAtLastNewline.currentText,
          this.state.currentText,
          this._stateSnapshotAtLastNewline.currentTags.length,
          this.state.currentTags.length
        );

        if (
          change === "ExtendedBeyondNewline" ||
          this._sawLookaheadUnsafeFunctionAfterNewline
        ) {
          this.RestoreStateSnapshot();

          return true;
        }
        if (change === "NewlineRemoved") {
          this.DiscardSnapshot();
        }
      }

      if (this.state.outputStreamEndsInNewline) {
        if (this.canContinue) {
          if (this._stateSnapshotAtLastNewline == null) this.StateSnapshot();
        } else {
          this.DiscardSnapshot();
        }
      }
    }

    if (this._profiler) {
      this._profiler.PostSnapshot();
    }

    return false;
  }

  public CalculateNewlineOutputStateChange(
    prevText: string,
    currText: string,
    prevTagCount: number,
    currTagCount: number
  ): OutputStateChange {
    if (prevText === null) {
      throw new NullException("prevText");
    }
    if (currText === null) {
      throw new NullException("currText");
    }

    const newlineStillExists =
      currText.length >= prevText.length &&
      currText.charAt(prevText.length - 1) === "\n";
    if (
      prevTagCount === currTagCount &&
      prevText.length === currText.length &&
      newlineStillExists
    )
      return "NoChange";

    if (!newlineStillExists) {
      return "NewlineRemoved";
    }

    if (currTagCount > prevTagCount) return "ExtendedBeyondNewline";

    for (let i = prevText.length; i < currText.length; i += 1) {
      const c = currText.charAt(i);
      if (c !== " " && c !== "\t") {
        return "ExtendedBeyondNewline";
      }
    }

    return "NoChange";
  }

  public ContinueMaximally(): string {
    this.IfAsyncWeCant("ContinueMaximally");

    const sb = new StringBuilder();

    while (this.canContinue) {
      sb.Append(this.Continue());
    }

    return sb.toString();
  }

  public ContentAtPath(path: Path): SearchResult {
    return this.mainContentContainer.ContentAtPath(path);
  }

  public KnotContainerWithName(name: string): Container {
    const namedContainer = this.mainContentContainer.namedContent[name];
    if (namedContainer instanceof Container) return namedContainer;
    return null;
  }

  public PointerAtPath(path: Path): Pointer {
    if (path.length === 0) return Pointer.Null;

    const p = new Pointer();

    let pathLengthToUse = path.length;

    let result = null;
    if (path.lastComponent === null) {
      throw new NullException("path.lastComponent");
    }

    if (path.lastComponent.isIndex) {
      pathLengthToUse = path.length - 1;
      result = this.mainContentContainer.ContentAtPath(
        path,
        undefined,
        pathLengthToUse
      );
      p.container = result.container;
      p.index = path.lastComponent.index;
    } else {
      result = this.mainContentContainer.ContentAtPath(path);
      p.container = result.container;
      p.index = -1;
    }

    if (
      result.obj == null ||
      (result.obj === this.mainContentContainer && pathLengthToUse > 0)
    ) {
      this.Error(
        `Failed to find content at path '${path}', and no approximation of it was possible.`
      );
    } else if (result.approximate)
      this.Warning(
        `Failed to find content at path '${path}', so it was approximated to: '${result.obj.path}'.`
      );

    return p;
  }

  public StateSnapshot(): void {
    this._stateSnapshotAtLastNewline = this._state;
    this._state = this._state.CopyAndStartPatching();
  }

  public RestoreStateSnapshot(): void {
    if (this._stateSnapshotAtLastNewline === null) {
      throw new NullException("_stateSnapshotAtLastNewline");
    }
    this._stateSnapshotAtLastNewline.RestoreAfterPatch();

    this._state = this._stateSnapshotAtLastNewline;
    this._stateSnapshotAtLastNewline = null;

    if (!this._asyncSaving) {
      this._state.ApplyAnyPatch();
    }
  }

  public DiscardSnapshot(): void {
    if (!this._asyncSaving) {
      this._state.ApplyAnyPatch();
    }

    this._stateSnapshotAtLastNewline = null;
  }

  public CopyStateForBackgroundThreadSave(): StoryState {
    this.IfAsyncWeCant("start saving on a background thread");

    if (this._asyncSaving)
      throw new Error(
        "Story is already in background saving mode, can't call CopyStateForBackgroundThreadSave again!"
      );

    const stateToSave = this._state;
    this._state = this._state.CopyAndStartPatching();
    this._asyncSaving = true;
    return stateToSave;
  }

  public BackgroundSaveComplete(): void {
    if (this._stateSnapshotAtLastNewline === null) {
      this._state.ApplyAnyPatch();
    }

    this._asyncSaving = false;
  }

  public Step(): void {
    let shouldAddToStream = true;

    let pointer = this.state.currentPointer.copy();
    if (pointer.isNull) {
      return;
    }

    const containerObj = pointer.Resolve();
    let containerToEnter = isContainer(containerObj) ? containerObj : null;

    while (containerToEnter) {
      this.VisitContainer(containerToEnter, true);

      // No content? the most we can do is step past it
      if (containerToEnter.content.length === 0) {
        break;
      }

      pointer = Pointer.StartOf(containerToEnter);
      const newContainerObj = pointer.Resolve();
      containerToEnter = isContainer(newContainerObj) ? newContainerObj : null;
    }

    this.state.currentPointer = pointer.copy();

    if (this._profiler) {
      this._profiler.Step(this.state.callStack);
    }

    // Is the current content object:
    //  - Normal content
    //  - Or a logic/flow statement - if so, do it
    // Stop flow if we hit a stack pop when we're unable to pop (e.g. return/done statement in knot
    // that was diverted to rather than called as a function)
    let currentContentObj = pointer.Resolve();
    const isLogicOrFlowControl =
      this.PerformLogicAndFlowControl(currentContentObj);

    // Has flow been forced to end by flow control above?
    if (this.state.currentPointer.isNull) {
      return;
    }

    if (isLogicOrFlowControl) {
      shouldAddToStream = false;
    }

    // Choice with condition?
    const choicePoint = currentContentObj as ChoicePoint;
    if (choicePoint) {
      const choice = this.ProcessChoice(choicePoint);
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
      const varPointer = currentContentObj as VariablePointerValue;
      if (varPointer && varPointer.contextIndex === -1) {
        // Create new object so we're not overwriting the story's own data
        const contextIdx = this.state.callStack.ContextForVariableNamed(
          varPointer.variableName
        );
        currentContentObj = new VariablePointerValue(
          varPointer.variableName,
          contextIdx
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
    const controlCmd = currentContentObj as ControlCommand;
    if (controlCmd && controlCmd.commandType === "StartThread") {
      this.state.callStack.PushThread();
    }
  }

  public VisitContainer(container: Container, atStart: boolean): void {
    if (!container.countingAtStartOnly || atStart) {
      if (container.visitsShouldBeCounted)
        this.state.IncrementVisitCountForContainer(container);

      if (container.turnIndexShouldBeCounted)
        this.state.RecordTurnIndexVisitToContainer(container);
    }
  }

  private _prevContainers: Container[] = [];

  public VisitChangedContainersDueToDivert(): void {
    const previousPointer = this.state.previousPointer.copy();
    const pointer = this.state.currentPointer.copy();

    if (pointer.isNull || pointer.index === -1) return;

    this._prevContainers.length = 0;
    if (!previousPointer.isNull) {
      const resolvedPreviousAncestor = previousPointer.Resolve();
      let prevAncestor =
        (isContainer(resolvedPreviousAncestor)
          ? resolvedPreviousAncestor
          : null) ||
        (isContainer(previousPointer.container)
          ? previousPointer.container
          : null);
      while (prevAncestor) {
        this._prevContainers.push(prevAncestor);
        prevAncestor = isContainer(prevAncestor.parent)
          ? prevAncestor.parent
          : null;
      }
    }

    let currentChildOfContainer = pointer.Resolve();

    if (currentChildOfContainer == null) {
      return;
    }

    let currentContainerAncestor = isContainer(currentChildOfContainer.parent)
      ? currentChildOfContainer.parent
      : null;
    let allChildrenEnteredAtStart = true;
    while (
      currentContainerAncestor &&
      (this._prevContainers.indexOf(currentContainerAncestor) < 0 ||
        currentContainerAncestor.countingAtStartOnly)
    ) {
      // Check whether this ancestor container is being entered at the start,
      // by checking whether the child object is the first.
      const enteringAtStart =
        currentContainerAncestor.content.length > 0 &&
        currentChildOfContainer === currentContainerAncestor.content[0] &&
        allChildrenEnteredAtStart;

      if (!enteringAtStart) allChildrenEnteredAtStart = false;

      // Mark a visit to this container
      this.VisitContainer(currentContainerAncestor, enteringAtStart);

      currentChildOfContainer = currentContainerAncestor;
      currentContainerAncestor = isContainer(currentContainerAncestor.parent)
        ? currentContainerAncestor.parent
        : null;
    }
  }

  public ProcessChoice(choicePoint: ChoicePoint): Choice {
    let showChoice = true;

    // Don't create choice if choice point doesn't pass conditional
    if (choicePoint.hasCondition) {
      const conditionValue = this.state.PopEvaluationStack();
      if (!this.IsTruthy(conditionValue)) {
        showChoice = false;
      }
    }

    let startText = "";
    let choiceOnlyText = "";

    if (choicePoint.hasChoiceOnlyContent) {
      const choiceOnlyStrVal = this.state.PopEvaluationStack() as StringValue;
      choiceOnlyText = choiceOnlyStrVal.value || "";
    }

    if (choicePoint.hasStartContent) {
      const startStrVal = this.state.PopEvaluationStack() as StringValue;
      startText = startStrVal.value || "";
    }

    // Don't create choice if player has already read this content
    if (choicePoint.onceOnly) {
      const visitCount = this.state.VisitCountForContainer(
        choicePoint.choiceTarget
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

    const choice = new Choice();
    choice.targetPath = choicePoint.pathOnChoice;
    choice.sourcePath = choicePoint.path.toString();
    choice.isInvisibleDefault = choicePoint.isInvisibleDefault;
    choice.threadAtGeneration = this.state.callStack.ForkThread();

    choice.text = (startText + choiceOnlyText).replace(/^[ \t]+|[ \t]+$/g, "");

    return choice;
  }

  public IsTruthy(obj: ImpowerObject): boolean {
    const truthy = false;
    if (obj instanceof Value) {
      const val = obj;

      if (val instanceof DivertTargetValue) {
        this.Error(
          `Shouldn't use a divert target (to ${val.targetPath}) as a conditional value. Did you intend a function call 'likeThis()' or a read count check 'likeThis'? (no arrows)`
        );
        return false;
      }

      return val.isTruthy;
    }
    return truthy;
  }

  public PerformLogicAndFlowControl(contentObj: ImpowerObject): boolean {
    if (contentObj == null) {
      return false;
    }

    // Divert
    if (contentObj instanceof Divert) {
      const currentDivert = contentObj;

      if (currentDivert.isConditional) {
        const conditionValue = this.state.PopEvaluationStack();

        // False conditional? Cancel divert
        if (!this.IsTruthy(conditionValue)) return true;
      }

      if (currentDivert.hasVariableTarget) {
        const varName = currentDivert.variableDivertName;

        const varContents =
          this.state.variablesState.GetVariableWithName(varName);

        if (varContents == null) {
          this.Error(
            `Tried to divert using a target from a variable that could not be found (${varName})`
          );
        } else if (!(varContents instanceof DivertTargetValue)) {
          const intContent = varContents as IntValue;

          let errorMessage = `Tried to divert to a target from a variable, but the variable (${varName}) didn't contain a divert target, it `;
          if (intContent instanceof IntValue && intContent.value === 0) {
            errorMessage += "was empty/null (the value 0).";
          } else {
            errorMessage += `contained '${varContents}'.`;
          }

          this.Error(errorMessage);
        }

        const target = varContents as DivertTargetValue;
        this.state.divertedPointer = this.PointerAtPath(target.targetPath);
      } else if (currentDivert.isExternal) {
        this.CallExternalFunction(
          currentDivert.targetPathString,
          currentDivert.externalArgs
        );
        return true;
      } else {
        this.state.divertedPointer = currentDivert.targetPointer.copy();
      }

      if (currentDivert.pushesToStack) {
        this.state.callStack.Push(
          currentDivert.stackPushType,
          undefined,
          this.state.outputStream.length
        );
      }

      if (this.state.divertedPointer.isNull && !currentDivert.isExternal) {
        if (
          currentDivert &&
          currentDivert.debugMetadata &&
          currentDivert.debugMetadata.sourceName != null
        ) {
          this.Error(
            `Divert target doesn't exist: ${currentDivert.debugMetadata.sourceName}`
          );
        } else {
          this.Error(`Divert resolution failed: ${currentDivert}`);
        }
      }

      return true;
    }

    // Start/end an expression evaluation? Or print out the result?
    if (contentObj instanceof ControlCommand) {
      const evalCommand = contentObj;

      switch (evalCommand.commandType) {
        case "EvalStart": {
          this.Assert(
            this.state.inExpressionEvaluation === false,
            "Already in expression evaluation?"
          );
          this.state.inExpressionEvaluation = true;
          break;
        }

        case "EvalEnd": {
          this.Assert(
            this.state.inExpressionEvaluation === true,
            "Not in expression evaluation mode"
          );
          this.state.inExpressionEvaluation = false;
          break;
        }

        case "EvalOutput": {
          // If the expression turned out to be empty, there may not be anything on the stack
          if (this.state.evaluationStack.length > 0) {
            const output = this.state.PopEvaluationStack();

            // Functions may evaluate to Void, in which case we skip output
            if (!(output instanceof Void)) {
              // TODO: Should we really always blanket convert to string?
              // It would be okay to have numbers in the output stream the
              // only problem is when exporting text for viewing, it skips over numbers etc.
              const text = new StringValue(output.toString());

              this.state.PushToOutputStream(text);
            }
          }
          break;
        }

        case "NoOp": {
          break;
        }

        case "Duplicate": {
          this.state.PushEvaluationStack(this.state.PeekEvaluationStack());
          break;
        }

        case "PopEvaluatedValue": {
          this.state.PopEvaluationStack();
          break;
        }

        case "PopFunction":
        case "PopTunnel": {
          const popType =
            evalCommand.commandType === "PopFunction" ? "Function" : "Tunnel";

          let overrideTunnelReturnTarget: DivertTargetValue = null;
          if (popType === "Tunnel") {
            const popped = this.state.PopEvaluationStack();
            overrideTunnelReturnTarget = popped as DivertTargetValue;
            if (overrideTunnelReturnTarget === null) {
              this.Assert(
                popped instanceof Void,
                "Expected void if ->-> doesn't override target"
              );
            }
          }

          if (this.state.TryExitFunctionEvaluationFromGame()) {
            break;
          } else if (
            this.state.callStack.currentElement.type !== popType ||
            !this.state.callStack.canPop
          ) {
            const names: Record<PushPopType, string> = {
              Function: "function return statement (~ return)",
              Tunnel: "tunnel onwards statement (->->)",
              FunctionEvaluationFromGame:
                "function return statement (~ return)",
            };

            let expected = names[this.state.callStack.currentElement.type];
            if (!this.state.callStack.canPop) {
              expected = "end of flow (-> END or choice)";
            }

            const errorMsg = `Found ${names[popType]}, when expected ${expected}`;

            this.Error(errorMsg);
          } else {
            this.state.PopCallStack();

            if (overrideTunnelReturnTarget)
              this.state.divertedPointer = this.PointerAtPath(
                overrideTunnelReturnTarget.targetPath
              );
          }
          break;
        }

        case "BeginString": {
          this.state.PushToOutputStream(evalCommand);

          this.Assert(
            this.state.inExpressionEvaluation === true,
            "Expected to be in an expression when evaluating a string"
          );
          this.state.inExpressionEvaluation = false;
          break;
        }

        case "EndString": {
          let contentStackForString: ImpowerObject[] = [];

          let outputCountConsumed = 0;
          for (let i = this.state.outputStream.length - 1; i >= 0; i -= 1) {
            const obj = this.state.outputStream[i];

            outputCountConsumed += 1;

            const command = obj as ControlCommand;
            if (command && command.commandType === "BeginString") {
              break;
            }

            if (obj instanceof StringValue) {
              contentStackForString.push(obj);
            }
          }

          // Consume the content that was produced for this string
          this.state.PopFromOutputStream(outputCountConsumed);

          // The C# version uses a Stack for contentStackForString, but we're
          // using a simple array, so we need to reverse it before using it
          contentStackForString = contentStackForString.reverse();

          // Build string out of the content we collected
          const sb = new StringBuilder();
          contentStackForString.forEach((c) => {
            sb.Append(c.toString());
          });

          // Return to expression evaluation (from content mode)
          this.state.inExpressionEvaluation = true;
          this.state.PushEvaluationStack(new StringValue(sb.toString()));
          break;
        }

        case "ChoiceCount": {
          const choiceCount = this.state.generatedChoices.length;
          this.state.PushEvaluationStack(new IntValue(choiceCount));
          break;
        }

        case "Turns": {
          this.state.PushEvaluationStack(
            new IntValue(this.state.currentTurnIndex + 1)
          );
          break;
        }

        case "TurnsSince":
        case "ReadCount": {
          const target = this.state.PopEvaluationStack();
          if (!(target instanceof DivertTargetValue)) {
            let extraNote = "";
            if (target instanceof IntValue)
              extraNote =
                ". Did you accidentally pass a read count ('knot_name') instead of a target ('-> knot_name')?";
            this.Error(
              `TURNS_SINCE / READ_COUNT expected a divert target (knot, stitch, label name), but saw ${target}${extraNote}`
            );
            break;
          }

          const divertTarget = target as DivertTargetValue;
          const correctContainer = this.ContentAtPath(
            divertTarget.targetPath
          ).correctObj;
          const container = isContainer(correctContainer)
            ? correctContainer
            : null;

          let eitherCount;
          if (container != null) {
            if (evalCommand.commandType === "TurnsSince") {
              eitherCount = this.state.TurnsSinceForContainer(container);
            } else {
              eitherCount = this.state.VisitCountForContainer(container);
            }
          } else {
            if (evalCommand.commandType === "TurnsSince") {
              eitherCount = -1;
            } else {
              eitherCount = 0;
            }

            this.Warning(
              `Failed to find container for ${evalCommand.toString()} lookup at ${divertTarget.targetPath.toString()}`
            );
          }

          this.state.PushEvaluationStack(new IntValue(eitherCount));
          break;
        }

        case "Random": {
          const maxInt = this.state.PopEvaluationStack() as IntValue;
          const minInt = this.state.PopEvaluationStack() as IntValue;

          if (minInt == null || minInt instanceof IntValue === false)
            return this.Error(
              "Invalid value for minimum parameter of RANDOM(min, max)"
            );

          if (maxInt == null || minInt instanceof IntValue === false)
            return this.Error(
              "Invalid value for maximum parameter of RANDOM(min, max)"
            );

          // Originally a primitive type, but here, can be null.
          // TODO: Replace by default value?
          if (maxInt.value === null) {
            throw new NullException("maxInt.value");
          }
          if (minInt.value === null) {
            throw new NullException("minInt.value");
          }

          // This code is differs a bit from the reference implementation, since
          // JavaScript has no true integers. Hence integer arithmetics and
          // interger overflows don't apply here. A loss of precision can
          // happen with big numbers however.
          //
          // The case where 'randomRange' is lower than zero is handled below,
          // so there's no need to test against Number.MIN_SAFE_INTEGER.
          let randomRange = maxInt.value - minInt.value + 1;
          if (
            !Number.isFinite(randomRange) ||
            randomRange > Number.MAX_SAFE_INTEGER
          ) {
            randomRange = Number.MAX_SAFE_INTEGER;
            this.Error(
              "RANDOM was called with a range that exceeds the size that ink numbers can use."
            );
          }
          if (randomRange <= 0)
            this.Error(
              `RANDOM was called with minimum as ${minInt.value} and maximum as ${maxInt.value}. The maximum must be larger`
            );

          const resultSeed = this.state.storySeed + this.state.previousRandom;
          const random = new PRNG(resultSeed);

          const nextRandom = random.next();
          const chosenValue = (nextRandom % randomRange) + minInt.value;
          this.state.PushEvaluationStack(new IntValue(chosenValue));

          // Next random number (rather than keeping the Random object around)
          this.state.previousRandom = nextRandom;
          break;
        }

        case "SeedRandom": {
          const seed = this.state.PopEvaluationStack() as IntValue;
          if (seed == null || seed instanceof IntValue === false)
            return this.Error("Invalid value passed to SEED_RANDOM");

          // Originally a primitive type, but here, can be null.
          // TODO: Replace by default value?
          if (seed.value === null) {
            throw new NullException("minInt.value");
          }

          this.state.storySeed = seed.value;
          this.state.previousRandom = 0;

          this.state.PushEvaluationStack(new Void());
          break;
        }

        case "VisitIndex": {
          const count =
            this.state.VisitCountForContainer(
              this.state.currentPointer.container
            ) - 1; // index not count
          this.state.PushEvaluationStack(new IntValue(count));
          break;
        }

        case "SequenceShuffleIndex": {
          const shuffleIndex = this.NextSequenceShuffleIndex();
          this.state.PushEvaluationStack(new IntValue(shuffleIndex));
          break;
        }

        case "StartThread": {
          // Handled in main step function
          break;
        }

        case "Done": {
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

          break;
        }

        // Force flow to end completely
        case "End": {
          this.state.ForceEnd();
          break;
        }

        case "ListFromInt": {
          const intVal = this.state.PopEvaluationStack() as IntValue;
          const listNameVal = this.state.PopEvaluationStack() as StringValue;

          if (intVal === null) {
            throw new StoryException(
              "Passed non-integer when creating a list element from a numerical value."
            );
          }

          let generatedListValue = null;

          if (this.listDefinitions === null) {
            throw new NullException("this.listDefinitions");
          }
          const foundListDef = this.listDefinitions.TryListGetDefinition(
            listNameVal.value,
            null
          );
          if (foundListDef.exists) {
            // Originally a primitive type, but here, can be null.
            // TODO: Replace by default value?
            if (intVal.value === null) {
              throw new NullException("minInt.value");
            }

            const foundItem = foundListDef.result?.TryGetItemWithValue(
              intVal.value,
              ImpowerListItem.Null
            );
            if (foundItem.exists) {
              generatedListValue = new ListValue(
                foundItem.result,
                intVal.value
              );
            }
          } else {
            throw new StoryException(
              `Failed to find LIST called ${listNameVal.value}`
            );
          }

          if (generatedListValue == null) generatedListValue = new ListValue();

          this.state.PushEvaluationStack(generatedListValue);
          break;
        }

        case "ListRange": {
          const max = this.state.PopEvaluationStack() as Value;
          const min = this.state.PopEvaluationStack() as Value;

          const targetList = this.state.PopEvaluationStack() as ListValue;

          if (targetList === null || min === null || max === null)
            throw new StoryException(
              "Expected list, minimum and maximum for LIST_RANGE"
            );

          if (targetList.value === null) {
            throw new NullException("targetList.value");
          }
          const result = targetList.value.ListWithSubRange(
            min.valueObject,
            max.valueObject
          );

          this.state.PushEvaluationStack(new ListValue(result));
          break;
        }

        case "ListRandom": {
          const listVal = this.state.PopEvaluationStack() as ListValue;
          if (listVal === null)
            throw new StoryException("Expected list for LIST_RANDOM");

          const list = listVal.value;

          let newList: ImpowerList = null;

          if (list === null) {
            throw new NullException("list");
          }
          if (list.Count === 0) {
            newList = new ImpowerList();
          } else {
            // Generate a random index for the element to take
            const resultSeed = this.state.storySeed + this.state.previousRandom;
            const random = new PRNG(resultSeed);

            const nextRandom = random.next();
            const listItemIndex = nextRandom % list.Count;

            // This bit is a little different from the original
            // C# code, since iterators do not work in the same way.
            // First, we iterate listItemIndex - 1 times, calling next().
            // The listItemIndex-th time is made outside of the loop,
            // in order to retrieve the value.
            const listEnumerator = list.entries();
            for (let i = 0; i <= listItemIndex - 1; i += 1) {
              listEnumerator.next();
            }
            const { value } = listEnumerator.next();
            const randomItem: KeyValuePair<ImpowerListItem, number> = {
              Key: ImpowerListItemFromSerializedKey(value[0]),
              Value: value[1],
            };

            // Origin list is simply the origin of the one element
            if (randomItem.Key.originName === null) {
              throw new NullException("randomItem.Key.originName");
            }
            newList = new ImpowerList(randomItem.Key.originName, this);
            newList.Add(randomItem.Key, randomItem.Value);

            this.state.previousRandom = nextRandom;
          }

          this.state.PushEvaluationStack(new ListValue(newList));
          break;
        }

        default:
          this.Error(`unhandled ControlCommand: ${evalCommand}`);
          break;
      }

      return true;
    }

    // Variable assignment
    if (contentObj instanceof VariableAssignment) {
      const varAss = contentObj;
      const assignedVal = this.state.PopEvaluationStack();

      this.state.variablesState.Assign(varAss, assignedVal);

      return true;
    }

    // Variable reference
    if (contentObj instanceof VariableReference) {
      const varRef = contentObj;
      let foundValue = null;

      // Explicit read count value
      if (varRef.pathForCount != null) {
        const container = varRef.containerForCount;
        const count = this.state.VisitCountForContainer(container);
        foundValue = new IntValue(count);
      }

      // Normal variable reference
      else {
        foundValue = this.state.variablesState.GetVariableWithName(varRef.name);

        if (foundValue == null) {
          this.Warning(
            `Variable not found: '${varRef.name}'. Using default value of 0 (false). This can happen with temporary variables if the declaration hasn't yet been hit. Globals are always given a default value on load if a value doesn't exist in the save state.`
          );
          foundValue = new IntValue(0);
        }
      }

      this.state.PushEvaluationStack(foundValue);

      return true;
    }

    // Native function call
    if (contentObj instanceof NativeFunctionCall) {
      const func = contentObj;
      const funcParams = this.state.PopEvaluationStackRange(
        func.numberOfParameters
      );
      const result = func.Call(funcParams);
      this.state.PushEvaluationStack(result);
      return true;
    }

    // No control content, must be ordinary content
    return false;
  }

  public ChoosePathString(
    path: string,
    resetCallstack = true,
    args: unknown[] = []
  ): void {
    this.IfAsyncWeCant("call ChoosePathString right now");
    if (this.onChoosePathString !== null) {
      this.onChoosePathString(path, args);
    }

    if (resetCallstack) {
      this.ResetCallstack();
    } else if (this.state.callStack.currentElement.type === "Function") {
      let funcDetail = "";
      const { container } = this.state.callStack.currentElement.currentPointer;
      if (container != null) {
        funcDetail = `(${container.path.toString()}) `;
      }
      throw new Error(
        `Story was running a function ${funcDetail}when you called ChoosePathString(${path}) - this is almost certainly not not what you want! Full stack trace: \n${this.state.callStack.callStackTrace}`
      );
    }

    this.state.PassArgumentsToEvaluationStack(args);
    this.ChoosePath(new Path(path));
  }

  public IfAsyncWeCant(activityStr: string): void {
    if (this._asyncContinueActive)
      throw new Error(
        `Can't ${activityStr}. Story is in the middle of a ContinueAsync(). Make more ContinueAsync() calls or a single Continue() call beforehand.`
      );
  }

  public ChoosePath(p: Path, incrementingTurnIndex = true): void {
    this.state.SetChosenPath(p, incrementingTurnIndex);

    // Take a note of newly visited containers for read counts etc
    this.VisitChangedContainersDueToDivert();
  }

  public ChooseChoiceIndex(choiceIdx: number): void {
    const choices = this.currentChoices;
    this.Assert(
      choiceIdx >= 0 && choiceIdx < choices.length,
      "choice out of range"
    );

    const choiceToChoose = choices[choiceIdx];
    if (this.onMakeChoice !== null) {
      this.onMakeChoice(choiceToChoose);
    }

    if (choiceToChoose.threadAtGeneration === null) {
      throw new NullException("choiceToChoose.threadAtGeneration");
    }
    if (choiceToChoose.targetPath === null) {
      throw new NullException("choiceToChoose.targetPath");
    }

    this.state.callStack.currentThread = choiceToChoose.threadAtGeneration;

    this.ChoosePath(choiceToChoose.targetPath);
  }

  public HasFunction(functionName: string): boolean {
    try {
      return this.KnotContainerWithName(functionName) != null;
    } catch (e) {
      return false;
    }
  }

  public EvaluateFunction(
    functionName: string,
    args: unknown[] = [],
    returnTextOutput = false
  ): EvaluateFunctionTextOutput | unknown {
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
    } else if (functionName === "" || functionName.trim() === "") {
      throw new Error("Function is empty or white space.");
    }

    const funcContainer = this.KnotContainerWithName(functionName);
    if (funcContainer == null) {
      throw new Error(`Function doesn't exist: '${functionName}'`);
    }

    const outputStreamBefore: ImpowerObject[] = [];
    outputStreamBefore.push(...this.state.outputStream);
    this._state.ResetOutput();

    this.state.StartFunctionEvaluationFromGame(funcContainer, args);

    // Evaluate the function, and collect the string output
    const stringOutput = new StringBuilder();
    while (this.canContinue) {
      stringOutput.Append(this.Continue());
    }
    const textOutput = stringOutput.toString();

    this._state.ResetOutput(outputStreamBefore);

    const result = this.state.CompleteFunctionEvaluationFromGame();
    if (this.onCompleteEvaluateFunction != null)
      this.onCompleteEvaluateFunction(functionName, args, textOutput, result);

    return returnTextOutput ? { returned: result, output: textOutput } : result;
  }

  public EvaluateExpression(exprContainer: Container): ImpowerObject {
    const startCallStackHeight = this.state.callStack.elements.length;

    this.state.callStack.Push("Tunnel");

    this._temporaryEvaluationContainer = exprContainer;

    this.state.GoToStart();

    const evalStackHeight = this.state.evaluationStack.length;

    this.Continue();

    this._temporaryEvaluationContainer = null;

    // Should have fallen off the end of the Container, which should
    // have auto-popped, but just in case we didn't for some reason,
    // manually pop to restore the state (including currentPath).
    if (this.state.callStack.elements.length > startCallStackHeight) {
      this.state.PopCallStack();
    }

    const endStackHeight = this.state.evaluationStack.length;
    if (endStackHeight > evalStackHeight) {
      return this.state.PopEvaluationStack();
    }
    return null;
  }

  public allowExternalFunctionFallbacks = false;

  public CallExternalFunction(
    funcName: string,
    numberOfArguments: number
  ): void {
    if (funcName === null) {
      throw new NullException("funcName");
    }
    const funcDef = this._externals[funcName];
    let fallbackFunctionContainer = null;

    const foundExternal = typeof funcDef !== "undefined";

    if (
      foundExternal &&
      !funcDef?.lookAheadSafe &&
      this._stateSnapshotAtLastNewline !== null
    ) {
      this._sawLookaheadUnsafeFunctionAfterNewline = true;
      return;
    }

    if (!foundExternal) {
      if (this.allowExternalFunctionFallbacks) {
        fallbackFunctionContainer = this.KnotContainerWithName(funcName);
        this.Assert(
          fallbackFunctionContainer !== null,
          `Trying to call EXTERNAL function '${funcName}' which has not been bound, and fallback ink function could not be found.`
        );

        // Divert direct into fallback function and we're done
        this.state.callStack.Push(
          "Function",
          undefined,
          this.state.outputStream.length
        );
        this.state.divertedPointer = Pointer.StartOf(fallbackFunctionContainer);
        return;
      }
      this.Assert(
        false,
        `Trying to call EXTERNAL function '${funcName}' which has not been bound (and ink fallbacks disabled).`
      );
    }

    // Pop arguments
    const args: unknown[] = [];
    for (let i = 0; i < numberOfArguments; i += 1) {
      const poppedObj = this.state.PopEvaluationStack() as Value;
      const valueObj = poppedObj.valueObject;
      args.push(valueObj);
    }

    // Reverse arguments from the order they were popped,
    // so they're the right way round again.
    args.reverse();

    // Run the function!
    const funcResult = funcDef?.function(args);

    // Convert return value (if any) to the a type that the ink engine can use
    let returnObj = null;
    if (funcResult != null) {
      returnObj = createValue(funcResult);
      this.Assert(
        returnObj !== null,
        `Could not create ink value from returned object of type ${typeof funcResult}`
      );
    } else {
      returnObj = new Void();
    }

    this.state.PushEvaluationStack(returnObj);
  }

  public BindExternalFunctionGeneral(
    funcName: string,
    func: ExternalFunction,
    lookaheadSafe: boolean
  ): void {
    this.IfAsyncWeCant("bind an external function");
    this.Assert(
      this._externals[funcName] === undefined,
      `Function '${funcName}' has already been bound.`
    );
    this._externals[funcName] = {
      function: func,
      lookAheadSafe: lookaheadSafe,
    };
  }

  public TryCoerce(value: unknown): unknown {
    // We're skipping type coercition in this implementation. First of, js
    // is loosely typed, so it's not that important. Secondly, there is no
    // clean way (AFAIK) for the user to describe what type of parameters
    // they expect.
    return value;
  }

  public BindExternalFunction(
    funcName: string,
    func: ExternalFunction,
    lookaheadSafe: boolean
  ): void {
    this.Assert(func != null, "Can't bind a null function");

    this.BindExternalFunctionGeneral(
      funcName,
      (...args: unknown[]) => {
        this.Assert(
          args.length >= func.length,
          `External function expected ${func.length} arguments`
        );

        const coercedArgs = [];
        for (let i = 0, l = args.length; i < l; i += 1) {
          coercedArgs[i] = this.TryCoerce(args[i]);
        }
        return func(...coercedArgs);
      },
      lookaheadSafe
    );
  }

  public UnbindExternalFunction(funcName: string): void {
    this.IfAsyncWeCant("unbind an external a function");
    this.Assert(
      this._externals[funcName] !== undefined,
      `Function '${funcName}' has not been bound.`
    );
    delete this._externals[funcName];
  }

  public ValidateExternalBindings(): void;

  public ValidateExternalBindings(
    c: Container,
    missingExternals: Set<string>
  ): void;

  public ValidateExternalBindings(
    o: ImpowerObject,
    missingExternals: Set<string>
  ): void;

  public ValidateExternalBindings(...args): void {
    let c: Container = null;
    let o: ImpowerObject = null;
    const missingExternals: Set<string> = args[1] || new Set();

    if (args[0] instanceof Container) {
      [c] = args;
    }

    if (args[0] instanceof ImpowerObject) {
      [o] = args;
    }

    if (c === null && o === null) {
      this.ValidateExternalBindings(
        this._mainContentContainer,
        missingExternals
      );
      this._hasValidatedExternals = true;

      // No problem! Validation complete
      if (missingExternals.size === 0) {
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
      c.content.forEach((innerContent) => {
        const container = isContainer(innerContent) ? innerContent : null;
        if (container == null || !container.hasValidName)
          this.ValidateExternalBindings(innerContent, missingExternals);
      });
      Object.entries(c.namedContent).forEach(([, value]) => {
        this.ValidateExternalBindings(
          isContainer(value) ? value : null,
          missingExternals
        );
      });
    } else if (o != null) {
      const divert = o as Divert;
      if (divert && divert.isExternal) {
        const name = divert.targetPathString;
        if (name === null) {
          throw new NullException("name");
        }
        if (this._externals[name] === undefined) {
          if (this.allowExternalFunctionFallbacks) {
            const fallbackFound =
              this.mainContentContainer.namedContent[name] !== undefined;
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
    observer: VariableObserver
  ): void {
    this.IfAsyncWeCant("observe a new variable");

    if (this._variableObservers === null) {
      this._variableObservers = {};
    }

    if (!this.state.variablesState.GlobalVariableExistsWithName(variableName))
      throw new Error(
        `Cannot observe variable '${variableName}' because it wasn't declared in the ink story.`
      );

    if (this._variableObservers[variableName] !== undefined) {
      this._variableObservers[variableName]?.push?.(observer);
    } else {
      this._variableObservers[variableName] = [observer];
    }
  }

  public ObserveVariables(
    variableNames: string[],
    observers: VariableObserver[]
  ): void {
    for (let i = 0, l = variableNames.length; i < l; i += 1) {
      this.ObserveVariable(variableNames[i], observers[i]);
    }
  }

  public RemoveVariableObserver(
    observer?: VariableObserver,
    specificVariableName?: string
  ): void {
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
      if (this._variableObservers[specificVariableName] !== undefined) {
        if (observer != null) {
          const variableObservers =
            this._variableObservers[specificVariableName];
          if (variableObservers != null) {
            variableObservers.splice(variableObservers.indexOf(observer), 1);
            if (variableObservers.length === 0) {
              delete this._variableObservers[specificVariableName];
            }
          }
        } else {
          delete this._variableObservers[specificVariableName];
        }
      }
    } else if (observer != null) {
      const keys = Object.keys(this._variableObservers);
      keys.forEach((varName) => {
        const variableObservers = this._variableObservers[varName];
        if (variableObservers != null) {
          variableObservers.splice(variableObservers.indexOf(observer), 1);
          if (variableObservers.length === 0) {
            delete this._variableObservers[varName];
          }
        }
      });
    }
  }

  public VariableStateDidChangeEvent(
    variableName: string,
    newValueObj: ImpowerObject
  ): void {
    if (this._variableObservers === null) return;

    const observers = this._variableObservers[variableName];
    if (typeof observers !== "undefined") {
      if (!(newValueObj instanceof Value)) {
        throw new Error(
          "Tried to get the value of a variable that isn't a standard type"
        );
      }
      const val = newValueObj as Value;

      observers.forEach((observer) => {
        observer(variableName, val.valueObject);
      });
    }
  }

  get globalTags(): string[] {
    return this.TagsAtStartOfFlowContainerWithPathString("");
  }

  public TagsForContentAtPath(path: string): string[] {
    return this.TagsAtStartOfFlowContainerWithPathString(path);
  }

  public TagsAtStartOfFlowContainerWithPathString(
    pathString: string
  ): string[] {
    const path = new Path(pathString);

    let flowContainer = this.ContentAtPath(path).container;
    if (flowContainer === null) {
      throw new NullException("flowContainer");
    }
    while (flowContainer) {
      const firstContent: ImpowerObject = flowContainer.content[0];
      if (firstContent instanceof Container) {
        flowContainer = firstContent;
      } else {
        break;
      }
    }

    let tags: string[] = null;

    for (let i = 0; i < flowContainer.content.length; i += 1) {
      const c = flowContainer.content[i];
      const tag = c as Tag;
      if (tag) {
        if (tags == null) {
          tags = [];
        }
        tags.push(tag.text);
      } else {
        break;
      }
    }

    return tags;
  }

  public BuildStringOfHierarchy(): string {
    const sb = new StringBuilder();

    this.mainContentContainer.BuildStringOfHierarchy(
      sb,
      0,
      this.state.currentPointer.Resolve()
    );

    return sb.toString();
  }

  public BuildStringOfContainer(container: Container): string {
    const sb = new StringBuilder();
    container.BuildStringOfHierarchy(
      sb,
      0,
      this.state.currentPointer.Resolve()
    );
    return sb.toString();
  }

  public NextContent(): void {
    this.state.previousPointer = this.state.currentPointer.copy();

    if (!this.state.divertedPointer.isNull) {
      this.state.currentPointer = this.state.divertedPointer.copy();
      this.state.divertedPointer = Pointer.Null;

      this.VisitChangedContainersDueToDivert();

      if (!this.state.currentPointer.isNull) {
        return;
      }
    }

    const successfulPointerIncrement = this.IncrementContentPointer();

    if (!successfulPointerIncrement) {
      let didPop = false;

      if (this.state.callStack.CanPop("Function")) {
        this.state.PopCallStack("Function");

        if (this.state.inExpressionEvaluation) {
          this.state.PushEvaluationStack(new Void());
        }

        didPop = true;
      } else if (this.state.callStack.canPopThread) {
        this.state.callStack.PopThread();

        didPop = true;
      } else {
        this.state.TryExitFunctionEvaluationFromGame();
      }

      if (didPop && !this.state.currentPointer.isNull) {
        this.NextContent();
      }
    }
  }

  public IncrementContentPointer(): boolean {
    let successfulIncrement = true;

    let pointer = this.state.callStack.currentElement.currentPointer.copy();
    pointer.index += 1;

    if (pointer.container === null) {
      throw new NullException("pointer.container");
    }
    while (pointer.index >= pointer.container.content.length) {
      successfulIncrement = false;

      const nextAncestor = isContainer(pointer.container.parent)
        ? pointer.container.parent
        : null;
      if (nextAncestor instanceof Container === false) {
        break;
      }

      const indexInAncestor = nextAncestor?.content.indexOf(pointer.container);
      if (indexInAncestor === -1) {
        break;
      }

      pointer = new Pointer(nextAncestor, indexInAncestor);

      pointer.index += 1;

      successfulIncrement = true;
      if (pointer.container === null) {
        throw new NullException("pointer.container");
      }
    }

    if (!successfulIncrement) pointer = Pointer.Null;

    this.state.callStack.currentElement.currentPointer = pointer.copy();

    return successfulIncrement;
  }

  public TryFollowDefaultInvisibleChoice(): boolean {
    const allChoices = this._state.currentChoices;

    const invisibleChoices = allChoices.filter((c) => c.isInvisibleDefault);

    if (
      invisibleChoices.length === 0 ||
      allChoices.length > invisibleChoices.length
    )
      return false;

    const choice = invisibleChoices[0];

    if (choice.targetPath === null) {
      throw new NullException("choice.targetPath");
    }

    if (choice.threadAtGeneration === null) {
      throw new NullException("choice.threadAtGeneration");
    }

    this.state.callStack.currentThread = choice.threadAtGeneration;

    if (this._stateSnapshotAtLastNewline !== null) {
      this.state.callStack.currentThread = this.state.callStack.ForkThread();
    }

    this.ChoosePath(choice.targetPath, false);

    return true;
  }

  public NextSequenceShuffleIndex(): number {
    const numElementsIntVal = this.state.PopEvaluationStack() as IntValue;
    if (!(numElementsIntVal instanceof IntValue)) {
      this.Error("expected number of elements in sequence for shuffle index");
      return 0;
    }

    const seqContainer = this.state.currentPointer.container;
    if (seqContainer === null) {
      throw new NullException("seqContainer");
    }

    // Originally a primitive type, but here, can be null.
    // TODO: Replace by default value?
    if (numElementsIntVal.value === null) {
      throw new NullException("numElementsIntVal.value");
    }
    const numElements = numElementsIntVal.value;

    const seqCountVal = this.state.PopEvaluationStack() as IntValue;
    const seqCount = seqCountVal.value;

    // Originally a primitive type, but here, can be null.
    // TODO: Replace by default value?
    if (seqCount === null) {
      throw new NullException("seqCount");
    }

    const loopIndex = seqCount / numElements;
    const iterationIndex = seqCount % numElements;

    const seqPathStr = seqContainer.path.toString();
    let sequenceHash = 0;
    for (let i = 0, l = seqPathStr.length; i < l; i += 1) {
      sequenceHash += seqPathStr.charCodeAt(i) || 0;
    }
    const randomSeed = sequenceHash + loopIndex + this.state.storySeed;
    const random = new PRNG(Math.floor(randomSeed));

    const unpickedIndices = [];
    for (let i = 0; i < numElements; i += 1) {
      unpickedIndices.push(i);
    }

    for (let i = 0; i <= iterationIndex; i += 1) {
      const chosen = random.next() % unpickedIndices.length;
      const chosenIndex = unpickedIndices[chosen];
      unpickedIndices.splice(chosen, 1);

      if (i === iterationIndex) {
        return chosenIndex;
      }
    }

    throw new Error("Should never reach here");
  }

  public Error(message: string, useEndLineNumber = false): never {
    const e = new StoryException(message);
    e.useEndLineNumber = useEndLineNumber;
    throw e;
  }

  public Warning(message: string): void {
    this.AddError(message, true);
  }

  public AddError(
    message: string,
    isWarning = false,
    useEndLineNumber = false
  ): void {
    const dm = this.currentDebugMetadata;

    const errorTypeStr = isWarning ? "WARNING" : "ERROR";

    if (dm != null) {
      const lineNum = useEndLineNumber ? dm.endLineNumber : dm.startLineNumber;
      message = `RUNTIME ${errorTypeStr}: '${dm.fileName}' line ${lineNum}: ${message}`;
    } else if (!this.state.currentPointer.isNull) {
      message = `RUNTIME ${errorTypeStr}: (${this.state.currentPointer}): ${message}`;
    } else {
      message = `RUNTIME ${errorTypeStr}: ${message}`;
    }

    this.state.AddError(message, isWarning);

    // In a broken state don't need to know about any other errors.
    if (!isWarning) this.state.ForceEnd();
  }

  public Assert(condition: boolean, message = "Story assert"): void {
    if (condition === false) {
      throw new Error(`${message} ${this.currentDebugMetadata}`);
    }
  }

  get currentDebugMetadata(): DebugMetadata {
    let dm: DebugMetadata;

    let pointer = this.state.currentPointer;
    if (!pointer.isNull && pointer.Resolve() !== null) {
      dm = pointer.Resolve()?.debugMetadata;
      if (dm !== null) {
        return dm;
      }
    }

    for (let i = this.state.callStack.elements.length - 1; i >= 0; i -= 1) {
      pointer = this.state.callStack.elements[i].currentPointer;
      if (!pointer.isNull && pointer.Resolve() !== null) {
        dm = pointer.Resolve()?.debugMetadata;
        if (dm !== null) {
          return dm;
        }
      }
    }

    for (let i = this.state.outputStream.length - 1; i >= 0; i -= 1) {
      const outputObj = this.state.outputStream[i];
      dm = outputObj.debugMetadata;
      if (dm !== null) {
        return dm;
      }
    }

    return null;
  }

  get mainContentContainer(): Container {
    if (this._temporaryEvaluationContainer) {
      return this._temporaryEvaluationContainer;
    }
    return this._mainContentContainer;
  }

  /**
   * `_mainContentContainer` is almost guaranteed to be set in the
   * constructor, unless the json is malformed.
   */
  private _mainContentContainer!: Container;

  private _listDefinitions: ListDefinitionsOrigin = null;

  private _externals: Record<string, ExternalFunctionDef>;

  private _variableObservers: Record<string, VariableObserver[]> = null;

  private _hasValidatedExternals = false;

  private _temporaryEvaluationContainer: Container = null;

  /**
   * `state` is almost guaranteed to be set in the constructor, unless
   * using the compiler-specific constructor which will likely not be used in
   * the real world.
   */
  private _state!: StoryState;

  private _asyncContinueActive = false;

  private _stateSnapshotAtLastNewline: StoryState = null;

  private _sawLookaheadUnsafeFunctionAfterNewline = false;

  private _recursiveContinueCount = 0;

  private _asyncSaving = false;

  private _profiler: Profiler = null; // TODO: Profiler
}

export type OutputStateChange =
  | "NoChange"
  | "ExtendedBeyondNewline"
  | "NewlineRemoved";

export interface EvaluateFunctionTextOutput {
  returned: unknown;
  output: string;
}

export interface ExternalFunctionDef {
  function: ExternalFunction;
  lookAheadSafe: boolean;
}

export type VariableObserver = (
  variableName: string,
  newValue: unknown
) => void;

export type ExternalFunction = (...args: unknown[]) => unknown;
