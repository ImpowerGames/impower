import { PushPopType } from "./PushPop";
import { JsonSerialisation } from "./JsonSerialisation";
import { ListValue, VariablePointerValue } from "./Value";
import { InkObject } from "./Object";
import { Debug } from "./Debug";
import { tryGetValueFromMap } from "./TryGetResult";
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
    let cs = thread!.callstack;
    return cs[cs.length - 1];
  }

  get currentElementIndex() {
    return this.callStack.length - 1;
  }

  get currentThread(): CallStack.Thread {
    return this._threads[this._threads.length - 1]!;
  }
  set currentThread(value: CallStack.Thread) {
    Debug.Assert(
      this._threads.length == 1,
      "Shouldn't be directly setting the current thread when we have a stack of them",
    );

    // The threads being replaced end here, so their cells close with their
    // own bindings, as a popped thread's do.
    for (const thread of this._threads) {
      thread.CloseOpenUpvalues(this.cellBarrier);
    }
    this._threads.length = 0;
    this._threads.push(value);
    // The thread now stands in for the one it was copied from (a taken
    // choice), so it binds the cells its copied scopes still hold, including
    // those the thread it was copied from has since closed, and closes them
    // as that thread's scopes would have.
    for (const el of value.callstack) {
      el.AdoptBorrowedUpvalues(this.cellBarrier);
    }
  }

  get canPop() {
    return this.callStack.length > 1;
  }

  /** A call stack of one thread that stands at the start of the story,
   *  with no story to point into: the binary program's engine keeps where
   *  each frame stands itself (`ProgramStoryState`), so its frames' pointers
   *  are null (#705). */
  static ForProgram(): CallStack {
    return new CallStack(null);
  }

  constructor(storyContext: null);
  constructor(toCopy: CallStack);
  constructor() {
    if (arguments[0] === null) {
      this.Reset();
    } else {
      let toCopy = arguments[0] as CallStack;

      this._threads = [];
      for (let otherThread of toCopy._threads) {
        this._threads.push(otherThread.Copy());
      }
      this._threadCounter = toCopy._threadCounter;
    }
  }

  public Reset() {
    this._threads = [];
    this._threads.push(new CallStack.Thread());

    this._threads[0]!.callstack.push(
      new CallStack.Element(PushPopType.Tunnel),
    );
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
      // The cells the thread registered close with the thread's own
      // bindings. A pending choice's thread copied from it still holds them
      // as borrowed, and reopens them if it is taken.
      this.currentThread.CloseOpenUpvalues(this.cellBarrier);
      this._threads.splice(this._threads.indexOf(this.currentThread), 1); // should be equivalent to a pop()
    } else {
      throw new Error("Can't pop thread");
    }
  }

  get canPopThread() {
    return this._threads.length > 1 && !this.elementIsEvaluateFromGame;
  }

  get elementIsEvaluateFromGame() {
    return this.currentElement!.type == PushPopType.FunctionEvaluationFromGame;
  }

  public Push(
    type: PushPopType,
    externalEvaluationStackHeight: number = 0,
    outputStreamLengthWithPushed: number = 0,
  ) {
    let element = new CallStack.Element(type, false);

    element.evaluationStackHeightWhenPushed = externalEvaluationStackHeight;
    element.functionStartInOutputStream = outputStreamLengthWithPushed;

    this.callStack.push(element);
  }

  public CanPop(type: PushPopType | null = null) {
    if (!this.canPop) return false;

    if (type == null) return true;

    return this.currentElement!.type == type;
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
    this.callStack[this.callStack.length - 1]?.CloseOpenUpvalues(
      this.cellBarrier,
    );
    this.callStack.pop();
  }

  // Look for an existing open upvalue in the given frame matching
  // `variableName` bound in scope `scopeIndex`. Used by the auto-resolve
  // path so multiple closures capturing the same variable share a single
  // pointer (Lua semantics: when one closure writes, the others see the
  // change), while a closure over an inner `local x` that shadows a
  // captured outer `x` gets a cell of its own.
  public FindOpenUpvalue(
    contextIndex: number,
    variableName: string,
    scopeIndex: number,
  ): VariablePointerValue | null {
    const frame = this.callStack[contextIndex - 1];
    if (!frame) return null;
    for (const ptr of frame.openUpvalues) {
      if (
        !ptr.isClosed &&
        ptr.variableName === variableName &&
        frame.ScopeIndexOf(ptr) === scopeIndex
      ) {
        return ptr;
      }
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

  // `scopeIndex`, when an open cell supplies one, reads the binding in
  // that scope rather than the innermost binding of the name.
  public GetTemporaryVariableWithName(
    name: string | null,
    contextIndex: number = -1,
    scopeIndex: number = -1,
  ) {
    // contextIndex 0 means global, so index is actually 1-based
    if (contextIndex == -1) contextIndex = this.currentElementIndex + 1;

    let contextElement = this.callStack[contextIndex - 1];

    // The contextElement can be undefined when the lookup runs against
    // an empty (or freshly-popped) call stack — e.g. during an Assign
    // at top-level scope where there's no active function frame, or
    // immediately after `CallValueAsFunction` has popped the inner
    // frame and the caller's Assign asks "do I have a local with this
    // name?". Treat as "no local exists" so the Assign path falls
    // through to its `SetGlobal` branch (the Luau auto-global rule).
    if (!contextElement) return null;

    // Walk scope stack innermost → outermost. Matches Luau lexical
    // scoping: an inner `local x` shadows an outer `x` for the duration
    // of the inner block.
    const scopes = contextElement.temporaryScopes;
    if (scopeIndex >= 0 && name !== null && scopes[scopeIndex]?.has(name)) {
      return scopes[scopeIndex]!.get(name) ?? null;
    }
    for (let i = scopes.length - 1; i >= 0; i--) {
      const varValue = tryGetValueFromMap(scopes[i]!, name, null);
      if (varValue.exists) return varValue.result;
    }
    return null;
  }

  // `scopeIndex`, when an open cell supplies one, reassigns the binding in
  // that scope rather than the innermost binding of the name.
  public SetTemporaryVariable(
    name: string,
    value: any,
    declareNew: boolean,
    contextIndex: number = -1,
    scopeIndex: number = -1,
  ) {
    if (contextIndex == -1) contextIndex = this.currentElementIndex + 1;

    let contextElement = this.callStack[contextIndex - 1];
    const scopes = contextElement!.temporaryScopes;

    if (declareNew) {
      // `local x = ...` (or any `isNewTemporaryDeclaration`) — always
      // adds the binding to the innermost scope, shadowing any outer
      // `x` in the same call-stack element.
      const inner = scopes[scopes.length - 1]!;
      const oldValue = tryGetValueFromMap(inner, name, null);
      if (oldValue.exists) {
        ListValue.RetainListOriginsForAssignment(oldValue.result, value);
        // Lua timely closing across loop iterations: re-executing a
        // `local x = ...` declaration in the SAME scope frame (loop
        // bodies re-run their declarations every iteration — incl.
        // the synthesized per-iteration loop-variable copy) creates a
        // FRESH cell; the previous iteration's cell dies right here.
        // Close any open upvalue captured against the old binding
        // with its final value, so closures made in earlier
        // iterations keep that iteration's value (basic.luau's
        // "upvalues & loops (validates timely closing)" block).
        // Genuine shadowing (`local x` in an INNER scope) never hits
        // this path — the outer binding stays alive in its own frame
        // and PopScope closes it when that block exits. Only cells bound
        // in this innermost scope close: one over an outer `x` stays open.
        const innerIndex = scopes.length - 1;
        if (contextElement!.openUpvalues.length > 0) {
          const stillOpen: VariablePointerValue[] = [];
          for (const ptr of contextElement!.openUpvalues) {
            if (
              !ptr.isClosed &&
              ptr.variableName === name &&
              contextElement!.ScopeIndexOf(ptr) === innerIndex
            ) {
              this.cellBarrier?.(ptr);
              ptr.closedValue = (oldValue.result as InkObject) ?? null;
              continue;
            }
            if (!ptr.isClosed) stillOpen.push(ptr);
          }
          contextElement!.openUpvalues = stillOpen;
        }
        // A copied thread no longer binds a borrowed cell whose binding
        // this declaration replaces.
        contextElement!.ReleaseBorrowedUpvalues(
          innerIndex,
          (ptrName) => ptrName === name,
        );
      }
      inner.set(name, value);
      return;
    }

    // An open cell's write goes to the binding it captured.
    if (scopeIndex >= 0 && scopes[scopeIndex]?.has(name)) {
      const frame = scopes[scopeIndex]!;
      ListValue.RetainListOriginsForAssignment(frame.get(name) ?? null, value);
      frame.set(name, value);
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
    const scopes = this.currentElement!.temporaryScopes;
    for (let i = scopes.length - 1; i >= 0; i--) {
      if (scopes[i]!.has(name)) return this.currentElementIndex + 1;
    }
    return 0;
  }

  public ThreadWithIndex(index: number) {
    let filtered = this._threads.filter((t) => t.threadIndex == index);

    return filtered.length > 0 ? filtered[0] : null;
  }

  get callStack() {
    return this.currentThread.callstack;
  }

  public _threads!: CallStack.Thread[]; // Banged because it's initialized in Reset().
  /** Hears each upvalue cell this call stack is about to close, reopen or
   *  write, before it does (docs/engine/binary-program.md, section 7, The
   *  write barrier): the program engine's images keep a cell's state as it
   *  was before its first change. */
  public cellBarrier: ((cell: VariablePointerValue) => void) | null = null;
  public _threadCounter: number = 0;
}

export namespace CallStack {
  export class Element {
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

    // The open upvalues of the element this one was copied from. A copy
    // (a `<-` thread, or the thread a choice would continue on) holds the
    // same cells in its copied scopes but never closes them, since the
    // thread it was copied from may still bind their variables; it adopts
    // them only once it replaces that thread (`AdoptBorrowedUpvalues`).
    // A cell stays borrowed only while the copy still binds its variable:
    // it is released when the scope that binds it (`scopeIndex`) pops or
    // redeclares the variable.
    public borrowedUpvalues: VariablePointerValue[] = [];

    constructor(type: PushPopType, inExpressionEvaluation: boolean = false) {
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
    //
    // Lua closes upvalues when the BLOCK that declared the variable
    // exits, not only at function return. Any open upvalue whose
    // variable is bound in the scope being popped closes here with
    // that binding's live value — `do local a = 1 f = function()
    // return a end end` must let the escaped closure read 1 after the
    // do-block ends. Without this, the pointer survived to the frame
    // pop, by which time the binding was gone, and closed as a
    // dangling null. Upvalues bound in OUTER scopes of this frame stay
    // open (their binding is still alive), even when the popped scope
    // held a same-named `local` that shadowed them.
    public PopScope(
      barrier: ((cell: VariablePointerValue) => void) | null = null,
    ) {
      if (this.temporaryScopes.length > 1) {
        const poppingIndex = this.temporaryScopes.length - 1;
        const popping = this.temporaryScopes[poppingIndex]!;
        if (this.openUpvalues.length > 0) {
          const stillOpen: VariablePointerValue[] = [];
          for (const ptr of this.openUpvalues) {
            if (!ptr.isClosed && this.ScopeIndexOf(ptr) === poppingIndex) {
              barrier?.(ptr);
              ptr.closedValue = popping.get(ptr.variableName) ?? null;
              continue;
            }
            if (!ptr.isClosed) stillOpen.push(ptr);
          }
          this.openUpvalues = stillOpen;
        }
        this.ReleaseBorrowedUpvalues(poppingIndex, () => true);
        this.temporaryScopes.pop();
      }
    }

    // Innermost scope binding `name`, or -1.
    public ScopeIndexBinding(name: string) {
      for (let i = this.temporaryScopes.length - 1; i >= 0; i--) {
        if (this.temporaryScopes[i]!.has(name)) return i;
      }
      return -1;
    }

    // The scope holding the binding `ptr` captured here: its recorded
    // scope while that still binds the name, otherwise (a cell loaded from
    // a save written before scopes were recorded) the innermost binding.
    public ScopeIndexOf(ptr: VariablePointerValue) {
      if (this.temporaryScopes[ptr.scopeIndex]?.has(ptr.variableName)) {
        return ptr.scopeIndex;
      }
      return this.ScopeIndexBinding(ptr.variableName);
    }

    // Close every open cell registered with this element with the value of
    // its binding here. A cell whose binding can't be found (shouldn't
    // happen if it was registered correctly) closes holding null, so reads
    // return null rather than chasing a dangling contextIndex.
    public CloseOpenUpvalues(
      barrier: ((cell: VariablePointerValue) => void) | null = null,
    ) {
      for (const ptr of this.openUpvalues) {
        if (ptr.isClosed) continue;
        const scope = this.ScopeIndexOf(ptr);
        barrier?.(ptr);
        ptr.closedValue =
          scope >= 0
            ? (this.temporaryScopes[scope]!.get(ptr.variableName) ?? null)
            : null;
      }
      // Drop the references so the frame element can be GC'd cleanly.
      this.openUpvalues = [];
    }

    // Forget the borrowed cells bound in scope `scopeIndex` whose variable
    // `released` names: this element no longer binds them.
    public ReleaseBorrowedUpvalues(
      scopeIndex: number,
      released: (name: string) => boolean,
    ) {
      if (this.borrowedUpvalues.length === 0) return;
      this.borrowedUpvalues = this.borrowedUpvalues.filter(
        (ptr) =>
          !(ptr.scopeIndex === scopeIndex && released(ptr.variableName)),
      );
    }

    // Record `ptr` as borrowed. A cell without a recorded scope takes the
    // one it resolves to here, so later scope changes in the copy can't
    // move it.
    public BorrowUpvalue(ptr: VariablePointerValue, from: Element) {
      if (ptr.scopeIndex < 0) ptr.scopeIndex = from.ScopeIndexOf(ptr);
      if (ptr.scopeIndex < 0) return;
      this.borrowedUpvalues.push(ptr);
    }

    public Copy() {
      let copy = new Element(this.type, this.inExpressionEvaluation);
      copy.temporaryScopes = this.temporaryScopes.map((m) => new Map(m));
      copy.evaluationStackHeightWhenPushed =
        this.evaluationStackHeightWhenPushed;
      copy.functionStartInOutputStream = this.functionStartInOutputStream;
      for (const ptr of this.openUpvalues) {
        if (!ptr.isClosed) copy.BorrowUpvalue(ptr, this);
      }
      copy.borrowedUpvalues.push(...this.borrowedUpvalues);
      return copy;
    }

    // Take over the borrowed cells, as the element this one was copied from
    // would have. A cell the thread copied from has closed since the copy
    // (its block ended, or the thread ended) still names a variable this
    // copy binds, so it reopens and reads this copy's binding.
    public AdoptBorrowedUpvalues(
      barrier: ((cell: VariablePointerValue) => void) | null = null,
    ) {
      for (const ptr of this.borrowedUpvalues) {
        if (ptr.isClosed) {
          barrier?.(ptr);
          ptr.Reopen();
        }
        if (!this.openUpvalues.includes(ptr)) {
          this.openUpvalues.push(ptr);
        }
      }
      this.borrowedUpvalues = [];
    }
  }

  export class Thread {
    public callstack: Element[];
    public threadIndex: number = 0;

    constructor() {
      this.callstack = [];
    }

    // Writes the cells still open, if any, under `property`.
    public static WriteUpvalueCells(
      writer: SimpleJson.Writer,
      property: string,
      cells: VariablePointerValue[],
    ) {
      const open = cells.filter((ptr) => !ptr.isClosed);
      if (open.length === 0) return;
      writer.WritePropertyStart(property);
      JsonSerialisation.WriteListRuntimeObjs(writer, open);
      writer.WritePropertyEnd();
    }

    public static ReadUpvalueCells(jCells: unknown): VariablePointerValue[] {
      if (!Array.isArray(jCells)) return [];
      return JsonSerialisation.JArrayToRuntimeObjList(jCells).filter(
        (cell): cell is VariablePointerValue =>
          cell instanceof VariablePointerValue,
      );
    }

    // Close the cells registered with this thread's elements, when the
    // thread ends.
    public CloseOpenUpvalues(
      barrier: ((cell: VariablePointerValue) => void) | null = null,
    ) {
      for (const el of this.callstack) {
        el.CloseOpenUpvalues(barrier);
      }
    }

    public Copy() {
      let copy = new Thread();
      copy.threadIndex = this.threadIndex;
      for (let e of this.callstack) {
        copy.callstack.push(e.Copy());
      }
      return copy;
    }

  }
}
