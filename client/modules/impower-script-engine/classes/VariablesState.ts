import { isEquatable } from "../types/IEquatable";
import { createValue } from "../utils/createValue";
import { AbstractValue } from "./AbstractValue";
import { isBoolValue } from "./BoolValue";
import { CallStack } from "./CallStack";
import { isFloatValue } from "./FloatValue";
import { isIntValue } from "./IntValue";
import { JsonSerialisation } from "./JsonSerialisation";
import { JsonWriter } from "./JsonWriter";
import { ListDefinitionsOrigin } from "./ListDefinitionsOrigin";
import { ListValue } from "./ListValue";
import { NullException } from "./NullException";
import { RuntimeObject } from "./RuntimeObject";
import { StatePatch } from "./StatePatch";
import { StoryException } from "./StoryException";
import { isValue } from "./Value";
import { VariableAssignment } from "./VariableAssignment";
import { VariablePointerValue } from "./VariablePointerValue";

export class VariablesState {
  // The way variableChangedEvent is a bit different than the reference implementation.
  // Originally it uses the C# += operator to add delegates, but in js we need to maintain
  // an actual collection of delegates (ie. callbacks) to register a new one, there is a
  // special ObserveVariableChange method below.
  public variableChangedEventCallbacks: Array<
    (variableName: string, newValue: RuntimeObject) => void
  > = [];

  public variableChangedEvent(
    variableName: string,
    newValue: RuntimeObject
  ): void {
    this.variableChangedEventCallbacks.forEach((callback) => {
      callback(variableName, newValue);
    });
  }

  public patch: StatePatch = null;

  get batchObservingVariableChanges(): boolean {
    return this._batchObservingVariableChanges;
  }

  set batchObservingVariableChanges(value: boolean) {
    this._batchObservingVariableChanges = value;
    if (value) {
      this._changedVariablesForBatchObs = new Set();
    } else if (this._changedVariablesForBatchObs != null) {
      this._changedVariablesForBatchObs.forEach((variableName) => {
        const currentValue = this._globalVariables[variableName];
        if (!currentValue) {
          throw new NullException("currentValue");
        } else {
          this.variableChangedEvent(variableName, currentValue);
        }
      });

      this._changedVariablesForBatchObs = null;
    }
  }

  get callStack(): CallStack {
    return this._callStack;
  }

  set callStack(callStack) {
    this._callStack = callStack;
  }

  private _batchObservingVariableChanges = false;

  // the original code uses a magic getter and setter for global variables,
  // allowing things like variableState['varname]. This is not quite possible
  // in js without a Proxy, so it is replaced with this $ function.
  // eslint-disable-next-line consistent-return
  public $(variableName: string, value?: unknown): unknown {
    if (typeof value === "undefined") {
      let varContents = null;

      if (this.patch !== null) {
        varContents = this.patch.TryGetGlobal(variableName, null);
        if (varContents !== undefined) {
          return (varContents as AbstractValue).valueObject;
        }
      }

      varContents = this._globalVariables[variableName];

      if (typeof varContents === "undefined") {
        varContents = this._defaultGlobalVariables[variableName];
      }

      if (typeof varContents !== "undefined")
        return (varContents as AbstractValue).valueObject;
      return null;
    }
    if (typeof this._defaultGlobalVariables[variableName] === "undefined")
      throw new StoryException(
        `Cannot assign to a variable (${variableName}) that hasn't been declared in the story`
      );

    const val = createValue(value);
    if (val == null) {
      if (value == null) {
        throw new Error("Cannot pass null to VariableState");
      } else {
        throw new Error(
          `Invalid value passed to VariableState: ${value.toString()}`
        );
      }
    }

    this.SetGlobal(variableName, val);
  }

  constructor(callStack: CallStack, listDefsOrigin: ListDefinitionsOrigin) {
    this._globalVariables = {};
    this._callStack = callStack;
    this._listDefsOrigin = listDefsOrigin;

    // if es6 proxies are available, use them.
    try {
      // the proxy is used to allow direct manipulation of global variables.
      // It first tries to access the objects own property, and if none is
      // found it delegates the call to the $ method, defined below
      const p = new Proxy(this, {
        get(target: VariablesState, name: string): unknown {
          return name in target ? target[name] : target.$(name);
        },
        set(target: VariablesState, name: string, value: unknown): boolean {
          if (name in target) target[name] = value;
          else target.$(name, value);
          return true; // returning a falsy value make the trap fail
        },
      });

      return p;
    } catch (e) {
      // thr proxy object is not available in this context. we should warn the
      // dev but writting to the console feels a bit intrusive.
      // console.log("ES6 Proxy not available - direct manipulation of global variables can't work, use $() instead.");
    }
  }

  public ApplyPatch(): void {
    if (this.patch === null) {
      throw new NullException("this.patch");
    }

    Object.entries(this.patch.globals).forEach(
      ([namedVarKey, namedVarValue]) => {
        this._globalVariables[namedVarKey] = namedVarValue;
      }
    );

    if (this._changedVariablesForBatchObs !== null) {
      this.patch.changedVariables.forEach((name) => {
        this._changedVariablesForBatchObs.add(name);
      });
    }

    this.patch = null;
  }

  public SetJsonToken(jToken: Record<string, unknown>): void {
    this._globalVariables = {};

    Object.entries(this._defaultGlobalVariables).forEach(
      ([varValKey, varValValue]) => {
        const loadedToken = jToken[varValKey];
        if (typeof loadedToken !== "undefined") {
          const tokenObject =
            JsonSerialisation.JTokenToRuntimeObject(loadedToken);
          if (tokenObject === null) {
            throw new NullException("tokenObject");
          }
          this._globalVariables[varValKey] = tokenObject;
        } else {
          this._globalVariables[varValKey] = varValValue;
        }
      }
    );
  }

  public static dontSaveDefaultValues = true;

  public WriteJson(writer: JsonWriter): void {
    writer.WriteObjectStart();
    Object.entries(this._globalVariables).forEach(
      ([keyValKey, keyValValue]) => {
        const name = keyValKey;
        const val = keyValValue;

        if (VariablesState.dontSaveDefaultValues) {
          if (this._defaultGlobalVariables[name]) {
            const defaultVal = this._defaultGlobalVariables[name];
            if (this.RuntimeObjectsEqual(val, defaultVal)) {
              return;
            }
          }
        }

        writer.WritePropertyStart(name);
        JsonSerialisation.WriteRuntimeObject(writer, val);
        writer.WritePropertyEnd();
      }
    );
    writer.WriteObjectEnd();
  }

  public RuntimeObjectsEqual(
    obj1: RuntimeObject,
    obj2: RuntimeObject
  ): boolean {
    if (obj1 === null) {
      throw new NullException("obj1");
    }
    if (obj2 === null) {
      throw new NullException("obj2");
    }

    if (obj1.constructor !== obj2.constructor) {
      return false;
    }

    if (isBoolValue(obj1) && isBoolValue(obj2)) {
      return obj1.value === obj2.value;
    }

    if (isIntValue(obj1) && isIntValue(obj2)) {
      return obj1.value === obj2.value;
    }

    if (isFloatValue(obj1) && isFloatValue(obj2)) {
      return obj1.value === obj2.value;
    }

    if (isValue(obj1) && isValue(obj2)) {
      if (isEquatable(obj1.valueObject) && isEquatable(obj2.valueObject)) {
        return obj1.valueObject.Equals(obj2.valueObject);
      }
      return obj1.valueObject === obj2.valueObject;
    }

    throw new Error(
      `FastRoughDefinitelyEquals: Unsupported runtime object type: ${obj1.constructor.name}`
    );
  }

  public GetVariableWithName(name: string, contextIndex = -1): RuntimeObject {
    let varValue = this.GetRawVariableWithName(name, contextIndex);

    const varPointer = varValue as VariablePointerValue;
    if (varPointer !== null) {
      varValue = this.ValueAtVariablePointer(varPointer);
    }

    return varValue;
  }

  public TryGetDefaultVariableValue(name: string): RuntimeObject {
    const val = this._defaultGlobalVariables[name];
    return val === undefined ? null : val;
  }

  public GlobalVariableExistsWithName(name: string): boolean {
    return (
      Boolean(this._globalVariables[name]) ||
      (this._defaultGlobalVariables !== null &&
        Boolean(this._defaultGlobalVariables[name]))
    );
  }

  public GetRawVariableWithName(
    name: string,
    contextIndex: number
  ): ListValue | RuntimeObject {
    let varValue: RuntimeObject = null;

    if (contextIndex === 0 || contextIndex === -1) {
      let variableValue = null;
      if (this.patch !== null) {
        variableValue = this.patch.TryGetGlobal(name, null);
        if (variableValue !== undefined) {
          return variableValue;
        }
      }

      // this is a conditional assignment
      variableValue = this._globalVariables[name];
      if (variableValue !== undefined) {
        return variableValue;
      }

      if (this._defaultGlobalVariables !== null) {
        variableValue = this._defaultGlobalVariables[name];
        if (variableValue !== undefined) {
          return variableValue;
        }
      }

      if (this._listDefsOrigin === null) {
        throw new NullException("VariablesState._listDefsOrigin");
      }
      const listItemValue =
        this._listDefsOrigin.FindSingleItemListWithName(name);
      if (listItemValue) {
        return listItemValue;
      }
    }

    varValue = this._callStack.GetTemporaryVariableWithName(name, contextIndex);

    return varValue;
  }

  public ValueAtVariablePointer(pointer: VariablePointerValue): RuntimeObject {
    return this.GetVariableWithName(pointer.variableName, pointer.contextIndex);
  }

  public Assign(varAss: VariableAssignment, value: RuntimeObject): void {
    let name = varAss.variableName;
    if (name === null) {
      throw new NullException("name");
    }
    let contextIndex = -1;

    let setGlobal = false;
    if (varAss.isNewDeclaration) {
      setGlobal = varAss.isGlobal;
    } else {
      setGlobal = this.GlobalVariableExistsWithName(name);
    }

    if (varAss.isNewDeclaration) {
      const varPointer = value as VariablePointerValue;
      if (varPointer !== null) {
        const fullyResolvedVariablePointer =
          this.ResolveVariablePointer(varPointer);
        value = fullyResolvedVariablePointer;
      }
    } else {
      let existingPointer = null;
      do {
        existingPointer = this.GetRawVariableWithName(
          name,
          contextIndex
        ) as VariablePointerValue;
        if (existingPointer != null) {
          name = existingPointer.variableName;
          contextIndex = existingPointer.contextIndex;
          setGlobal = contextIndex === 0;
        }
      } while (existingPointer != null);
    }

    if (setGlobal) {
      this.SetGlobal(name, value);
    } else {
      this._callStack.SetTemporaryVariable(
        name,
        value,
        varAss.isNewDeclaration,
        contextIndex
      );
    }
  }

  public SnapshotDefaultGlobals(): void {
    this._defaultGlobalVariables = { ...this._globalVariables };
  }

  public RetainListOriginsForAssignment(
    oldValue: RuntimeObject,
    newValue: RuntimeObject
  ): void {
    const oldList = oldValue as ListValue;
    const newList = newValue as ListValue;

    if (oldList.value && newList.value && newList.value.Count === 0) {
      newList.value.SetInitialOriginNames(oldList.value.originNames);
    }
  }

  public SetGlobal(variableName: string, value: RuntimeObject): void {
    let oldValue = null;

    if (this.patch === null) {
      oldValue = this._globalVariables[variableName];
    }

    if (this.patch !== null) {
      oldValue = this.patch.TryGetGlobal(variableName, null);
      if (oldValue === undefined) {
        oldValue = this._globalVariables[variableName];
      }
    }

    ListValue.RetainListOriginsForAssignment(oldValue, value);

    if (variableName === null) {
      throw new NullException("variableName");
    }

    if (this.patch !== null) {
      this.patch.SetGlobal(variableName, value);
    } else {
      this._globalVariables[variableName] = value;
    }

    // TODO: Not sure !== is equivalent to !value.Equals(oldValue)
    if (
      this.variableChangedEvent !== null &&
      oldValue !== null &&
      value !== oldValue.result
    ) {
      if (this.batchObservingVariableChanges) {
        if (this._changedVariablesForBatchObs === null) {
          throw new NullException("this._changedVariablesForBatchObs");
        }

        if (this.patch !== null) {
          this.patch.AddChangedVariable(variableName);
        } else if (this._changedVariablesForBatchObs !== null) {
          this._changedVariablesForBatchObs.add(variableName);
        }
      } else {
        this.variableChangedEvent(variableName, value);
      }
    }
  }

  public ResolveVariablePointer(
    varPointer: VariablePointerValue
  ): VariablePointerValue {
    let { contextIndex } = varPointer;

    if (contextIndex === -1) {
      contextIndex = this.GetContextIndexOfVariableNamed(
        varPointer.variableName
      );
    }

    const valueOfVariablePointedTo = this.GetRawVariableWithName(
      varPointer.variableName,
      contextIndex
    );

    const doubleRedirectionPointer =
      valueOfVariablePointedTo as VariablePointerValue;
    if (doubleRedirectionPointer != null) {
      return doubleRedirectionPointer;
    }
    return new VariablePointerValue(varPointer.variableName, contextIndex);
  }

  public GetContextIndexOfVariableNamed(varName: string): number {
    if (this.GlobalVariableExistsWithName(varName)) {
      return 0;
    }

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
    callback: (variableName: string, newValue: RuntimeObject) => void
  ): void {
    this.variableChangedEventCallbacks.push(callback);
  }

  private _globalVariables: Record<string, RuntimeObject> = {};

  private _defaultGlobalVariables: Record<string, RuntimeObject> = {};

  private _callStack: CallStack;

  private _changedVariablesForBatchObs: Set<string> = new Set();

  private _listDefsOrigin: ListDefinitionsOrigin;
}
