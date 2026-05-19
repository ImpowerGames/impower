import { PushPopType } from "./PushPop";
import { Path } from "./Path";
import { Story } from "./Story";
import { JsonSerialisation } from "./JsonSerialisation";
import { ListValue, VariablePointerValue } from "./Value";
import { StringBuilder } from "./StringBuilder";
import { Pointer } from "./Pointer";
import { InkObject } from "./Object";
import { Debug } from "./Debug";
import { tryGetValueFromMap } from "./TryGetResult";
import { throwNullException } from "./NullException";
import { SimpleJson } from "./SimpleJson";

export class CallStack {
  get elements() {
    return this.callStack;
  }

  get depth() {
    return this.elements.length;
  }

  get currentElement() {
    let thread = this._threads[this._threads.length - 1];
    let cs = thread.callstack;
    return cs[cs.length - 1];
  }

  get currentElementIndex() {
    return this.callStack.length - 1;
  }

  get currentThread(): CallStack.Thread {
    return this._threads[this._threads.length - 1];
  }
  set currentThread(value: CallStack.Thread) {
    Debug.Assert(
      this._threads.length == 1,
      "Shouldn't be directly setting the current thread when we have a stack of them",
    );

    this._threads.length = 0;
    this._threads.push(value);
  }

  get canPop() {
    return this.callStack.length > 1;
  }

  constructor(storyContext: Story);
  constructor(toCopy: CallStack);
  constructor() {
    if (arguments[0] instanceof Story) {
      let storyContext = arguments[0] as Story;

      this._startOfRoot = Pointer.StartOf(storyContext.rootContentContainer);
      this.Reset();
    } else {
      let toCopy = arguments[0] as CallStack;

      this._threads = [];
      for (let otherThread of toCopy._threads) {
        this._threads.push(otherThread.Copy());
      }
      this._threadCounter = toCopy._threadCounter;
      this._startOfRoot = toCopy._startOfRoot.copy();
    }
  }

  public Reset() {
    this._threads = [];
    this._threads.push(new CallStack.Thread());

    this._threads[0].callstack.push(
      new CallStack.Element(PushPopType.Tunnel, this._startOfRoot),
    );
  }

  public SetJsonToken(jObject: Record<string, any>, storyContext: Story) {
    this._threads.length = 0;

    // TODO: (List<object>) jObject ["threads"];
    let jThreads: any[] = jObject["threads"];

    for (let jThreadTok of jThreads) {
      // TODO: var jThreadObj = (Dictionary<string, object>)jThreadTok;
      let jThreadObj = jThreadTok;
      let thread = new CallStack.Thread(jThreadObj, storyContext);
      this._threads.push(thread);
    }

    // TODO: (int)jObject ["threadCounter"];
    this._threadCounter = parseInt(jObject["threadCounter"]);
    this._startOfRoot = Pointer.StartOf(storyContext.rootContentContainer);
  }
  public WriteJson(w: SimpleJson.Writer) {
    w.WriteObject((writer) => {
      writer.WritePropertyStart("threads");
      writer.WriteArrayStart();

      for (let thread of this._threads) {
        thread.WriteJson(writer);
      }

      writer.WriteArrayEnd();
      writer.WritePropertyEnd();

      writer.WritePropertyStart("threadCounter");
      writer.WriteInt(this._threadCounter);
      writer.WritePropertyEnd();
    });
  }

  public PushThread() {
    let newThread = this.currentThread.Copy();
    this._threadCounter++;
    newThread.threadIndex = this._threadCounter;
    this._threads.push(newThread);
  }

  public ForkThread() {
    let forkedThread = this.currentThread.Copy();
    this._threadCounter++;
    forkedThread.threadIndex = this._threadCounter;
    return forkedThread;
  }

  public PopThread() {
    if (this.canPopThread) {
      this._threads.splice(this._threads.indexOf(this.currentThread), 1); // should be equivalent to a pop()
    } else {
      throw new Error("Can't pop thread");
    }
  }

  get canPopThread() {
    return this._threads.length > 1 && !this.elementIsEvaluateFromGame;
  }

  get elementIsEvaluateFromGame() {
    return this.currentElement.type == PushPopType.FunctionEvaluationFromGame;
  }

  public Push(
    type: PushPopType,
    externalEvaluationStackHeight: number = 0,
    outputStreamLengthWithPushed: number = 0,
  ) {
    let element = new CallStack.Element(
      type,
      this.currentElement.currentPointer,
      false,
    );

    element.evaluationStackHeightWhenPushed = externalEvaluationStackHeight;
    element.functionStartInOutputStream = outputStreamLengthWithPushed;

    this.callStack.push(element);
  }

  public CanPop(type: PushPopType | null = null) {
    if (!this.canPop) return false;

    if (type == null) return true;

    return this.currentElement.type == type;
  }

  public Pop(type: PushPopType | null = null) {
    if (!this.CanPop(type)) {
      throw new Error("Mismatched push/pop in Callstack");
    }
    // Close any open upvalues that point at the frame we're about to
    // remove. After closing, the pointer becomes self-contained — its
    // `closedValue` holds the snapshot of the variable, and subsequent
    // reads/writes via `VariablesState` go through the closed cell
    // rather than chasing a now-defunct contextIndex.
    const top = this.callStack[this.callStack.length - 1];
    if (top && top.openUpvalues.length > 0) {
      for (const ptr of top.openUpvalues) {
        if (ptr.isClosed) continue;
        // Find the variable in this frame's temporary scopes.
        // Innermost-first matches the lookup order used elsewhere.
        let value: InkObject | null = null;
        for (let i = top.temporaryScopes.length - 1; i >= 0; i--) {
          const found = top.temporaryScopes[i]!.get(ptr.variableName);
          if (found !== undefined) {
            value = found;
            break;
          }
        }
        // If we couldn't find the slot (shouldn't happen if the
        // pointer was correctly registered) leave the pointer in a
        // "closed-but-null" state so reads return null rather than
        // crashing on a dangling contextIndex.
        ptr.closedValue = value ?? null;
      }
      // Drop the references so the frame element can be GC'd cleanly.
      top.openUpvalues = [];
    }
    this.callStack.pop();
  }

  // Look for an existing open upvalue in the given frame matching
  // `variableName`. Used by the auto-resolve path so multiple closures
  // capturing the same variable share a single pointer (Lua semantics:
  // when one closure writes, the others see the change).
  public FindOpenUpvalue(
    contextIndex: number,
    variableName: string,
  ): VariablePointerValue | null {
    const frame = this.callStack[contextIndex - 1];
    if (!frame) return null;
    for (const ptr of frame.openUpvalues) {
      if (!ptr.isClosed && ptr.variableName === variableName) return ptr;
    }
    return null;
  }

  // Register a newly-created open upvalue with its target frame so it
  // gets closed when that frame pops.
  public RegisterOpenUpvalue(
    pointer: VariablePointerValue,
    contextIndex: number,
  ): void {
    const frame = this.callStack[contextIndex - 1];
    if (frame) {
      frame.openUpvalues.push(pointer);
    }
  }

  public GetTemporaryVariableWithName(
    name: string | null,
    contextIndex: number = -1,
  ) {
    // contextIndex 0 means global, so index is actually 1-based
    if (contextIndex == -1) contextIndex = this.currentElementIndex + 1;

    let contextElement = this.callStack[contextIndex - 1];

    // Walk scope stack innermost → outermost. Matches Luau lexical
    // scoping: an inner `local x` shadows an outer `x` for the duration
    // of the inner block.
    const scopes = contextElement.temporaryScopes;
    for (let i = scopes.length - 1; i >= 0; i--) {
      const varValue = tryGetValueFromMap(scopes[i]!, name, null);
      if (varValue.exists) return varValue.result;
    }
    return null;
  }

  public SetTemporaryVariable(
    name: string,
    value: any,
    declareNew: boolean,
    contextIndex: number = -1,
  ) {
    if (contextIndex == -1) contextIndex = this.currentElementIndex + 1;

    let contextElement = this.callStack[contextIndex - 1];
    const scopes = contextElement.temporaryScopes;

    if (declareNew) {
      // `local x = ...` (or any `isNewTemporaryDeclaration`) — always
      // adds the binding to the innermost scope, shadowing any outer
      // `x` in the same call-stack element.
      const inner = scopes[scopes.length - 1]!;
      const oldValue = tryGetValueFromMap(inner, name, null);
      if (oldValue.exists) {
        ListValue.RetainListOriginsForAssignment(oldValue.result, value);
      }
      inner.set(name, value);
      return;
    }

    // Reassigning an existing `local`. Walk scopes innermost → outermost
    // to find the frame that declared it, then update there. Luau
    // reassignment doesn't introduce a new binding.
    for (let i = scopes.length - 1; i >= 0; i--) {
      const frame = scopes[i]!;
      if (frame.has(name)) {
        const oldValue = tryGetValueFromMap(frame, name, null);
        if (oldValue.exists) {
          ListValue.RetainListOriginsForAssignment(oldValue.result, value);
        }
        frame.set(name, value);
        return;
      }
    }
    throw new Error("Could not find temporary variable to set: " + name);
  }

  public ContextForVariableNamed(name: string) {
    const scopes = this.currentElement.temporaryScopes;
    for (let i = scopes.length - 1; i >= 0; i--) {
      if (scopes[i]!.has(name)) return this.currentElementIndex + 1;
    }
    return 0;
  }

  public ThreadWithIndex(index: number) {
    let filtered = this._threads.filter((t) => {
      if (t.threadIndex == index) return t;
    });

    return filtered.length > 0 ? filtered[0] : null;
  }

  get callStack() {
    return this.currentThread.callstack;
  }

  get callStackTrace() {
    let sb = new StringBuilder();

    for (let t = 0; t < this._threads.length; t++) {
      let thread = this._threads[t];
      let isCurrent = t == this._threads.length - 1;
      sb.AppendFormat(
        "=== THREAD {0}/{1} {2}===\n",
        t + 1,
        this._threads.length,
        isCurrent ? "(current) " : "",
      );

      for (let i = 0; i < thread.callstack.length; i++) {
        if (thread.callstack[i].type == PushPopType.Function)
          sb.Append("  [FUNCTION] ");
        else sb.Append("  [TUNNEL] ");

        let pointer = thread.callstack[i].currentPointer;
        if (!pointer.isNull) {
          sb.Append("<SOMEWHERE IN ");
          if (pointer.container === null) {
            return throwNullException("pointer.container");
          }
          sb.Append(pointer.container.path.toString());
          sb.AppendLine(">");
        }
      }
    }

    return sb.toString();
  }

  public _threads!: CallStack.Thread[]; // Banged because it's initialized in Reset().
  public _threadCounter: number = 0;
  public _startOfRoot: Pointer = Pointer.Null;
}

export namespace CallStack {
  export class Element {
    public previousPointer: Pointer = Pointer.Null;
    public currentPointer: Pointer;
    public inExpressionEvaluation: boolean;
    // Stack of temporary-variable scope frames, innermost-last. The
    // function/tunnel body itself is the outermost frame (index 0);
    // each `BeginScope` control command pushes another. Sparkdown uses
    // this to implement Luau's block-scoped `local x` (an inner `local`
    // shadows the outer for the rest of the inner block, then the
    // outer is visible again after `EndScope`). When no `BeginScope` is
    // emitted, only the outer frame exists and the semantics collapse
    // back to ink's function-scoped `temp`.
    public temporaryScopes: Array<Map<string, InkObject>>;
    public type: PushPopType;

    public evaluationStackHeightWhenPushed: number = 0;
    public functionStartInOutputStream: number = 0;

    // Lua-style open upvalues that reference variables in THIS frame.
    // Populated by `Story`'s auto-resolve path when a
    // `VariablePointerValue` with `contextIndex === -1` is pushed onto
    // the evaluation stack and resolves to this frame's index. Drained
    // and closed (snapshot value into `closedValue`) by `CallStack.Pop`
    // immediately before the frame is removed.
    //
    // Closures that escape their lexical parent's lifetime (e.g. outer
    // returns a function it constructed) work correctly because the
    // captured pointer becomes self-contained at frame-pop time.
    public openUpvalues: VariablePointerValue[] = [];

    constructor(
      type: PushPopType,
      pointer: Pointer,
      inExpressionEvaluation: boolean = false,
    ) {
      this.currentPointer = pointer.copy();
      this.inExpressionEvaluation = inExpressionEvaluation;
      this.temporaryScopes = [new Map()];
      this.type = type;
    }

    // Innermost (= current) scope. Kept as a getter/setter pair so the
    // existing JSON serialization code that assigns a Map directly into
    // `temporaryVariables` continues to work — it operates on the
    // outermost frame, which is always present.
    public get temporaryVariables(): Map<string, InkObject> {
      return this.temporaryScopes[this.temporaryScopes.length - 1]!;
    }
    public set temporaryVariables(value: Map<string, InkObject>) {
      // Assigning resets the scope stack to a single frame; this matches
      // the legacy "ink temp-var map" shape used by save-state restore.
      this.temporaryScopes = [value];
    }

    // Push a new innermost scope. Called by the runtime when it
    // executes a `BeginScope` control command.
    public PushScope() {
      this.temporaryScopes.push(new Map());
    }

    // Pop the innermost scope. Called by the runtime when it executes
    // an `EndScope` control command. Refuses to pop the outermost
    // (function-level) frame.
    public PopScope() {
      if (this.temporaryScopes.length > 1) {
        this.temporaryScopes.pop();
      }
    }

    public Copy() {
      let copy = new Element(
        this.type,
        this.currentPointer,
        this.inExpressionEvaluation,
      );
      copy.temporaryScopes = this.temporaryScopes.map((m) => new Map(m));
      copy.evaluationStackHeightWhenPushed =
        this.evaluationStackHeightWhenPushed;
      copy.functionStartInOutputStream = this.functionStartInOutputStream;
      copy.previousPointer = this.previousPointer.copy();
      return copy;
    }
  }

  export class Thread {
    public callstack: Element[];
    public threadIndex: number = 0;
    public previousPointer: Pointer = Pointer.Null;

    constructor();
    constructor(jThreadObj: any, storyContext: Story);
    constructor() {
      this.callstack = [];

      if (arguments[0] && arguments[1]) {
        let jThreadObj: any = arguments[0];
        let storyContext: Story = arguments[1];

        // TODO: (int) jThreadObj['threadIndex'] can raise;
        this.threadIndex = parseInt(jThreadObj["threadIndex"]);

        let jThreadCallstack = jThreadObj["callstack"];

        for (let jElTok of jThreadCallstack) {
          let jElementObj = jElTok;

          // TODO: (int) jElementObj['type'] can raise;
          let pushPopType: PushPopType = parseInt(jElementObj["type"]);

          let pointer = Pointer.Null;

          let currentContainerPathStr: string;
          // TODO: jElementObj.TryGetValue ("cPath", out currentContainerPathStrToken);
          let currentPathStrToken = jElementObj["path"];
          let currentContainerPathStrToken = jElementObj["cPath"];
          if (currentPathStrToken) {
            pointer = storyContext.PointerAtPath(new Path(currentPathStrToken));
          } else if (typeof currentContainerPathStrToken !== "undefined") {
            currentContainerPathStr = currentContainerPathStrToken.toString();

            let threadPointerResult = storyContext.ContentAtPath(
              new Path(currentContainerPathStr),
            );
            pointer.container = threadPointerResult.container;
            pointer.index = parseInt(jElementObj["idx"]);

            if (threadPointerResult.obj == null)
              throw new Error(
                "When loading state, internal story location couldn't be found: " +
                  currentContainerPathStr +
                  ". Has the story changed since this save data was created?",
              );
            else if (threadPointerResult.approximate) {
              if (pointer.container !== null) {
                storyContext.Warning(
                  "When loading state, exact internal story location couldn't be found: '" +
                    currentContainerPathStr +
                    "', so it was approximated to '" +
                    pointer.container.path.toString() +
                    "' to recover. Has the story changed since this save data was created?",
                );
              } else {
                storyContext.Warning(
                  "When loading state, exact internal story location couldn't be found: '" +
                    currentContainerPathStr +
                    "' and it may not be recoverable. Has the story changed since this save data was created?",
                );
              }
            }
          }

          let inExpressionEvaluation = !!jElementObj["exp"];

          let el = new Element(pushPopType, pointer, inExpressionEvaluation);

          // Two save-state formats: legacy `temp` is a flat object map
          // of temp-var name → value (from ink's function-scoped model);
          // new `temps` is an array of such maps representing the scope
          // stack innermost-last (sparkdown's Luau block scoping). On
          // load we detect which form is present and restore
          // accordingly. New saves always use `temps`.
          let tempsArr = jElementObj["temps"];
          if (Array.isArray(tempsArr)) {
            el.temporaryScopes = tempsArr.map((m: any) =>
              JsonSerialisation.JObjectToDictionaryRuntimeObjs(m),
            );
            if (el.temporaryScopes.length === 0) {
              el.temporaryScopes = [new Map()];
            }
          } else {
            let temps = jElementObj["temp"];
            if (typeof temps !== "undefined") {
              el.temporaryVariables =
                JsonSerialisation.JObjectToDictionaryRuntimeObjs(temps);
            } else {
              el.temporaryVariables.clear();
            }
          }

          this.callstack.push(el);
        }

        let prevContentObjPath = jThreadObj["previousContentObject"];
        if (typeof prevContentObjPath !== "undefined") {
          let prevPath = new Path(prevContentObjPath.toString());
          this.previousPointer = storyContext.PointerAtPath(prevPath);
        }
      }
    }

    public Copy() {
      let copy = new Thread();
      copy.threadIndex = this.threadIndex;
      for (let e of this.callstack) {
        copy.callstack.push(e.Copy());
      }
      copy.previousPointer = this.previousPointer.copy();
      return copy;
    }

    public WriteJson(writer: SimpleJson.Writer) {
      writer.WriteObjectStart();

      writer.WritePropertyStart("callstack");
      writer.WriteArrayStart();
      for (let el of this.callstack) {
        writer.WriteObjectStart();
        if (!el.currentPointer.isNull) {
          if (el.currentPointer.container === null) {
            return throwNullException("el.currentPointer.container");
          }
          if (el.currentPointer.pathFromEnd) {
            writer.WriteProperty(
              "path",
              el.currentPointer.pathFromEnd.componentsString,
            );
          } else {
            writer.WriteProperty(
              "cPath",
              el.currentPointer.container.path.componentsString,
            );
            if (el.currentPointer.index != null) {
              writer.WriteIntProperty("idx", el.currentPointer.index);
            }
          }
        }

        writer.WriteProperty("exp", el.inExpressionEvaluation);
        writer.WriteIntProperty("type", el.type);

        // Serialize the full scope stack (`temps`: array of maps,
        // innermost-last) so block scopes are preserved across saves —
        // a save mid-block restores with the inner scopes still active.
        // Empty outer scope with no inner scopes is omitted to keep
        // most save states compact (the reader treats omitted as
        // "single empty scope").
        const scopes = el.temporaryScopes;
        const hasAnyVars =
          scopes.length > 1 || (scopes[0] && scopes[0].size > 0);
        if (hasAnyVars) {
          writer.WritePropertyStart("temps");
          writer.WriteArrayStart();
          for (const frame of scopes) {
            JsonSerialisation.WriteDictionaryRuntimeObjs(writer, frame);
          }
          writer.WriteArrayEnd();
          writer.WritePropertyEnd();
        }

        writer.WriteObjectEnd();
      }
      writer.WriteArrayEnd();
      writer.WritePropertyEnd();

      writer.WriteIntProperty("threadIndex", this.threadIndex);

      if (!this.previousPointer.isNull) {
        let resolvedPointer = this.previousPointer.Resolve();
        if (resolvedPointer === null) {
          return throwNullException("this.previousPointer.Resolve()");
        }
        writer.WriteProperty(
          "previousContentObject",
          resolvedPointer.pathFromEnd.toString(),
        );
      }

      writer.WriteObjectEnd();
    }
  }
}
