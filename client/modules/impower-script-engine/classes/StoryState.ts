import { PushPopType } from "../types/PushPopType";
import { createValue } from "../utils/createValue";
import { CallStack } from "./CallStack";
import { Choice } from "./Choice";
import { Container } from "./Container";
import { ControlCommand } from "./ControlCommand";
import { Debug } from "./Debug";
import { Flow } from "./Flow";
import { Glue } from "./Glue";
import { JsonReader } from "./JsonReader";
import { JsonSerialisation } from "./JsonSerialisation";
import { JsonWriter } from "./JsonWriter";
import { List } from "./List";
import { ListValue } from "./ListValue";
import { NullException } from "./NullException";
import { Path } from "./Path";
import { Pointer } from "./Pointer";
import { PRNG } from "./PRNG";
import { RuntimeObject } from "./RuntimeObject";
import { StatePatch } from "./StatePatch";
import { Story } from "./Story";
import { StringBuilder } from "./StringBuilder";
import { StringValue } from "./StringValue";
import { Tag } from "./Tag";
import { Value } from "./Value";
import { VariablesState } from "./VariablesState";
import { Void } from "./Void";

export class StoryState {
  public readonly kSaveStateVersion = 9;

  public readonly kMinCompatibleLoadVersion = 8;

  public onDidLoadState: () => void = null;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public ToJson(indented = false): string {
    const writer = new JsonWriter();
    this.WriteJson(writer);
    return writer.ToString();
  }

  public toJson(indented = false): string {
    return this.ToJson(indented);
  }

  public LoadJson(json: string): void {
    const jObject = new JsonReader(json).ToDictionary();
    this.LoadJsonObj(jObject);
    if (this.onDidLoadState !== null) this.onDidLoadState();
  }

  public VisitCountAtPathString(pathString: string): number {
    let visitCountOut;

    if (this._patch !== null) {
      const { container } = this.story.ContentAtPath(new Path(pathString));
      if (container === null)
        throw new Error(`Content at path not found: ${pathString}`);

      visitCountOut = this._patch.TryGetVisitCount(container, 0);
      if (visitCountOut.exists) {
        return visitCountOut.result;
      }
    }

    visitCountOut = this._visitCounts[pathString];
    if (visitCountOut !== undefined) {
      return visitCountOut;
    }

    return 0;
  }

  public VisitCountForContainer(container: Container): number {
    if (container === null) {
      throw new NullException("container");
    }
    if (!container.visitsShouldBeCounted) {
      this.story.Error(
        `Read count for target (${container.name} - on ${container.debugMetadata}) unknown. The story may need to be compiled with countAllVisits flag (-c).`
      );
      return 0;
    }

    if (this._patch !== null) {
      const count = this._patch.TryGetVisitCount(container, 0);
      if (count.exists) {
        return count.result;
      }
    }

    const containerPathStr = container.path.toString();
    const count2 = this._visitCounts[containerPathStr];
    if (count2 !== undefined) {
      return count2;
    }

    return 0;
  }

  public IncrementVisitCountForContainer(container: Container): void {
    if (this._patch !== null) {
      let currCount = this.VisitCountForContainer(container);
      currCount += 1;
      this._patch.SetVisitCount(container, currCount);
      return;
    }

    const containerPathStr = container.path.toString();
    const count = this._visitCounts[containerPathStr];
    if (count !== undefined) {
      this._visitCounts[containerPathStr] = (count || 0) + 1;
    } else {
      this._visitCounts[containerPathStr] = 1;
    }
  }

  public RecordTurnIndexVisitToContainer(container: Container): void {
    if (this._patch !== null) {
      this._patch.SetTurnIndex(container, this.currentTurnIndex);
      return;
    }

    const containerPathStr = container.path.toString();
    this._turnIndices[containerPathStr] = this.currentTurnIndex;
  }

  public TurnsSinceForContainer(container: Container): number {
    if (!container.turnIndexShouldBeCounted) {
      this.story.Error(
        `TURNS_SINCE() for target (${container.name} - on ${container.debugMetadata}) unknown. The story may need to be compiled with countAllVisits flag (-c).`
      );
    }

    if (this._patch !== null) {
      const index = this._patch.TryGetTurnIndex(container, 0);
      if (index.exists) {
        return this.currentTurnIndex - index.result;
      }
    }

    const containerPathStr = container.path.toString();
    const index2 = this._turnIndices[containerPathStr];
    if (index2 !== undefined) {
      return this.currentTurnIndex - index2;
    }
    return -1;
  }

  get callstackDepth(): number {
    return this.callStack.depth;
  }

  get outputStream(): RuntimeObject[] {
    return this._currentFlow.outputStream;
  }

  get currentChoices(): Choice[] {
    // If we can continue generating text content rather than choices,
    // then we reflect the choice list as being empty, since choices
    // should always come at the end.
    if (this.canContinue) return [];
    return this._currentFlow.currentChoices;
  }

  get generatedChoices(): Choice[] {
    return this._currentFlow.currentChoices;
  }

  get currentErrors(): string[] {
    return this._currentErrors;
  }

  private _currentErrors: string[] = null;

  get currentWarnings(): string[] {
    return this._currentWarnings;
  }

  private _currentWarnings: string[] = null;

  get variablesState(): VariablesState {
    return this._variablesState;
  }

  set variablesState(value) {
    this._variablesState = value;
  }

  private _variablesState: VariablesState;

  get callStack(): CallStack {
    return this._currentFlow.callStack;
  }

  get evaluationStack(): RuntimeObject[] {
    return this._evaluationStack;
  }

  private _evaluationStack: RuntimeObject[];

  public divertedPointer: Pointer = Pointer.Null;

  get currentTurnIndex(): number {
    return this._currentTurnIndex;
  }

  set currentTurnIndex(value) {
    this._currentTurnIndex = value;
  }

  private _currentTurnIndex = 0;

  public storySeed = 0;

  public previousRandom = 0;

  public didSafeExit = false;

  public story: Story;

  get currentPathString(): string {
    const pointer = this.currentPointer;
    if (pointer.isNull) {
      return null;
    }
    if (pointer.path === null) {
      throw new NullException("pointer.path");
    }
    return pointer.path.toString();
  }

  get currentPointer(): Pointer {
    return this.callStack.currentElement.currentPointer.copy();
  }

  set currentPointer(value) {
    this.callStack.currentElement.currentPointer = value.copy();
  }

  get previousPointer(): Pointer {
    return this.callStack.currentThread.previousPointer.copy();
  }

  set previousPointer(value) {
    this.callStack.currentThread.previousPointer = value.copy();
  }

  get canContinue(): boolean {
    return !this.currentPointer.isNull && !this.hasError;
  }

  get hasError(): boolean {
    return this.currentErrors != null && this.currentErrors.length > 0;
  }

  get hasWarning(): boolean {
    return this.currentWarnings != null && this.currentWarnings.length > 0;
  }

  get currentText(): string {
    if (this._outputStreamTextDirty) {
      const sb = new StringBuilder();

      this.outputStream.forEach((outputObj) => {
        const textContent = outputObj as StringValue;
        if (textContent !== null) {
          sb.Append(textContent.value);
        }
      });

      this._currentText = this.CleanOutputWhitespace(sb.ToString());
      this._outputStreamTextDirty = false;
    }

    return this._currentText;
  }

  private _currentText: string = null;

  public CleanOutputWhitespace(str: string): string {
    const sb = new StringBuilder();

    let currentWhitespaceStart = -1;
    let startOfLine = 0;

    for (let i = 0; i < str.length; i += 1) {
      const c = str.charAt(i);

      const isInlineWhitespace = c === " " || c === "\t";

      if (isInlineWhitespace && currentWhitespaceStart === -1) {
        currentWhitespaceStart = i;
      }

      if (!isInlineWhitespace) {
        if (
          c !== "\n" &&
          currentWhitespaceStart > 0 &&
          currentWhitespaceStart !== startOfLine
        ) {
          sb.Append(" ");
        }
        currentWhitespaceStart = -1;
      }

      if (c === "\n") {
        startOfLine = i + 1;
      }

      if (!isInlineWhitespace) {
        sb.Append(c);
      }
    }

    return sb.ToString();
  }

  get currentTags(): string[] {
    if (this._outputStreamTagsDirty) {
      this._currentTags = [];

      this.outputStream.forEach((outputObj) => {
        const tag = outputObj as Tag;
        if (tag !== null) {
          this._currentTags.push(tag.text);
        }
      });

      this._outputStreamTagsDirty = false;
    }

    return this._currentTags;
  }

  private _currentTags: string[] = null;

  get currentFlowName(): string {
    return this._currentFlow.name;
  }

  get inExpressionEvaluation(): boolean {
    return this.callStack.currentElement.inExpressionEvaluation;
  }

  set inExpressionEvaluation(value) {
    this.callStack.currentElement.inExpressionEvaluation = value;
  }

  constructor(story: Story) {
    this.story = story;

    this._currentFlow = new Flow(this.kDefaultFlowName, story);
    this.OutputStreamDirty();

    this._evaluationStack = [];

    this._variablesState = new VariablesState(
      this.callStack,
      story.listDefinitions
    );

    this._visitCounts = {};
    this._turnIndices = {};
    this.currentTurnIndex = -1;

    const timeSeed = new Date().getTime();
    this.storySeed = new PRNG(timeSeed).next() % 100;
    this.previousRandom = 0;

    this.GoToStart();
  }

  public GoToStart(): void {
    this.callStack.currentElement.currentPointer = Pointer.StartOf(
      this.story.mainContentContainer
    );
  }

  public SwitchFlow_Internal(flowName: string): void {
    if (flowName === null)
      throw new Error("Must pass a non-null string to Story.SwitchFlow");

    if (this._namedFlows === null) {
      this._namedFlows = {};
      this._namedFlows[this.kDefaultFlowName] = this._currentFlow;
    }

    if (flowName === this._currentFlow.name) {
      return;
    }

    let flow: Flow;
    const content = this._namedFlows[flowName];
    if (content !== undefined) {
      flow = content;
    } else {
      flow = new Flow(flowName, this.story);
      this._namedFlows[flowName] = flow;
    }

    this._currentFlow = flow;
    this.variablesState.callStack = this._currentFlow.callStack;

    this.OutputStreamDirty();
  }

  public SwitchToDefaultFlow_Internal(): void {
    if (this._namedFlows === null) return;
    this.SwitchFlow_Internal(this.kDefaultFlowName);
  }

  public RemoveFlow_Internal(flowName: string): void {
    if (flowName === null)
      throw new Error("Must pass a non-null string to Story.DestroyFlow");
    if (flowName === this.kDefaultFlowName)
      throw new Error("Cannot destroy default flow");

    if (this._currentFlow.name === flowName) {
      this.SwitchToDefaultFlow_Internal();
    }

    if (this._namedFlows === null) {
      throw new NullException("this._namedFlows");
    }
    delete this._namedFlows[flowName];
  }

  public CopyAndStartPatching(): StoryState {
    const copy = new StoryState(this.story);

    copy._patch = new StatePatch(this._patch);

    copy._currentFlow.name = this._currentFlow.name;
    copy._currentFlow.callStack = new CallStack(this._currentFlow.callStack);
    copy._currentFlow.currentChoices.push(...this._currentFlow.currentChoices);
    copy._currentFlow.outputStream.push(...this._currentFlow.outputStream);
    copy.OutputStreamDirty();

    if (this._namedFlows !== null) {
      copy._namedFlows = {};
      Object.entries(this._namedFlows).forEach(
        ([namedFlowKey, namedFlowValue]) => {
          copy._namedFlows[namedFlowKey] = namedFlowValue;
        }
      );
      copy._namedFlows[this._currentFlow.name] = copy._currentFlow;
    }

    if (this.hasError) {
      copy._currentErrors = [];
      copy._currentErrors.push(...(this.currentErrors || []));
    }

    if (this.hasWarning) {
      copy._currentWarnings = [];
      copy._currentWarnings.push(...(this.currentWarnings || []));
    }

    copy.variablesState = this.variablesState;
    copy.variablesState.callStack = copy.callStack;
    copy.variablesState.patch = copy._patch;

    copy.evaluationStack.push(...this.evaluationStack);

    if (!this.divertedPointer.isNull)
      copy.divertedPointer = this.divertedPointer.copy();

    copy.previousPointer = this.previousPointer.copy();

    copy._visitCounts = this._visitCounts;
    copy._turnIndices = this._turnIndices;

    copy.currentTurnIndex = this.currentTurnIndex;
    copy.storySeed = this.storySeed;
    copy.previousRandom = this.previousRandom;

    copy.didSafeExit = this.didSafeExit;

    return copy;
  }

  public RestoreAfterPatch(): void {
    this.variablesState.callStack = this.callStack;
    this.variablesState.patch = this._patch;
  }

  public ApplyAnyPatch(): void {
    if (this._patch === null) return;

    this.variablesState.ApplyPatch();

    this._patch.visitCounts.forEach((value, key) => {
      this.ApplyCountChanges(key, value, true);
    });

    this._patch.turnIndices.forEach((value, key) => {
      this.ApplyCountChanges(key, value, false);
    });

    this._patch = null;
  }

  public ApplyCountChanges(
    container: Container,
    newCount: number,
    isVisit: boolean
  ): void {
    const counts = isVisit ? this._visitCounts : this._turnIndices;
    counts[container.path.toString()] = newCount;
  }

  public WriteJson(writer: JsonWriter): void {
    writer.WriteObjectStart();

    writer.WritePropertyStart("flows");
    writer.WriteObjectStart();

    // NOTE: Never pass `WriteJson` directly as an argument to `WriteProperty`.
    // Call it inside a function to make sure `this` is correctly bound
    // and passed down the call hierarchy.

    if (this._namedFlows !== null) {
      Object.entries(this._namedFlows).forEach(
        ([namedFlowKey, namedFlowValue]) => {
          writer.WriteProperty(namedFlowKey, (w) =>
            namedFlowValue.WriteJson(w)
          );
        }
      );
    } else {
      writer.WriteProperty(this._currentFlow.name, (w) =>
        this._currentFlow.WriteJson(w)
      );
    }

    writer.WriteObjectEnd();
    writer.WritePropertyEnd();

    writer.WriteProperty("currentFlowName", this._currentFlow.name);

    writer.WriteProperty("variablesState", (w) =>
      this.variablesState.WriteJson(w)
    );

    writer.WriteProperty("evalStack", (w) =>
      JsonSerialisation.WriteListRuntimeObjs(w, this.evaluationStack)
    );

    if (!this.divertedPointer.isNull) {
      if (this.divertedPointer.path === null) {
        throw new NullException("divertedPointer");
      }
      writer.WriteProperty(
        "currentDivertTarget",
        this.divertedPointer.path.componentsString
      );
    }

    writer.WriteProperty("visitCounts", (w) =>
      JsonSerialisation.WriteIntDictionary(w, this._visitCounts)
    );
    writer.WriteProperty("turnIndices", (w) =>
      JsonSerialisation.WriteIntDictionary(w, this._turnIndices)
    );

    writer.WriteIntProperty("turnIdx", this.currentTurnIndex);
    writer.WriteIntProperty("storySeed", this.storySeed);
    writer.WriteIntProperty("previousRandom", this.previousRandom);

    writer.WriteIntProperty("inkSaveVersion", this.kSaveStateVersion);

    writer.WriteIntProperty("inkFormatVersion", Story.inkVersionCurrent);

    writer.WriteObjectEnd();
  }

  public LoadJsonObj(value: Record<string, unknown>): void {
    const jObject = value;

    const jSaveVersion = jObject.inkSaveVersion;
    if (jSaveVersion == null) {
      throw new Error("ink save format incorrect, can't load.");
    } else if (Number(jSaveVersion) < this.kMinCompatibleLoadVersion) {
      throw new Error(
        `Save format isn't compatible with the current version (saw '${jSaveVersion}', but minimum is ${this.kMinCompatibleLoadVersion}), so can't load.`
      );
    }

    const flowsObj = jObject.flows;
    if (flowsObj != null) {
      const flowsObjDict = flowsObj as Record<string, unknown>;

      // Single default flow
      if (Object.keys(flowsObjDict).length === 1) {
        this._namedFlows = null;
      } else if (this._namedFlows === null) {
        this._namedFlows = {};
      } else {
        this._namedFlows = {};
      }

      const flowsObjDictEntries = Object.entries(flowsObjDict);
      flowsObjDictEntries.forEach(([namedFlowObjKey, namedFlowObjValue]) => {
        const name = namedFlowObjKey;
        const flowObj = namedFlowObjValue as Record<string, unknown>;

        const flow = new Flow(name, this.story, flowObj);

        if (Object.keys(flowsObjDict).length === 1) {
          this._currentFlow = new Flow(name, this.story, flowObj);
        } else {
          if (this._namedFlows === null) {
            throw new NullException("this._namedFlows");
          }
          this._namedFlows[name] = flow;
        }
      });

      if (
        this._namedFlows != null &&
        Object.keys(this._namedFlows || {}).length > 1
      ) {
        const currFlowName = jObject.currentFlowName as string;
        // Adding a bang at the end, because we're trusting the save, as
        // done in upstream.  If the save is corrupted, the execution
        // is undefined.
        this._currentFlow = this._namedFlows[currFlowName];
      }
    } else {
      this._namedFlows = null;
      this._currentFlow.name = this.kDefaultFlowName;
      this._currentFlow.callStack.SetJsonToken(
        jObject.callstackThreads as Record<string, unknown>,
        this.story
      );
      this._currentFlow.outputStream = JsonSerialisation.JArrayToRuntimeObjList(
        jObject.outputStream as unknown[]
      );
      this._currentFlow.currentChoices =
        JsonSerialisation.JArrayToRuntimeObjList(
          jObject.currentChoices as unknown[]
        ) as Choice[];

      const jChoiceThreadsObj = jObject.choiceThreads as Record<
        string,
        unknown
      >;
      this._currentFlow.LoadFlowChoiceThreads(jChoiceThreadsObj, this.story);
    }

    this.OutputStreamDirty();

    this.variablesState.SetJsonToken(
      jObject.variablesState as Record<string, unknown>
    );
    this.variablesState.callStack = this._currentFlow.callStack;

    this._evaluationStack = JsonSerialisation.JArrayToRuntimeObjList(
      jObject.evalStack as unknown[]
    );

    const currentDivertTargetPath = jObject.currentDivertTarget;
    if (currentDivertTargetPath != null) {
      const divertPath = new Path(currentDivertTargetPath.toString());
      this.divertedPointer = this.story.PointerAtPath(divertPath);
    }

    this._visitCounts = JsonSerialisation.JObjectToIntDictionary(
      jObject.visitCounts as Record<string, unknown>
    );
    this._turnIndices = JsonSerialisation.JObjectToIntDictionary(
      jObject.turnIndices as Record<string, unknown>
    );
    this.currentTurnIndex = Number(jObject.turnIdx);
    this.storySeed = Number(jObject.storySeed);
    this.previousRandom = Number(jObject.previousRandom);
  }

  public ResetErrors(): void {
    this._currentErrors = null;
    this._currentWarnings = null;
  }

  public ResetOutput(objs: RuntimeObject[] = null): void {
    this.outputStream.length = 0;
    if (objs !== null) this.outputStream.push(...objs);
    this.OutputStreamDirty();
  }

  public PushToOutputStream(obj: RuntimeObject): void {
    const text = obj as StringValue;
    if (text !== null) {
      const listText = this.TrySplittingHeadTailWhitespace(text);
      if (listText !== null) {
        listText.forEach((textObj) => {
          this.PushToOutputStreamIndividual(textObj);
        });
        this.OutputStreamDirty();
        return;
      }
    }

    this.PushToOutputStreamIndividual(obj);
    this.OutputStreamDirty();
  }

  public PopFromOutputStream(count: number): void {
    this.outputStream.splice(this.outputStream.length - count, count);
    this.OutputStreamDirty();
  }

  public TrySplittingHeadTailWhitespace(single: StringValue): StringValue[] {
    const str = single.value;
    if (str === null) {
      throw new NullException("single.value");
    }

    let headFirstNewlineIdx = -1;
    let headLastNewlineIdx = -1;
    for (let i = 0; i < str.length; i += 1) {
      const c = str[i];
      if (c === "\n") {
        if (headFirstNewlineIdx === -1) {
          headFirstNewlineIdx = i;
        }
        headLastNewlineIdx = i;
      } else if (c !== " " && c !== "\t") {
        break;
      }
    }

    let tailLastNewlineIdx = -1;
    let tailFirstNewlineIdx = -1;
    for (let i = str.length - 1; i >= 0; i -= 1) {
      const c = str[i];
      if (c === "\n") {
        if (tailLastNewlineIdx === -1) {
          tailLastNewlineIdx = i;
        }
        tailFirstNewlineIdx = i;
      } else if (c !== " " && c !== "\t") {
        break;
      }
    }

    // No splitting to be done?
    if (headFirstNewlineIdx === -1 && tailLastNewlineIdx === -1) return null;

    const listTexts: StringValue[] = [];
    let innerStrStart = 0;
    let innerStrEnd = str.length;

    if (headFirstNewlineIdx !== -1) {
      if (headFirstNewlineIdx > 0) {
        const leadingSpaces = new StringValue(
          str.substring(0, headFirstNewlineIdx)
        );
        listTexts.push(leadingSpaces);
      }
      listTexts.push(new StringValue("\n"));
      innerStrStart = headLastNewlineIdx + 1;
    }

    if (tailLastNewlineIdx !== -1) {
      innerStrEnd = tailFirstNewlineIdx;
    }

    if (innerStrEnd > innerStrStart) {
      const innerStrText = str.substring(
        innerStrStart,
        innerStrEnd - innerStrStart
      );
      listTexts.push(new StringValue(innerStrText));
    }

    if (tailLastNewlineIdx !== -1 && tailFirstNewlineIdx > headLastNewlineIdx) {
      listTexts.push(new StringValue("\n"));
      if (tailLastNewlineIdx < str.length - 1) {
        const numSpaces = str.length - tailLastNewlineIdx - 1;
        const trailingSpaces = new StringValue(
          str.substring(tailLastNewlineIdx + 1, numSpaces)
        );
        listTexts.push(trailingSpaces);
      }
    }

    return listTexts;
  }

  public PushToOutputStreamIndividual(obj: RuntimeObject): void {
    const glue = obj as Glue;
    const text = obj as StringValue;

    let includeInOutput = true;

    if (glue) {
      this.TrimNewlinesFromOutputStream();
      includeInOutput = true;
    } else if (text) {
      let functionTrimIndex = -1;
      const currEl = this.callStack.currentElement;
      if (currEl.type === "Function") {
        functionTrimIndex = currEl.functionStartInOutputStream;
      }

      let glueTrimIndex = -1;
      for (let i = this.outputStream.length - 1; i >= 0; i -= 1) {
        const o = this.outputStream[i];
        const c = o instanceof ControlCommand ? o : null;
        const g = o instanceof Glue ? o : null;

        if (g != null) {
          glueTrimIndex = i;
          break;
        } else if (c != null && c.commandType === "BeginString") {
          if (i >= functionTrimIndex) {
            functionTrimIndex = -1;
          }
          break;
        }
      }

      let trimIndex = -1;
      if (glueTrimIndex !== -1 && functionTrimIndex !== -1) {
        trimIndex = Math.min(functionTrimIndex, glueTrimIndex);
      } else if (glueTrimIndex !== -1) {
        trimIndex = glueTrimIndex;
      } else {
        trimIndex = functionTrimIndex;
      }

      if (trimIndex !== -1) {
        if (text.isNewline) {
          includeInOutput = false;
        } else if (text.isNonWhitespace) {
          if (glueTrimIndex > -1) this.RemoveExistingGlue();

          if (functionTrimIndex > -1) {
            const callStackElements = this.callStack.elements;
            for (let i = callStackElements.length - 1; i >= 0; i -= 1) {
              const el = callStackElements[i];
              if (el.type === "Function") {
                el.functionStartInOutputStream = -1;
              } else {
                break;
              }
            }
          }
        }
      } else if (text.isNewline) {
        if (this.outputStreamEndsInNewline || !this.outputStreamContainsContent)
          includeInOutput = false;
      }
    }

    if (includeInOutput) {
      if (obj === null) {
        throw new NullException("obj");
      }
      this.outputStream.push(obj);
      this.OutputStreamDirty();
    }
  }

  public TrimNewlinesFromOutputStream(): void {
    let removeWhitespaceFrom = -1;

    let i = this.outputStream.length - 1;
    while (i >= 0) {
      const obj = this.outputStream[i];
      const cmd = obj as ControlCommand;
      const txt = obj as StringValue;

      if (cmd != null || (txt != null && txt.isNonWhitespace)) {
        break;
      } else if (txt != null && txt.isNewline) {
        removeWhitespaceFrom = i;
      }
      i -= 1;
    }

    // Remove the whitespace
    if (removeWhitespaceFrom >= 0) {
      i = removeWhitespaceFrom;
      while (i < this.outputStream.length) {
        const text = this.outputStream[i] as StringValue;
        if (text) {
          this.outputStream.splice(i, 1);
        } else {
          i += 1;
        }
      }
    }

    this.OutputStreamDirty();
  }

  public RemoveExistingGlue(): void {
    for (let i = this.outputStream.length - 1; i >= 0; i -= 1) {
      const c = this.outputStream[i];
      if (c instanceof Glue) {
        this.outputStream.splice(i, 1);
      } else if (c instanceof ControlCommand) {
        break;
      }
    }

    this.OutputStreamDirty();
  }

  get outputStreamEndsInNewline(): boolean {
    if (this.outputStream.length > 0) {
      for (let i = this.outputStream.length - 1; i >= 0; i -= 1) {
        const obj = this.outputStream[i];
        if (obj instanceof ControlCommand) break;
        const text = this.outputStream[i];
        if (text instanceof StringValue) {
          if (text.isNewline) return true;
          if (text.isNonWhitespace) break;
        }
      }
    }

    return false;
  }

  get outputStreamContainsContent(): boolean {
    for (let i = 0; i < this.outputStream.length; i += 1) {
      const content = this.outputStream[i];
      if (content instanceof StringValue) {
        return true;
      }
    }
    return false;
  }

  get inStringEvaluation(): boolean {
    for (let i = this.outputStream.length - 1; i >= 0; i -= 1) {
      const cmd = this.outputStream[i] as ControlCommand;
      if (cmd instanceof ControlCommand && cmd.commandType === "BeginString") {
        return true;
      }
    }

    return false;
  }

  public PushEvaluationStack(obj: RuntimeObject): void {
    const listValue = obj as ListValue;
    if (listValue) {
      // Update origin when list is has something to indicate the list origin
      const rawList = listValue.value;
      if (rawList === null) {
        throw new NullException("rawList");
      }

      if (rawList.originNames != null) {
        if (!rawList.origins) rawList.origins = [];
        rawList.origins.length = 0;

        rawList.originNames.forEach((n) => {
          if (this.story.listDefinitions === null) {
            throw new NullException("StoryState.story.listDefinitions");
          }
          const def = this.story.listDefinitions.TryListGetDefinition(n, null);
          if (def.result === null) {
            throw new NullException("StoryState def.result");
          }
          if (rawList.origins.indexOf(def.result) < 0) {
            rawList.origins.push(def.result);
          }
        });
      }
    }

    if (obj === null) {
      throw new NullException("obj");
    }
    this.evaluationStack.push(obj);
  }

  public PopEvaluationStackRange(numberOfObjects = 1): RuntimeObject[] {
    if (numberOfObjects < 1) {
      return [];
    }
    if (numberOfObjects === 1) {
      const obj = this.evaluationStack.pop();
      return [obj === undefined ? null : obj];
    }
    if (numberOfObjects > this.evaluationStack.length) {
      throw new Error("trying to pop too many objects");
    }

    const popped = this.evaluationStack.splice(
      this.evaluationStack.length - numberOfObjects,
      numberOfObjects
    );
    return popped === undefined ? null : popped;
  }

  public PopEvaluationStack(): RuntimeObject {
    return this.PopEvaluationStackRange(1)[0];
  }

  public PeekEvaluationStack(): RuntimeObject {
    return this.evaluationStack[this.evaluationStack.length - 1];
  }

  public ForceEnd(): void {
    this.callStack.Reset();

    this._currentFlow.currentChoices.length = 0;

    this.currentPointer = Pointer.Null;
    this.previousPointer = Pointer.Null;

    this.didSafeExit = true;
  }

  public TrimWhitespaceFromFunctionEnd(): void {
    Debug.Assert(this.callStack.currentElement.type === "Function");
    let functionStartPoint =
      this.callStack.currentElement.functionStartInOutputStream;

    if (functionStartPoint === -1) {
      functionStartPoint = 0;
    }

    for (
      let i = this.outputStream.length - 1;
      i >= functionStartPoint;
      i -= 1
    ) {
      const obj = this.outputStream[i];
      const txt = obj as StringValue;
      const cmd = obj as ControlCommand;

      if (txt !== null) {
        if (cmd) {
          break;
        }

        if (txt.isNewline || txt.isInlineWhitespace) {
          this.outputStream.splice(i, 1);
          this.OutputStreamDirty();
        } else {
          break;
        }
      }
    }
  }

  public PopCallStack(popType: PushPopType = null): void {
    if (this.callStack.currentElement.type === "Function")
      this.TrimWhitespaceFromFunctionEnd();

    this.callStack.Pop(popType);
  }

  public SetChosenPath(path: Path, incrementingTurnIndex: boolean): void {
    // Changing direction, assume we need to clear current set of choices
    this._currentFlow.currentChoices.length = 0;

    const newPointer = this.story.PointerAtPath(path);
    if (!newPointer.isNull && newPointer.index === -1) newPointer.index = 0;

    this.currentPointer = newPointer;

    if (incrementingTurnIndex) {
      this.currentTurnIndex += 1;
    }
  }

  public StartFunctionEvaluationFromGame(
    funcContainer: Container,
    args: unknown[]
  ): void {
    this.callStack.Push(
      "FunctionEvaluationFromGame",
      this.evaluationStack.length
    );
    this.callStack.currentElement.currentPointer =
      Pointer.StartOf(funcContainer);

    this.PassArgumentsToEvaluationStack(args);
  }

  public PassArgumentsToEvaluationStack(...args: unknown[]): void {
    if (args !== null) {
      for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];
        if (
          typeof arg !== "number" &&
          typeof arg !== "string" &&
          !(arg instanceof List)
        ) {
          throw new Error(
            `${
              "ink arguments when calling EvaluateFunction / ChoosePathStringWithParameters must be" +
              "number, string or List. Argument was "
            }${arg?.constructor?.name}`
          );
        }

        this.PushEvaluationStack(
          createValue(args[i]) as unknown as RuntimeObject
        );
      }
    }
  }

  public TryExitFunctionEvaluationFromGame(): boolean {
    if (this.callStack.currentElement.type === "FunctionEvaluationFromGame") {
      this.currentPointer = Pointer.Null;
      this.didSafeExit = true;
      return true;
    }

    return false;
  }

  public CompleteFunctionEvaluationFromGame(): unknown {
    if (this.callStack.currentElement.type !== "FunctionEvaluationFromGame") {
      throw new Error(
        `Expected external function evaluation to be complete. Stack trace: ${this.callStack.callStackTrace}`
      );
    }

    const originalEvaluationStackHeight =
      this.callStack.currentElement.evaluationStackHeightWhenPushed;

    let returnedObj: RuntimeObject = null;
    while (this.evaluationStack.length > originalEvaluationStackHeight) {
      const poppedObj = this.PopEvaluationStack();
      if (returnedObj === null) {
        returnedObj = poppedObj;
      }
    }

    this.PopCallStack("FunctionEvaluationFromGame");

    if (returnedObj) {
      if (returnedObj instanceof Void) {
        return null;
      }

      // Some kind of value, if not void
      // var returnVal = returnedObj as Runtime.Value;
      const returnVal = returnedObj as Value;

      // DivertTargets get returned as the string of components
      // (rather than a Path, which isn't public)
      if (returnVal.valueType === "DivertTarget") {
        return returnVal.valueObject.toString();
      }

      // Other types can just have their exact object type:
      // int, float, string. VariablePointers get returned as strings.
      return returnVal.valueObject;
    }

    return null;
  }

  public AddError(message: string, isWarning: boolean): void {
    if (!isWarning) {
      if (this._currentErrors == null) this._currentErrors = [];
      this._currentErrors.push(message);
    } else {
      if (this._currentWarnings == null) this._currentWarnings = [];
      this._currentWarnings.push(message);
    }
  }

  public OutputStreamDirty(): void {
    this._outputStreamTextDirty = true;
    this._outputStreamTagsDirty = true;
  }

  private _visitCounts: Record<string, number>;

  private _turnIndices: Record<string, number>;

  private _outputStreamTextDirty = true;

  private _outputStreamTagsDirty = true;

  private _patch: StatePatch = null;

  private _currentFlow: Flow;

  private _namedFlows: Record<string, Flow> = null;

  private readonly kDefaultFlowName = "DEFAULT_FLOW";
}
