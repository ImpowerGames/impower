import { PushPopType } from "../types/PushPopType";
import { Debug } from "./Debug";
import { ImpowerObject } from "./ImpowerObject";
import { JsonWriter } from "./JsonWriter";
import { ListValue } from "./ListValue";
import { NullException } from "./NullException";
import { Pointer } from "./Pointer";
import { Story } from "./Story";
import { StringBuilder } from "./StringBuilder";
import { Thread } from "./Thread";
import { ThreadElement } from "./ThreadElement";

export class CallStack {
  get elements(): ThreadElement[] {
    return this.callStack;
  }

  get depth(): number {
    return this.elements.length;
  }

  get currentElement(): ThreadElement {
    const thread = this._threads[this._threads.length - 1];
    const cs = thread.callstack;
    return cs[cs.length - 1];
  }

  get currentElementIndex(): number {
    return this.callStack.length - 1;
  }

  get currentThread(): Thread {
    return this._threads[this._threads.length - 1];
  }

  set currentThread(value: Thread) {
    Debug.Assert(
      this._threads.length === 1,
      "Shouldn't be directly setting the current thread when we have a stack of them"
    );

    this._threads.length = 0;
    this._threads.push(value);
  }

  get canPop(): boolean {
    return this.callStack.length > 1;
  }

  constructor(storyContext: Story);

  constructor(toCopy: CallStack);

  constructor(...args) {
    if (args[0] instanceof Story) {
      const storyContext = args[0] as Story;

      this._startOfRoot = Pointer.StartOf(storyContext.rootContentContainer);
      this.Reset();
    } else {
      const toCopy = args[0] as CallStack;

      this._threads = [];
      toCopy._threads.forEach((otherThread) => {
        this._threads.push(otherThread.Copy());
      });
      this._threadCounter = toCopy._threadCounter;
      this._startOfRoot = toCopy._startOfRoot.copy();
    }
  }

  public Reset(): void {
    this._threads = [];
    this._threads.push(new Thread());

    this._threads[0].callstack.push(
      new ThreadElement("Tunnel", this._startOfRoot)
    );
  }

  public SetJsonToken(
    jObject: Record<string, unknown>,
    storyContext: Story
  ): void {
    this._threads.length = 0;

    // TODO: (List<object>) jObject ["threads"];
    const jThreads = jObject.threads as unknown[];

    jThreads.forEach((jThreadTok) => {
      // TODO: var jThreadObj = (Dictionary<string, object>)jThreadTok;
      const jThreadObj = jThreadTok;
      const thread = new Thread(jThreadObj, storyContext);
      this._threads.push(thread);
    });

    // TODO: (int)jObject ["threadCounter"];
    this._threadCounter = Number(jObject.threadCounter);
    this._startOfRoot = Pointer.StartOf(storyContext.rootContentContainer);
  }

  public WriteJson(w: JsonWriter): void {
    w.WriteObject((writer) => {
      writer.WritePropertyStart("threads");
      writer.WriteArrayStart();

      this._threads.forEach((thread) => {
        thread.WriteJson(writer);
      });

      writer.WriteArrayEnd();
      writer.WritePropertyEnd();

      writer.WritePropertyStart("threadCounter");
      writer.WriteInt(this._threadCounter);
      writer.WritePropertyEnd();
    });
  }

  public PushThread(): void {
    const newThread = this.currentThread.Copy();
    this._threadCounter += 1;
    newThread.threadIndex = this._threadCounter;
    this._threads.push(newThread);
  }

  public ForkThread(): Thread {
    const forkedThread = this.currentThread.Copy();
    this._threadCounter += 1;
    forkedThread.threadIndex = this._threadCounter;
    return forkedThread;
  }

  public PopThread(): void {
    if (this.canPopThread) {
      this._threads.splice(this._threads.indexOf(this.currentThread), 1); // should be equivalent to a pop()
    } else {
      throw new Error("Can't pop thread");
    }
  }

  get canPopThread(): boolean {
    return this._threads.length > 1 && !this.elementIsEvaluateFromGame;
  }

  get elementIsEvaluateFromGame(): boolean {
    return this.currentElement.type === "FunctionEvaluationFromGame";
  }

  public Push(
    type: PushPopType,
    externalEvaluationStackHeight = 0,
    outputStreamLengthWithPushed = 0
  ): void {
    const element = new ThreadElement(
      type,
      this.currentElement.currentPointer,
      false
    );

    element.evaluationStackHeightWhenPushed = externalEvaluationStackHeight;
    element.functionStartInOutputStream = outputStreamLengthWithPushed;

    this.callStack.push(element);
  }

  public CanPop(type: PushPopType = null): boolean {
    if (!this.canPop) {
      return false;
    }

    if (type == null) {
      return true;
    }

    return this.currentElement.type === type;
  }

  public Pop(type: PushPopType = null): void {
    if (this.CanPop(type)) {
      this.callStack.pop();
    } else {
      throw new Error("Mismatched push/pop in Callstack");
    }
  }

  public GetTemporaryVariableWithName(
    name: string,
    contextIndex = -1
  ): ImpowerObject {
    if (contextIndex === -1) {
      contextIndex = this.currentElementIndex + 1;
    }

    const contextElement = this.callStack[contextIndex - 1];

    const varValue = contextElement.temporaryVariables[name];
    if (varValue !== undefined) {
      return varValue;
    }
    return null;
  }

  public SetTemporaryVariable(
    name: string,
    value: ImpowerObject,
    declareNew: boolean,
    contextIndex = -1
  ): void {
    if (contextIndex === -1) {
      contextIndex = this.currentElementIndex + 1;
    }

    const contextElement = this.callStack[contextIndex - 1];

    if (!declareNew && !contextElement.temporaryVariables[name]) {
      throw new Error(`Could not find temporary variable to set: ${name}`);
    }

    const oldValue = contextElement.temporaryVariables[name];
    if (oldValue !== undefined) {
      ListValue.RetainListOriginsForAssignment(oldValue, value);
    }

    contextElement.temporaryVariables[name] = value;
  }

  public ContextForVariableNamed(name: string): number {
    if (this.currentElement.temporaryVariables[name]) {
      return this.currentElementIndex + 1;
    }
    return 0;
  }

  public ThreadWithIndex(index: number): Thread {
    const filtered = this._threads.filter((t) => t.threadIndex === index);

    return filtered.length > 0 ? filtered[0] : null;
  }

  get callStack(): ThreadElement[] {
    return this.currentThread.callstack;
  }

  get callStackTrace(): string {
    const sb = new StringBuilder();

    for (let t = 0; t < this._threads.length; t += 1) {
      const thread = this._threads[t];
      const isCurrent = t === this._threads.length - 1;
      sb.AppendFormat(
        "=== THREAD {0}/{1} {2}===\n",
        t + 1,
        this._threads.length,
        isCurrent ? "(current) " : ""
      );

      for (let i = 0; i < thread.callstack.length; i += 1) {
        if (thread.callstack[i].type === "Function") {
          sb.Append("  [FUNCTION] ");
        } else {
          sb.Append("  [TUNNEL] ");
        }

        const pointer = thread.callstack[i].currentPointer;
        if (!pointer.isNull) {
          sb.Append("<SOMEWHERE IN ");
          if (pointer.container === null) {
            throw new NullException("pointer.container");
          }
          sb.Append(pointer.container.path.toString());
          sb.AppendLine(">");
        }
      }
    }

    return sb.toString();
  }

  public _threads!: Thread[]; // Banged because it's initialized in Reset().

  public _threadCounter = 0;

  public _startOfRoot: Pointer = Pointer.Null;
}
