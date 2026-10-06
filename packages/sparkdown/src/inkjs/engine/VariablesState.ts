import {
  AbstractValue,
  Value,
  VariablePointerValue,
  ListValue,
  IntValue,
  FloatValue,
  BoolValue,
  ObjectValue,
} from "./Value";
import { VariableAssignment } from "./VariableAssignment";
import { InkObject } from "./Object";
import { ListDefinitionsOrigin } from "./ListDefinitionsOrigin";
import { StoryException } from "./StoryException";
import { JsonSerialisation } from "./JsonSerialisation";
import { asOrThrows, asOrNull, isEquatable } from "./TypeAssertion";
import { tryGetValueFromMap } from "./TryGetResult";
import { throwNullException } from "./NullException";
import { CallStack } from "./CallStack";
import { SimpleJson } from "./SimpleJson";
import { InkList } from "./Story";
import { Path } from "./Path";

// Fake class wrapper around VariableState to have correct typing
// when using the Proxy syntax in typescript
function VariablesStateAccessor<T>(): new () => Pick<T, keyof T> {
  return class {} as any;
}

type VariableStateValue = boolean | string | number | InkList | Path | null;

/** What the program engine's images hear of the keyed state before it is
 *  written (docs/engine/binary-program.md, section 7, The write barrier): a
 *  table about to be written, a table a call may write (`prepare`, which
 *  keeps its content without marking it), and a global assigned. */
export interface ImageBarrier {
  table(table: ObjectValue): void;
  prepare(table: ObjectValue): void;
  global(name: string): void;
}

export class VariablesState extends VariablesStateAccessor<
  Record<string, any>
>() {
  // The way variableChangedEvent is a bit different than the reference implementation.
  // Originally it uses the C# += operator to add delegates, but in js we need to maintain
  // an actual collection of delegates (ie. callbacks) to register a new one, there is a
  // special ObserveVariableChange method below.
  public variableChangedEventCallbacks: Array<
    (variableName: string, newValue: InkObject) => void
  > = [];
  public variableChangedEvent(variableName: string, newValue: InkObject): void {
    for (let callback of this.variableChangedEventCallbacks) {
      callback(variableName, newValue);
    }
  }

  public StartVariableObservation() {
    this._batchObservingVariableChanges = true;
    this._changedVariablesForBatchObs = new Set();
  }

  public CompleteVariableObservation() {
    this._batchObservingVariableChanges = false;
    if (this._changedVariablesForBatchObs != null) {
      for (let variableName of this._changedVariablesForBatchObs) {
        let currentValue = this._globalVariables.get(variableName) as InkObject;
        this.variableChangedEvent(variableName, currentValue);
      }
    }
    this._changedVariablesForBatchObs = null;
  }

  get callStack() {
    return this._callStack;
  }
  set callStack(callStack) {
    this._callStack = callStack;
  }

  // the original code uses a magic getter and setter for global variables,
  // allowing things like variableState['varname]. This is not quite possible
  // in js without a Proxy, so it is replaced with this $ function.
  public $(variableName: string): VariableStateValue;
  public $(variableName: string, value: VariableStateValue): void;
  public $(variableName: string, value?: any) {
    if (typeof value === "undefined") {
      let varContents = this._globalVariables.get(variableName);

      if (typeof varContents === "undefined") {
        varContents = this._defaultGlobalVariables.get(variableName);
      }

      if (typeof varContents !== "undefined")
        return (varContents as AbstractValue).valueObject;
      else return null;
    } else {
      if (typeof this._defaultGlobalVariables.get(variableName) === "undefined")
        throw new StoryException(
          "Cannot assign to a variable (" +
            variableName +
            ") that hasn't been declared in the story",
        );

      let val = Value.Create(value);
      if (val == null) {
        if (value == null) {
          throw new Error("Cannot pass null to VariableState");
        } else {
          throw new Error(
            "Invalid value passed to VariableState: " + value.toString(),
          );
        }
      }

      this.SetGlobal(variableName, val);
    }
  }

  constructor(
    callStack: CallStack,
    listDefsOrigin: ListDefinitionsOrigin | null,
  ) {
    super();
    this._globalVariables = new Map();
    this._callStack = callStack;
    this._listDefsOrigin = listDefsOrigin;

    // if es6 proxies are available, use them.
    try {
      // the proxy is used to allow direct manipulation of global variables.
      // It first tries to access the objects own property, and if none is
      // found it delegates the call to the $ method, defined below
      let p = new Proxy(this, {
        get(target: any, name) {
          return name in target ? target[name] : target.$(name);
        },
        set(target: any, name, value) {
          if (name in target) target[name] = value;
          else target.$(name, value);
          return true; // returning a falsy value make the trap fail
        },
        ownKeys(target: any) {
          return [
            ...new Set([
              ...target._defaultGlobalVariables.keys(),
              ...target._globalVariables.keys(),
            ]),
          ];
        },
        getOwnPropertyDescriptor(target, name) {
          // called for every property
          return {
            enumerable: true,
            configurable: true,
            value: target.$(name),
          };
        },
      });

      return p;
    } catch (e) {
      // the proxy object is not available in this context. we should warn the
      // dev but writing to the console feels a bit intrusive.
      // console.log("ES6 Proxy not available - direct manipulation of global variables can't work, use $() instead.");
    }
  }

  /**
   * Names declared with `const`, published by `Story.ResetGlobals`.
   *
   * A constant IS a real global — it initializes from the `global decl`
   * container and is therefore visible to anything inspecting runtime state
   * (notably the debug adapter). But its value is fully determined by the
   * compiled program, so it must never round-trip through a save: it is
   * neither written by `WriteJson` nor restored by `SetJsonToken`. Without
   * that, a save written when the name was still a mutable `store` would
   * overwrite the compiled constant on load and pin it forever.
   */
  public constantNames: Set<string> = new Set<string>();

  public SetJsonToken(jToken: Record<string, any>) {
    this._globalVariables.clear();

    for (let [varValKey, varValValue] of this._defaultGlobalVariables) {
      // Always take the compiled value for a constant, never the saved one.
      if (this.constantNames.has(varValKey)) {
        this._globalVariables.set(varValKey, varValValue);
        continue;
      }
      let loadedToken = jToken[varValKey];
      if (typeof loadedToken !== "undefined") {
        let tokenInkObject =
          JsonSerialisation.JTokenToRuntimeObject(loadedToken);
        if (tokenInkObject === null) {
          return throwNullException("tokenInkObject");
        }
        // Named define (store-keyed save): the token holds only the
        // `store` delta. MERGE it onto the init-reconstructed default —
        // which already carries the definition's own non-store props,
        // methods, metatable, and identity (so `companion.O === O` etc.
        // still hold) — instead of replacing it with a partial table.
        const defSelf = (tokenInkObject as any).__loadDefSelf;
        if (
          defSelf != null &&
          tokenInkObject instanceof ObjectValue &&
          varValValue instanceof ObjectValue
        ) {
          const target = varValValue.value as Map<string, AbstractValue>;
          for (const [k, v] of tokenInkObject.value as Map<
            string,
            AbstractValue
          >) {
            target.set(k, v);
          }
          this._globalVariables.set(varValKey, varValValue);
        } else {
          this._globalVariables.set(varValKey, tokenInkObject);
        }
      } else {
        this._globalVariables.set(varValKey, varValValue);
      }
    }

    // DYNAMIC globals — Lua-style assignments to undeclared names
    // (`t = {}` inside a function creates a global). They serialize
    // through WriteJson like any other global, but the defaults-
    // driven loop above never visits them, so without this pass
    // they'd silently vanish on load.
    for (const key of Object.keys(jToken)) {
      if (this._defaultGlobalVariables.has(key)) continue;
      // A stale save may carry a key that has since become a constant.
      if (this.constantNames.has(key)) continue;
      const tokenInkObject = JsonSerialisation.JTokenToRuntimeObject(
        jToken[key],
      );
      if (tokenInkObject != null) {
        this._globalVariables.set(key, tokenInkObject);
      }
    }
  }

  public static dontSaveDefaultValues: boolean = true;

  public WriteJson(writer: SimpleJson.Writer) {
    writer.WriteObjectStart();
    for (let [keyValKey, keyValValue] of this._globalVariables) {
      let name = keyValKey;
      let val = keyValValue;

      // Constants are reconstructed from the bytecode on every run, so they
      // are never persisted — see `constantNames`.
      if (this.constantNames.has(name)) {
        continue;
      }

      // Store-keyed rule for define tables: persistence follows the
      // `store` marker, NOT value-equality. A define with no store state
      // is fully reconstructed by init — never written. One WITH store
      // props always writes its (compact) store delta, because the
      // default shares the same table reference and so can't reveal an
      // in-place store mutation via RuntimeObjectsEqual.
      const defInfo =
        val instanceof ObjectValue
          ? JsonSerialisation.defineSerializationInfo(val)
          : null;
      // Any other table or function global is written even while it holds
      // its default object: a field set or a captured variable changed in
      // place leaves the object the same, and a saved local or closure may
      // share the object, which a load reproduces only from the save.
      if (defInfo) {
        if (defInfo.storeNames.size === 0) continue;
      } else if (
        VariablesState.dontSaveDefaultValues &&
        !(val instanceof ObjectValue)
      ) {
        if (this._defaultGlobalVariables.has(name)) {
          let defaultVal = this._defaultGlobalVariables.get(name)!;
          if (this.RuntimeObjectsEqual(val, defaultVal)) continue;
        }
      }

      writer.WritePropertyStart(name);
      JsonSerialisation.WriteRuntimeObject(writer, val);
      writer.WritePropertyEnd();
    }
    writer.WriteObjectEnd();
  }

  public RuntimeObjectsEqual(
    obj1: InkObject | null,
    obj2: InkObject | null,
  ): boolean {
    if (obj1 === null) {
      return throwNullException("obj1");
    }
    if (obj2 === null) {
      return throwNullException("obj2");
    }

    if (obj1.constructor !== obj2.constructor) return false;

    let boolVal = asOrNull(obj1, BoolValue);
    if (boolVal !== null) {
      return boolVal.value === asOrThrows(obj2, BoolValue).value;
    }

    let intVal = asOrNull(obj1, IntValue);
    if (intVal !== null) {
      return intVal.value === asOrThrows(obj2, IntValue).value;
    }

    let floatVal = asOrNull(obj1, FloatValue);
    if (floatVal !== null) {
      return floatVal.value === asOrThrows(obj2, FloatValue).value;
    }

    let val1 = asOrNull(obj1, Value);
    let val2 = asOrNull(obj2, Value);
    if (val1 !== null && val2 !== null) {
      if (isEquatable(val1.valueObject) && isEquatable(val2.valueObject)) {
        return val1.valueObject.Equals(val2.valueObject);
      } else {
        return val1.valueObject === val2.valueObject;
      }
    }

    throw new Error(
      "FastRoughDefinitelyEquals: Unsupported runtime object type: " +
        obj1.constructor.name,
    );
  }

  public GetVariableWithName(
    name: string | null,
    contextIndex: number = -1,
    scopeIndex: number = -1,
  ): InkObject | null {
    let varValue = this.GetRawVariableWithName(name, contextIndex, scopeIndex);

    // var varPointer = varValue as VariablePointerValue;
    let varPointer = asOrNull(varValue, VariablePointerValue);
    if (varPointer !== null) {
      varValue = this.ValueAtVariablePointer(varPointer);
    }

    return varValue;
  }

  public TryGetDefaultVariableValue(name: string | null): InkObject | null {
    let val = tryGetValueFromMap(this._defaultGlobalVariables, name, null);
    return val.exists ? val.result : null;
  }

  // Global-only lookup, used by the `_G` globals-table proxy. Unlike
  // `GetVariableWithName` (which checks call-stack temporaries first
  // because locals shadow globals), reads through `_G` must see THE
  // GLOBAL binding even when a same-named local is in scope —
  // `local x = 1  _G.x` reads the global x (or nil), never the local.
  public GetGlobalVariableValue(name: string): InkObject | null {
    const current = tryGetValueFromMap(this._globalVariables, name, null);
    if (current.exists) return current.result;
    if (this._defaultGlobalVariables !== null) {
      const dflt = tryGetValueFromMap(this._defaultGlobalVariables, name, null);
      if (dflt.exists) return dflt.result;
    }
    return null;
  }

  public GlobalVariableExistsWithName(name: string) {
    return (
      this._globalVariables.has(name) ||
      (this._defaultGlobalVariables !== null &&
        this._defaultGlobalVariables.has(name))
    );
  }

  // `scopeIndex`, from an open upvalue cell, picks the block scope whose
  // binding the cell captured.
  public GetRawVariableWithName(
    name: string | null,
    contextIndex: number,
    scopeIndex: number = -1,
  ) {
    let varValue: InkObject | null = null;

    // Luau-superset semantics: locals shadow globals. Check the
    // call-stack temporaries FIRST, then fall back to globals / list
    // items if nothing's in scope. Ink's original order was
    // globals-first (because ink temps were rare `~temp` declarations
    // scoped to knots, never overlapping with global names), but
    // sparkdown's `local x = …` is the common case and must shadow
    // any same-named global. See `do local g = … end` patterns in
    // calls.luau (line 22–31) which previously read the OUTER global
    // `g = false` from inside the do-block.
    varValue = this._callStack.GetTemporaryVariableWithName(
      name,
      contextIndex,
      scopeIndex,
    );
    if (varValue != null) return varValue;

    if (contextIndex == 0 || contextIndex == -1) {
      let variableValue = tryGetValueFromMap(this._globalVariables, name, null);
      if (variableValue.exists) return variableValue.result;

      if (this._defaultGlobalVariables !== null) {
        variableValue = tryGetValueFromMap(
          this._defaultGlobalVariables,
          name,
          null,
        );
        if (variableValue.exists) return variableValue.result;
      }

      if (this._listDefsOrigin === null)
        return throwNullException("VariablesState._listDefsOrigin");
      let listItemValue = this._listDefsOrigin.FindSingleItemListWithName(name);
      if (listItemValue) return listItemValue;
    }

    return null;
  }

  public ValueAtVariablePointer(pointer: VariablePointerValue) {
    // Closed upvalue: the parent frame has been popped and the value
    // was snapshotted into the pointer at pop time. Read directly from
    // the closed cell, no call-stack lookup needed.
    if (pointer.isClosed) {
      return pointer.closedValue;
    }
    return this.GetVariableWithName(
      pointer.variableName,
      pointer.contextIndex,
      pointer.scopeIndex,
    );
  }

  public Assign(varAss: VariableAssignment, value: InkObject) {
    let name = varAss.variableName;
    if (name === null) {
      return throwNullException("name");
    }
    let contextIndex = -1;
    // The block scope an open upvalue cell captured, once the write is
    // redirected through one.
    let scopeIndex = -1;

    let setGlobal = false;
    if (varAss.isNewDeclaration) {
      setGlobal = varAss.isGlobal;
    } else {
      // Luau-superset semantics: a temp variable shadows any
      // same-named global for both READ and WRITE. Without this
      // check, `g = false; do local g = nil; g = closure end` writes
      // the closure to the GLOBAL `g` (because the global exists)
      // instead of updating the local TEMP — breaking `local
      // function g(...)` self-recursive declarations whose two-step
      // (declareNil + assignClosure) lowering relies on the closure
      // landing in the temp slot. Only fall back to the global path
      // when no temp with this name is in scope.
      const tempExists =
        this._callStack.GetTemporaryVariableWithName(name, contextIndex) !==
        null;
      setGlobal = !tempExists && this.GlobalVariableExistsWithName(name);
    }

    if (varAss.isNewDeclaration) {
      // var varPointer = value as VariablePointerValue;
      let varPointer = asOrNull(value, VariablePointerValue);
      if (varPointer !== null) {
        let fullyResolvedVariablePointer =
          this.ResolveVariablePointer(varPointer);
        value = fullyResolvedVariablePointer;
      }
    } else {
      let existingPointer = null;
      do {
        // existingPointer = GetRawVariableWithName (name, contextIndex) as VariablePointerValue;
        existingPointer = asOrNull(
          this.GetRawVariableWithName(name, contextIndex, scopeIndex),
          VariablePointerValue,
        );
        if (existingPointer != null) {
          // Closed upvalue: write directly to the snapshotted cell.
          // The parent frame is gone; there's no slot to redirect to.
          // Mutating the pointer's `closedValue` lets all closures
          // sharing this pointer see the updated value.
          if (existingPointer.isClosed) {
            this.CellWriteBarrier(existingPointer);
            existingPointer.closedValue = value;
            return;
          }
          name = existingPointer.variableName;
          contextIndex = existingPointer.contextIndex;
          scopeIndex = existingPointer.scopeIndex;
          setGlobal = contextIndex == 0;
        }
      } while (existingPointer != null);
    }

    if (setGlobal) {
      this.SetGlobal(name, value);
      return;
    }
    // Luau's auto-global semantics: `x = 1` (without `local` /
    // `store`) writes to a global if `x` isn't a known local in
    // scope. We honour this only for *reassignment* shapes
    // (isNewDeclaration=false) — explicit `local x = 1` declarations
    // still create temps as before. If no local with this name
    // exists in any scope of the current call-stack element, treat
    // the bare assignment as a new-global creation.
    if (
      !varAss.isNewDeclaration &&
      this._callStack.GetTemporaryVariableWithName(
        name,
        contextIndex,
        scopeIndex,
      ) === null
    ) {
      this.SetGlobal(name, value);
      return;
    }
    this._callStack.SetTemporaryVariable(
      name,
      value,
      varAss.isNewDeclaration,
      contextIndex,
      scopeIndex,
    );
  }

  /** The globals as they stand, by name, which an image copies
   *  (`ProgramImages`). Read only. */
  public get globalEntries(): ReadonlyMap<string, InkObject> {
    return this._globalVariables;
  }

  /** Puts `globals` in place of the globals, as an image restored in place
   *  holds them, with no change event and no barrier. */
  public RestoreGlobals(globals: ReadonlyMap<string, InkObject>) {
    this._globalVariables.clear();
    for (const [name, value] of globals) {
      this._globalVariables.set(name, value);
    }
  }

  /** Puts `value` in place of global `name`, or removes the global for
   *  nothing, as an image restored in place holds it, with no change event
   *  and no barrier. */
  public RestoreGlobal(name: string, value: InkObject | undefined) {
    if (value === undefined) {
      this._globalVariables.delete(name);
    } else {
      this._globalVariables.set(name, value);
    }
  }

  /** The compiled value of each constant, which a restore into another
   *  program's engine keeps (`SetJsonToken`). */
  public DefaultGlobal(name: string): InkObject | undefined {
    return this._defaultGlobalVariables.get(name);
  }

  public SnapshotDefaultGlobals() {
    this._defaultGlobalVariables = new Map(this._globalVariables);
    this.SnapshotInitTables();
  }

  // Records the graph of tables init built, as it stands when the defaults
  // are set: each default global's table, and every edge from a table to
  // another one. An edge is a key (`".key"`), a metatable (`"@mt"`), or a
  // closed upvalue's table (`"@cv.key"`); a key segment always starts with
  // `.` and a synthetic one with `@`, so no key can be taken for one. A
  // table's anchor is a JSON array of its global's name and the segments
  // to it, the shortest and earliest path found. Taken once, so anchors
  // name the tables init built even after the story has changed or
  // reassigned them. A table any constant reaches keeps its compiled
  // contents, whichever other globals reach it too.
  private SnapshotInitTables() {
    this._initTablePaths = new Map();
    this._initRoots = new Map();
    this._initEdges = new Map();
    this._initCellEdges = new Map();
    this._initCellPaths = new Map();
    this._constantInitTables = new Set();
    const queue: { table: ObjectValue; path: string[] }[] = [];
    for (const [name, value] of this._defaultGlobalVariables) {
      if (value instanceof ObjectValue && value.value !== null) {
        this._initRoots.set(name, value);
        queue.push({ table: value, path: [name] });
      }
    }
    for (let i = 0; i < queue.length; i++) {
      const { table, path } = queue[i]!;
      const map = table.value!;
      if (this._initTablePaths.has(map)) continue;
      this._initTablePaths.set(map, JSON.stringify(path));
      const edges = new Map<string, ObjectValue>();
      this._initEdges.set(map, edges);
      const follow = (segment: string, child: ObjectValue) => {
        if (child.value === null) return;
        edges.set(segment, child);
        queue.push({ table: child, path: [...path, segment] });
      };
      for (const [key, entry] of map as Map<string, InkObject>) {
        if (entry instanceof ObjectValue) {
          follow("." + key, entry);
        } else if (entry instanceof VariablePointerValue && entry.isClosed) {
          // A closed upvalue cell a closure init built holds: other
          // closures init built can share it, so it is anchored like a
          // table, by the path of the closure holding it.
          let cells = this._initCellEdges.get(map);
          if (!cells) {
            cells = new Map();
            this._initCellEdges.set(map, cells);
          }
          cells.set(key, entry);
          if (!this._initCellPaths.has(entry)) {
            this._initCellPaths.set(
              entry,
              JSON.stringify([...path, "@cell." + key]),
            );
          }
          if (entry.closedValue instanceof ObjectValue) {
            follow("@cv." + key, entry.closedValue);
          }
        }
      }
      if (table.metatable) follow("@mt", table.metatable);
    }
    const constants: ObjectValue[] = [];
    for (const [name, table] of this._initRoots) {
      if (this.constantNames.has(name)) constants.push(table);
    }
    for (let i = 0; i < constants.length; i++) {
      const map = constants[i]!.value!;
      if (this._constantInitTables.has(map)) continue;
      this._constantInitTables.add(map);
      for (const child of this._initEdges.get(map)?.values() ?? []) {
        constants.push(child);
      }
    }
  }

  // Each table init built, by its underlying Map, to its anchor: the
  // anchors a save writes (`JsonSerialisation.SetWriterAnchors`).
  public InitTableAnchors(): Map<object, string> {
    return this._initTablePaths;
  }

  // The table init built at an anchor's path in this story, following the
  // path through the recorded init graph, so any path that exists here
  // resolves, not only the one this story would write. Also whether a load
  // may restore saved contents into it: a table a constant reaches is
  // determined by the compiled program, so a load only joins references to
  // it.
  public InitTableAtAnchor(
    anchor: string,
  ): { table: ObjectValue; restore: boolean } | null {
    const path = VariablesState.ParseAnchor(anchor);
    const table = path ? this.InitTableAtPath(path) : null;
    if (!table) return null;
    return {
      table,
      restore: !this._constantInitTables.has(table.value!),
    };
  }

  // Each closed upvalue cell init built to its anchor: the path of a
  // closure holding it followed by `"@cell." + key`.
  public InitCellAnchors(): Map<VariablePointerValue, string> {
    return this._initCellPaths;
  }

  // The cell init built at an anchor's path in this story, and whether a
  // load may restore a saved value into it (not when a constant reaches the
  // closure holding it).
  public InitCellAtAnchor(
    anchor: string,
  ): { cell: VariablePointerValue; restore: boolean } | null {
    const path = VariablesState.ParseAnchor(anchor);
    const last = path?.[path.length - 1];
    if (!path || path.length < 2 || !last?.startsWith("@cell.")) return null;
    const table = this.InitTableAtPath(path.slice(0, -1));
    const cell = table
      ? this._initCellEdges.get(table.value!)?.get(last.slice("@cell.".length))
      : undefined;
    if (!cell) return null;
    return {
      cell,
      restore: !this._constantInitTables.has(table!.value!),
    };
  }

  private static ParseAnchor(anchor: string): string[] | null {
    let path: unknown;
    try {
      path = JSON.parse(anchor);
    } catch {
      return null;
    }
    if (!Array.isArray(path) || path.length === 0) return null;
    return path.every((segment) => typeof segment === "string")
      ? (path as string[])
      : null;
  }

  // Follows a path from a default global's init table through the
  // recorded edges.
  private InitTableAtPath(path: string[]): ObjectValue | null {
    let table = this._initRoots.get(path[0]!) ?? null;
    for (let i = 1; table && i < path.length; i++) {
      table = this._initEdges.get(table.value!)?.get(path[i]!) ?? null;
    }
    return table;
  }

  public RetainListOriginsForAssignment(
    oldValue: InkObject,
    newValue: InkObject,
  ) {
    let oldList = asOrThrows(oldValue, ListValue);
    let newList = asOrThrows(newValue, ListValue);

    if (oldList.value && newList.value && newList.value.Count == 0) {
      newList.value.SetInitialOriginNames(oldList.value.originNames);
    }
  }

  public SetGlobal(variableName: string | null, value: InkObject) {
    let oldValue = tryGetValueFromMap(
      this._globalVariables,
      variableName,
      null,
    );

    ListValue.RetainListOriginsForAssignment(oldValue.result!, value);

    if (variableName === null) {
      return throwNullException("variableName");
    }

    this._globalVariables.set(variableName, value);
    this.imageBarrier?.global(variableName);

    // Reactive dep tracking: a global write is a coarse-grained change keyed by
    // name (a binding that read this global re-runs). Cheap no-op when disabled.
    this.recordReactiveGlobalChange(variableName);

    // TODO: Not sure !== is equivalent to !value.Equals(oldValue)
    if (
      this.variableChangedEvent !== null &&
      oldValue !== null &&
      value !== oldValue.result
    ) {
      if (this._batchObservingVariableChanges) {
        if (this._changedVariablesForBatchObs === null) {
          return throwNullException("this._changedVariablesForBatchObs");
        }

        this._changedVariablesForBatchObs.add(variableName);
      } else {
        this.variableChangedEvent(variableName, value);
      }
    }
  }

  public ResolveVariablePointer(varPointer: VariablePointerValue) {
    // Already-closed pointer: it's heap-resident, no frame lookup
    // needed and no further canonicalization possible. Return as-is
    // so all references continue to share the same closed cell.
    if (varPointer.isClosed) {
      return varPointer;
    }
    let contextIndex = varPointer.contextIndex;

    if (contextIndex == -1)
      contextIndex = this.GetContextIndexOfVariableNamed(
        varPointer.variableName,
      );

    let valueOfVariablePointedTo = this.GetRawVariableWithName(
      varPointer.variableName,
      contextIndex,
    );

    // var doubleRedirectionPointer = valueOfVariablePointedTo as VariablePointerValue;
    let doubleRedirectionPointer = asOrNull(
      valueOfVariablePointedTo,
      VariablePointerValue,
    );
    if (doubleRedirectionPointer != null) {
      return doubleRedirectionPointer;
    }
    // If the pointer already has a canonical contextIndex (the
    // auto-resolve path at content-push time has run), return the
    // SAME object rather than a fresh copy. Sharing identity matters
    // for Lua-style upvalue closing — the open-upvalue list in the
    // target frame holds this object reference, and we need every
    // place that holds the pointer (closure's __closure_upvals, the
    // callee's param slot, etc.) to point at the same instance so
    // close-on-pop is observable everywhere.
    if (varPointer.contextIndex > 0) {
      return varPointer;
    }
    return new VariablePointerValue(varPointer.variableName, contextIndex);
  }

  public GetContextIndexOfVariableNamed(varName: string) {
    if (this.GlobalVariableExistsWithName(varName)) return 0;

    return this._callStack.currentElementIndex;
  }

  /**
   * This function is specific to the js version of ink. It allows to register a
   * callback that will be called when a variable changes. The original code uses
   * `state.variableChangedEvent += callback` instead.
   *
   * @param {function} callback
   */
  public ObserveVariableChange(
    callback: (variableName: string, newValue: InkObject) => void,
  ) {
    this.variableChangedEventCallbacks.push(callback);
  }

  private _globalVariables: Map<string, InkObject>;
  private _defaultGlobalVariables: Map<string, InkObject> = new Map();
  // The tables init built (`SnapshotInitTables`): each one's anchor, each
  // default global's table, the edges between them by segment, and the
  // ones a constant reaches.
  private _initTablePaths: Map<object, string> = new Map();
  private _initRoots: Map<string, ObjectValue> = new Map();
  private _initEdges: Map<object, Map<string, ObjectValue>> = new Map();
  private _constantInitTables: Set<object> = new Set();
  // The closed upvalue cells init built: each table's cells by key, and
  // each cell's anchor.
  private _initCellEdges: Map<object, Map<string, VariablePointerValue>> =
    new Map();
  private _initCellPaths: Map<VariablePointerValue, string> = new Map();

  private _callStack: CallStack;
  private _changedVariablesForBatchObs: Set<string> | null = new Set();
  private _listDefsOrigin: ListDefinitionsOrigin | null;

  private _batchObservingVariableChanges: boolean = false;

  // -------------------------------------------------------------------------
  // Reactive dependency tracking (Phase 4 fine-grained primitive).
  //
  // The reactive UI runtime needs to know, since its last refresh, WHICH game
  // state changed — at finer granularity than the whole-global `variableChanged`
  // observation: a table-field write (`player.hp = 5`) mutates a table in place
  // and fires no global change. So we accumulate, while `reactiveDepsEnabled`:
  //   - changed GLOBAL names  (SetGlobal)
  //   - changed TABLE identities (StoreIndex — the ObjectValue's backing Map)
  // and, during a single binding evaluation bracketed by
  // begin/endReactiveRead(), the GLOBAL names + TABLE identities that binding
  // READ. The runtime re-runs a binding only when its read-set intersects the
  // change-set. False positives (e.g. a local shadowing a global name) are
  // safe — they cost an extra (equality-gated)
  // re-eval, never a missed update. Disabled by default → zero cost for
  // non-reactive games (every hook is a single boolean check).
  // -------------------------------------------------------------------------
  public reactiveDepsEnabled = false;
  private _reactiveChangedGlobals = new Set<string>();
  private _reactiveChangedTables = new Set<object>();
  private _reactiveReadGlobals: Set<string> | null = null;
  private _reactiveReadTables: Set<object> | null = null;

  /** Record a global-name write (no-op unless reactive tracking is enabled). */
  public recordReactiveGlobalChange(name: string): void {
    if (this.reactiveDepsEnabled && name) {
      this._reactiveChangedGlobals.add(name);
    }
  }

  /** Record an in-place table mutation by the table's backing-Map identity. */
  public recordReactiveTableChange(table: object): void {
    if (this.reactiveDepsEnabled && table) {
      this._reactiveChangedTables.add(table);
    }
  }

  /** Record a global-name read into the active binding's dep set (if tracking). */
  public recordReactiveGlobalRead(name: string): void {
    if (this._reactiveReadGlobals && name) {
      this._reactiveReadGlobals.add(name);
    }
  }

  /** Record a table read into the active binding's dep set (if tracking). */
  public recordReactiveTableRead(table: object): void {
    if (this._reactiveReadTables && table) {
      this._reactiveReadTables.add(table);
    }
  }

  /** Begin capturing the reads of a single binding evaluation. */
  public beginReactiveRead(): void {
    this._reactiveReadGlobals = new Set();
    this._reactiveReadTables = new Set();
  }

  /** End capture and return the binding's dependency set. */
  public endReactiveRead(): { globals: Set<string>; tables: Set<object> } {
    const deps = {
      globals: this._reactiveReadGlobals ?? new Set<string>(),
      tables: this._reactiveReadTables ?? new Set<object>(),
    };
    this._reactiveReadGlobals = null;
    this._reactiveReadTables = null;
    return deps;
  }

  // -------------------------------------------------------------------------
  // The write barrier (docs/engine/binary-program.md, section 7). Every write
  // to a table goes through it: to the table's entries (`StoreIndex`,
  // `__newindex`, `rawset` and each builtin that changes a table in place)
  // and to what the table is beside them (its metatable, its frozen flag, and
  // the length hints `table.clear` and `#` leave on its map); and so does
  // every assignment to a closed upvalue cell, whose frame is gone. The
  // barrier marks, while `trackWrites` is set, and an image barrier, when
  // the program engine keeps images of its state (#699), hears every write
  // before it is made, so that it can keep a table's or a cell's content as
  // it was before the first write (`ProgramImages`). A caller calls the
  // barrier before it writes; one that learns only after a call whether the
  // call wrote (`#`, which may leave a new length hint) prepares the table
  // first (`PrepareTableWrite`) and marks it after.
  // -------------------------------------------------------------------------
  public trackWrites = false;
  public imageBarrier: ImageBarrier | null = null;
  private _writtenTables = new Set<ObjectValue>();
  private _writtenCells = new Set<VariablePointerValue>();

  /** Marks `table` as written. Called before the write. */
  public WriteBarrier(table: ObjectValue): void {
    this.imageBarrier?.table(table);
    if (this.trackWrites) {
      this._writtenTables.add(table);
    }
  }

  /** Keeps `table` as it is before a call that may write it, without
   *  marking it. */
  public PrepareTableWrite(table: ObjectValue): void {
    this.imageBarrier?.prepare(table);
  }

  /** Marks the closed upvalue cell `cell` as written. Called before the
   *  write. */
  public CellWriteBarrier(cell: VariablePointerValue): void {
    this._callStack.cellBarrier?.(cell);
    if (this.trackWrites) {
      this._writtenCells.add(cell);
    }
  }

  /** Takes the tables and cells marked since the last call. */
  public TakeWrites(): {
    tables: Set<ObjectValue>;
    cells: Set<VariablePointerValue>;
  } {
    const writes = { tables: this._writtenTables, cells: this._writtenCells };
    this._writtenTables = new Set();
    this._writtenCells = new Set();
    return writes;
  }

  /** Take + clear the change-set accumulated since the last call (per refresh). */
  public takeReactiveChanges(): { globals: Set<string>; tables: Set<object> } {
    const changes = {
      globals: this._reactiveChangedGlobals,
      tables: this._reactiveChangedTables,
    };
    this._reactiveChangedGlobals = new Set();
    this._reactiveChangedTables = new Set();
    return changes;
  }

  /**
   * Merge a previously taken change-set back in.
   *
   * `takeReactiveChanges` is destructive, so a caller that takes it to discard
   * its OWN residue also discards everything the turn recorded before it ran.
   * That is not recoverable downstream: reactive updates are equality-gated on
   * the last emitted value, so a dropped change is never re-derived and the
   * affected bindings stay stale indefinitely. Restoring is safe in the other
   * direction — per the note above, a false positive costs one extra
   * equality-gated re-eval and never a missed update.
   */
  public restoreReactiveChanges(changes: {
    globals: Set<string>;
    tables: Set<object>;
  }): void {
    for (const name of changes.globals) {
      this._reactiveChangedGlobals.add(name);
    }
    for (const table of changes.tables) {
      this._reactiveChangedTables.add(table);
    }
  }
}
