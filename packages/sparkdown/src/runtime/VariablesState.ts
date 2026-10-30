import {
  AbstractValue,
  Value,
  VariablePointerValue,
  IntValue,
  FloatValue,
  BoolValue,
  ObjectValue,
} from "./Value";
import { VariableAssignment } from "./VariableAssignment";
import { InkObject } from "./Object";
import { StoryException } from "./StoryException";
import { JsonSerialisation } from "./JsonSerialisation";
import { asOrThrows, asOrNull, isEquatable } from "./TypeAssertion";
import { tryGetValueFromMap } from "./TryGetResult";
import { throwNullException } from "./NullException";
import { CallStack } from "./CallStack";
import { SimpleJson } from "./SimpleJson";

function VariablesStateAccessor<T>(): new () => Pick<T, keyof T> {
  return class {} as any;
}

type VariableStateValue = boolean | string | number | null;

export interface ImageBarrier {
  table(table: ObjectValue): void;
  prepare(table: ObjectValue): void;
  global(name: string): void;
}

export type VariableBinding =
  | Map<string, InkObject>
  | VariablePointerValue
  | null;

export type WriteWatch = (binding: VariableBinding, name: string) => void;

export interface ConstantWatch {
  readonly tables: ReadonlySet<ObjectValue>;
  written: boolean;
}

export interface DeclaredGlobals {
  readonly defaults: ReadonlyMap<string, InkObject>;
  readonly tablePaths: ReadonlyMap<object, string>;
  readonly roots: ReadonlyMap<string, ObjectValue>;
  readonly edges: ReadonlyMap<object, ReadonlyMap<string, ObjectValue>>;
  readonly constantTables: ReadonlySet<object>;
  readonly constantWatch: ConstantWatch | null;
  readonly cellEdges: ReadonlyMap<
    object,
    ReadonlyMap<string, VariablePointerValue>
  >;
  readonly cellPaths: ReadonlyMap<VariablePointerValue, string>;
}

export class VariablesState extends VariablesStateAccessor<
  Record<string, any>
>() {
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

  public DiscardVariableObservation(): boolean {
    this._batchObservingVariableChanges = false;
    const wrote = (this._changedVariablesForBatchObs?.size ?? 0) > 0;
    this._changedVariablesForBatchObs = null;
    return wrote;
  }

  get callStack() {
    return this._callStack;
  }
  set callStack(callStack) {
    this._callStack = callStack;
  }

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

  constructor(callStack: CallStack) {
    super();
    this._globalVariables = new Map();
    this._callStack = callStack;

    try {
      let p = new Proxy(this, {
        get(target: any, name) {
          return name in target ? target[name] : target.$(name);
        },
        set(target: any, name, value) {
          if (name in target) target[name] = value;
          else target.$(name, value);
          return true;
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
          return {
            enumerable: true,
            configurable: true,
            value: target.$(name),
          };
        },
      });

      return p;
    } catch (e) {
    }
  }

  public constantNames: Set<string> = new Set<string>();

  public SetJsonToken(jToken: Record<string, any>) {
    this._globalVariables.clear();

    for (let [varValKey, varValValue] of this._defaultGlobalVariables) {
      if (this.constantNames.has(varValKey)) {
        this._globalVariables.set(varValKey, varValValue);
        JsonSerialisation.ReadDefinitions(jToken[varValKey]);
        continue;
      }
      let loadedToken = jToken[varValKey];
      if (typeof loadedToken !== "undefined") {
        let tokenInkObject =
          JsonSerialisation.JTokenToRuntimeObject(loadedToken);
        if (tokenInkObject === null) {
          return throwNullException("tokenInkObject");
        }
        const defSelf = (tokenInkObject as any).__loadDefSelf;
        if (
          defSelf != null &&
          tokenInkObject instanceof ObjectValue &&
          varValValue instanceof ObjectValue
        ) {
          this.imageBarrier?.prepare(varValValue);
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

    for (const key of Object.keys(jToken)) {
      if (this._defaultGlobalVariables.has(key)) continue;
      if (this.constantNames.has(key)) {
        JsonSerialisation.ReadDefinitions(jToken[key]);
        continue;
      }
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

      if (this.constantNames.has(name)) {
        continue;
      }

      const defInfo =
        val instanceof ObjectValue
          ? JsonSerialisation.defineSerializationInfo(val)
          : null;
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

  public GetRawVariableWithName(
    name: string | null,
    contextIndex: number,
    scopeIndex: number = -1,
  ) {
    let varValue: InkObject | null = null;

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
    }

    return null;
  }

  public ValueAtVariablePointer(pointer: VariablePointerValue) {
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
    let scopeIndex = -1;

    let setGlobal = false;
    if (varAss.isNewDeclaration) {
      setGlobal = varAss.isGlobal;
    } else {
      const tempExists =
        this._callStack.GetTemporaryVariableWithName(name, contextIndex) !==
        null;
      setGlobal = !tempExists && this.GlobalVariableExistsWithName(name);
    }

    if (varAss.isNewDeclaration) {
      let varPointer = asOrNull(value, VariablePointerValue);
      if (varPointer !== null) {
        let fullyResolvedVariablePointer =
          this.ResolveVariablePointer(varPointer);
        value = fullyResolvedVariablePointer;
      }
    } else {
      let existingPointer = null;
      do {
        existingPointer = asOrNull(
          this.GetRawVariableWithName(name, contextIndex, scopeIndex),
          VariablePointerValue,
        );
        if (existingPointer != null) {
          if (existingPointer.isClosed) {
            this.CellWriteBarrier(existingPointer);
            existingPointer.closedValue = value;
            this.writeWatch?.(existingPointer, existingPointer.variableName);
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
    const scope = this._callStack.SetTemporaryVariable(
      name,
      value,
      varAss.isNewDeclaration,
      contextIndex,
      scopeIndex,
    );
    if (
      this.writeWatch !== null &&
      !varAss.isNewDeclaration &&
      !varAss.isInitializer
    ) {
      this.writeWatch(scope, name);
    }
  }

  public writeWatch: WriteWatch | null = null;

  public BindingOf(
    scope: Map<string, InkObject>,
    name: string,
  ): { binding: VariableBinding; name: string } {
    const value = scope.get(name);
    return value instanceof VariablePointerValue
      ? this.BindingThrough(value)
      : { binding: scope, name };
  }

  public BindingThrough(pointer: VariablePointerValue): {
    binding: VariableBinding;
    name: string;
  } {
    let binding: VariableBinding = null;
    let name = pointer.variableName;
    let value: InkObject | undefined = pointer;
    while (value instanceof VariablePointerValue) {
      if (value.isClosed) {
        return { binding: value, name: value.variableName };
      }
      name = value.variableName;
      if (value.contextIndex === 0) {
        return { binding: null, name };
      }
      const found = this._callStack.TemporaryScopeOf(
        name,
        value.contextIndex,
        value.scopeIndex,
      );
      if (found === null) {
        return { binding: null, name };
      }
      binding = found;
      value = found.get(name);
    }
    return { binding, name };
  }

  public get globalEntries(): ReadonlyMap<string, InkObject> {
    return this._globalVariables;
  }

  public RestoreGlobals(globals: ReadonlyMap<string, InkObject>) {
    this._globalVariables.clear();
    for (const [name, value] of globals) {
      this._globalVariables.set(name, value);
    }
  }

  public RestoreGlobal(name: string, value: InkObject | undefined) {
    if (value === undefined) {
      this._globalVariables.delete(name);
    } else {
      this._globalVariables.set(name, value);
    }
  }

  public DefaultGlobal(name: string): InkObject | undefined {
    return this._defaultGlobalVariables.get(name);
  }

  public SnapshotDefaultGlobals() {
    this._defaultGlobalVariables = new Map(this._globalVariables);
    this.SnapshotInitTables();
  }

  public get Declared(): DeclaredGlobals {
    return {
      defaults: this._defaultGlobalVariables,
      tablePaths: this._initTablePaths,
      roots: this._initRoots,
      edges: this._initEdges,
      constantTables: this._constantInitTables,
      constantWatch: this._constantWatch,
      cellEdges: this._initCellEdges,
      cellPaths: this._initCellPaths,
    };
  }

  public get ConstantsAsDeclared(): boolean {
    return !(this._constantWatch?.written ?? false);
  }

  public ConstantsMayHaveChanged(): void {
    if (this._constantWatch !== null) {
      this._constantWatch.written = true;
    }
  }

  public AdoptDeclared(declared: DeclaredGlobals) {
    this._defaultGlobalVariables = declared.defaults as Map<string, InkObject>;
    this._initTablePaths = declared.tablePaths as Map<object, string>;
    this._initRoots = declared.roots as Map<string, ObjectValue>;
    this._initEdges = declared.edges as Map<object, Map<string, ObjectValue>>;
    this._constantInitTables = declared.constantTables as Set<object>;
    this._constantWatch = declared.constantWatch;
    this._initCellEdges = declared.cellEdges as Map<
      object,
      Map<string, VariablePointerValue>
    >;
    this._initCellPaths = declared.cellPaths as Map<
      VariablePointerValue,
      string
    >;
  }

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
    const watched = new Set<ObjectValue>();
    let closesOverCells = false;
    for (let i = 0; i < constants.length; i++) {
      const table = constants[i]!;
      const map = table.value!;
      if (this._constantInitTables.has(map)) continue;
      this._constantInitTables.add(map);
      watched.add(table);
      closesOverCells ||= this._initCellEdges.has(map);
      for (const child of this._initEdges.get(map)?.values() ?? []) {
        constants.push(child);
      }
    }
    this._constantWatch =
      watched.size > 0 ? { tables: watched, written: closesOverCells } : null;
  }

  public InitTableAnchors(): Map<object, string> {
    return this._initTablePaths;
  }

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

  public InitCellAnchors(): Map<VariablePointerValue, string> {
    return this._initCellPaths;
  }

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

  private InitTableAtPath(path: string[]): ObjectValue | null {
    let table = this._initRoots.get(path[0]!) ?? null;
    for (let i = 1; table && i < path.length; i++) {
      table = this._initEdges.get(table.value!)?.get(path[i]!) ?? null;
    }
    return table;
  }

  public SetGlobal(variableName: string | null, value: InkObject) {
    let oldValue = tryGetValueFromMap(
      this._globalVariables,
      variableName,
      null,
    );

    if (variableName === null) {
      return throwNullException("variableName");
    }

    this._globalVariables.set(variableName, value);
    this.imageBarrier?.global(variableName);
    this.writeWatch?.(null, variableName);

    this.recordReactiveGlobalChange(variableName);

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

    let doubleRedirectionPointer = asOrNull(
      valueOfVariablePointedTo,
      VariablePointerValue,
    );
    if (doubleRedirectionPointer != null) {
      return doubleRedirectionPointer;
    }
    if (varPointer.contextIndex > 0) {
      return varPointer;
    }
    return new VariablePointerValue(varPointer.variableName, contextIndex);
  }

  public GetContextIndexOfVariableNamed(varName: string) {
    if (this.GlobalVariableExistsWithName(varName)) return 0;

    return this._callStack.currentElementIndex;
  }

  public ObserveVariableChange(
    callback: (variableName: string, newValue: InkObject) => void,
  ) {
    this.variableChangedEventCallbacks.push(callback);
  }

  private _globalVariables: Map<string, InkObject>;
  private _defaultGlobalVariables: Map<string, InkObject> = new Map();
  private _initTablePaths: Map<object, string> = new Map();
  private _initRoots: Map<string, ObjectValue> = new Map();
  private _initEdges: Map<object, Map<string, ObjectValue>> = new Map();
  private _constantInitTables: Set<object> = new Set();
  private _constantWatch: ConstantWatch | null = null;
  private _initCellEdges: Map<object, Map<string, VariablePointerValue>> =
    new Map();
  private _initCellPaths: Map<VariablePointerValue, string> = new Map();

  private _callStack: CallStack;
  private _changedVariablesForBatchObs: Set<string> | null = new Set();

  private _batchObservingVariableChanges: boolean = false;

  public reactiveDepsEnabled = false;
  private _reactiveChangedGlobals = new Set<string>();
  private _reactiveChangedTables = new Set<object>();
  private _reactiveReadGlobals: Set<string> | null = null;
  private _reactiveReadTables: Set<object> | null = null;

  public recordReactiveGlobalChange(name: string): void {
    if (this.reactiveDepsEnabled && name) {
      this._reactiveChangedGlobals.add(name);
    }
  }

  public recordReactiveTableChange(table: object): void {
    if (this.reactiveDepsEnabled && table) {
      this._reactiveChangedTables.add(table);
    }
  }

  public recordReactiveGlobalRead(name: string): void {
    if (this._reactiveReadGlobals && name) {
      this._reactiveReadGlobals.add(name);
    }
  }

  public recordReactiveTableRead(table: object): void {
    if (this._reactiveReadTables && table) {
      this._reactiveReadTables.add(table);
    }
  }

  public beginReactiveRead(): void {
    this._reactiveReadGlobals = new Set();
    this._reactiveReadTables = new Set();
  }

  public endReactiveRead(): { globals: Set<string>; tables: Set<object> } {
    const deps = {
      globals: this._reactiveReadGlobals ?? new Set<string>(),
      tables: this._reactiveReadTables ?? new Set<object>(),
    };
    this._reactiveReadGlobals = null;
    this._reactiveReadTables = null;
    return deps;
  }

  public trackWrites = false;
  public imageBarrier: ImageBarrier | null = null;
  private _writtenTables = new Set<ObjectValue>();
  private _writtenCells = new Set<VariablePointerValue>();

  public WriteBarrier(table: ObjectValue): void {
    this.imageBarrier?.table(table);
    if (this.trackWrites) {
      this._writtenTables.add(table);
    }
    this.watchConstantWrite(table);
  }

  public PrepareTableWrite(table: ObjectValue): void {
    this.imageBarrier?.prepare(table);
    this.watchConstantWrite(table);
  }

  private watchConstantWrite(table: ObjectValue): void {
    const watch = this._constantWatch;
    if (watch !== null && !watch.written && watch.tables.has(table)) {
      watch.written = true;
    }
  }

  public CellWriteBarrier(cell: VariablePointerValue): void {
    this._callStack.cellBarrier?.(cell);
    if (this.trackWrites) {
      this._writtenCells.add(cell);
    }
  }

  public TakeWrites(): {
    tables: Set<ObjectValue>;
    cells: Set<VariablePointerValue>;
  } {
    const writes = { tables: this._writtenTables, cells: this._writtenCells };
    this._writtenTables = new Set();
    this._writtenCells = new Set();
    return writes;
  }

  public takeReactiveChanges(): { globals: Set<string>; tables: Set<object> } {
    const changes = {
      globals: this._reactiveChangedGlobals,
      tables: this._reactiveChangedTables,
    };
    this._reactiveChangedGlobals = new Set();
    this._reactiveChangedTables = new Set();
    return changes;
  }

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
