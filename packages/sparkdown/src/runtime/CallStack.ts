import { PushPopType } from "./PushPop";
import { JsonSerialisation } from "./JsonSerialisation";
import { VariablePointerValue } from "./Value";
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

    for (const thread of this._threads) {
      thread.CloseOpenUpvalues(this.cellBarrier);
    }
    this._threads.length = 0;
    this._threads.push(value);
    for (const el of value.callstack) {
      el.AdoptBorrowedUpvalues(this.cellBarrier);
    }
  }

  get canPop() {
    return this.callStack.length > 1;
  }

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
      this.currentThread.CloseOpenUpvalues(this.cellBarrier);
      this._threads.splice(this._threads.indexOf(this.currentThread), 1);
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
    this.callStack[this.callStack.length - 1]?.CloseOpenUpvalues(
      this.cellBarrier,
    );
    this.callStack.pop();
  }

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
    scopeIndex: number = -1,
  ) {
    if (contextIndex == -1) contextIndex = this.currentElementIndex + 1;

    let contextElement = this.callStack[contextIndex - 1];

    if (!contextElement) return null;

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

  public SetTemporaryVariable(
    name: string,
    value: any,
    declareNew: boolean,
    contextIndex: number = -1,
    scopeIndex: number = -1,
  ): Map<string, InkObject> {
    if (contextIndex == -1) contextIndex = this.currentElementIndex + 1;

    let contextElement = this.callStack[contextIndex - 1];
    const scopes = contextElement!.temporaryScopes;

    if (declareNew) {
      const inner = scopes[scopes.length - 1]!;
      const oldValue = tryGetValueFromMap(inner, name, null);
      if (oldValue.exists) {
        contextElement!.RetireBindings(
          scopes.length - 1,
          (ptrName) => ptrName === name,
          this.cellBarrier,
        );
      }
      inner.set(name, value);
      return inner;
    }

    const frame = this.TemporaryScopeOf(name, contextIndex, scopeIndex);
    if (frame === null) {
      throw new Error("Could not find temporary variable to set: " + name);
    }
    frame.set(name, value);
    return frame;
  }

  public TemporaryScopeOf(
    name: string,
    contextIndex: number = -1,
    scopeIndex: number = -1,
  ): Map<string, InkObject> | null {
    if (contextIndex == -1) contextIndex = this.currentElementIndex + 1;
    const scopes = this.callStack[contextIndex - 1]?.temporaryScopes;
    if (!scopes) return null;
    if (scopeIndex >= 0 && scopes[scopeIndex]?.has(name)) {
      return scopes[scopeIndex]!;
    }
    for (let i = scopes.length - 1; i >= 0; i--) {
      if (scopes[i]!.has(name)) return scopes[i]!;
    }
    return null;
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

  public _threads!: CallStack.Thread[];
  public cellBarrier: ((cell: VariablePointerValue) => void) | null = null;
  public _threadCounter: number = 0;
}

export namespace CallStack {
  export class Element {
    public inExpressionEvaluation: boolean;
    public temporaryScopes: Array<Map<string, InkObject>>;
    public type: PushPopType;

    public evaluationStackHeightWhenPushed: number = 0;
    public functionStartInOutputStream: number = 0;

    public openUpvalues: VariablePointerValue[] = [];

    public borrowedUpvalues: VariablePointerValue[] = [];

    constructor(type: PushPopType, inExpressionEvaluation: boolean = false) {
      this.inExpressionEvaluation = inExpressionEvaluation;
      this.temporaryScopes = [new Map()];
      this.type = type;
    }

    public get temporaryVariables(): Map<string, InkObject> {
      return this.temporaryScopes[this.temporaryScopes.length - 1]!;
    }
    public set temporaryVariables(value: Map<string, InkObject>) {
      this.temporaryScopes = [value];
    }

    public PushScope() {
      this.temporaryScopes.push(new Map());
    }

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

    public ScopeIndexBinding(name: string) {
      for (let i = this.temporaryScopes.length - 1; i >= 0; i--) {
        if (this.temporaryScopes[i]!.has(name)) return i;
      }
      return -1;
    }

    public ScopeIndexOf(ptr: VariablePointerValue) {
      if (this.temporaryScopes[ptr.scopeIndex]?.has(ptr.variableName)) {
        return ptr.scopeIndex;
      }
      return this.ScopeIndexBinding(ptr.variableName);
    }

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
      this.openUpvalues = [];
    }

    public RetireBindings(
      scopeIndex: number,
      retired: (name: string) => boolean,
      barrier: ((cell: VariablePointerValue) => void) | null = null,
    ) {
      if (this.openUpvalues.length > 0) {
        const scope = this.temporaryScopes[scopeIndex];
        const stillOpen: VariablePointerValue[] = [];
        for (const ptr of this.openUpvalues) {
          if (
            !ptr.isClosed &&
            retired(ptr.variableName) &&
            this.ScopeIndexOf(ptr) === scopeIndex
          ) {
            barrier?.(ptr);
            ptr.closedValue = scope?.get(ptr.variableName) ?? null;
            continue;
          }
          if (!ptr.isClosed) stillOpen.push(ptr);
        }
        this.openUpvalues = stillOpen;
      }
      this.ReleaseBorrowedUpvalues(scopeIndex, retired);
    }

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
