import { ValueType } from "../types/ValueType";
import { createValue } from "../utils/createValue";
import { BoolValue } from "./BoolValue";
import { IntValue } from "./IntValue";
import { List } from "./List";
import { ListItem, ListItemFromSerializedKey } from "./ListItem";
import { ListValue } from "./ListValue";
import { NullException } from "./NullException";
import { Path } from "./Path";
import { RuntimeObject } from "./RuntimeObject";
import { StoryException } from "./StoryException";
import { Value } from "./Value";
import { Void } from "./Void";

type BinaryOp<T> = (left: T, right: T) => unknown;
type UnaryOp<T> = (val: T) => unknown;

export class NativeFunctionCall extends RuntimeObject {
  public static readonly Add: string = "+";

  public static readonly Subtract: string = "-";

  public static readonly Divide: string = "/";

  public static readonly Multiply: string = "*";

  public static readonly Mod: string = "%";

  public static readonly Negate: string = "_";

  public static readonly Equal: string = "==";

  public static readonly Greater: string = ">";

  public static readonly Less: string = "<";

  public static readonly GreaterThanOrEquals: string = ">=";

  public static readonly LessThanOrEquals: string = "<=";

  public static readonly NotEquals: string = "!=";

  public static readonly Not: string = "!";

  public static readonly And: string = "&&";

  public static readonly Or: string = "||";

  public static readonly Min: string = "MIN";

  public static readonly Max: string = "MAX";

  public static readonly Pow: string = "POW";

  public static readonly Floor: string = "FLOOR";

  public static readonly Ceiling: string = "CEILING";

  public static readonly Int: string = "INT";

  public static readonly Float: string = "FLOAT";

  public static readonly Has: string = "?";

  public static readonly Hasnt: string = "!?";

  public static readonly Intersect: string = "^";

  public static readonly ListMin: string = "LIST_MIN";

  public static readonly ListMax: string = "LIST_MAX";

  public static readonly All: string = "LIST_ALL";

  public static readonly Count: string = "LIST_COUNT";

  public static readonly ValueOfList: string = "LIST_VALUE";

  public static readonly Invert: string = "LIST_INVERT";

  public static CallWithName(functionName: string): NativeFunctionCall {
    return new NativeFunctionCall(functionName);
  }

  public static CallExistsWithName(functionName: string): NativeFunctionCall {
    this.GenerateNativeFunctionsIfNecessary();
    return this._nativeFunctions?.[functionName];
  }

  get name(): string {
    if (this._name === null) {
      throw new NullException("NativeFunctionCall._name");
    }
    return this._name;
  }

  set name(value: string) {
    this._name = value;
    if (!this._isPrototype) {
      if (NativeFunctionCall._nativeFunctions === null) {
        throw new NullException("NativeFunctionCall._nativeFunctions");
      } else
        this._prototype =
          NativeFunctionCall._nativeFunctions[this._name] || null;
    }
  }

  public _name: string = null;

  get numberOfParameters(): number {
    if (this._prototype) {
      return this._prototype.numberOfParameters;
    }
    return this._numberOfParameters;
  }

  set numberOfParameters(value: number) {
    this._numberOfParameters = value;
  }

  public _numberOfParameters = 0;

  public Call(parameters: RuntimeObject[]): RuntimeObject {
    if (this._prototype) {
      return this._prototype.Call(parameters);
    }

    if (this.numberOfParameters !== parameters.length) {
      throw new Error("Unexpected number of parameters");
    }

    let hasList = false;
    parameters.forEach((p) => {
      if (p instanceof Void)
        throw new StoryException(
          'Attempting to perform operation on a void value. Did you forget to "return" a value from a function you called here?'
        );
      if (p instanceof ListValue) {
        hasList = true;
      }
    });

    if (parameters.length === 2 && hasList) {
      return this.CallBinaryListOperation(parameters);
    }

    const coercedType: ValueType = (parameters[0] as Value).valueType;

    if (coercedType === "Int") {
      return this.CallType<number>(this.CoerceValuesToSingleType(parameters));
    }
    if (coercedType === "Float") {
      return this.CallType<number>(this.CoerceValuesToSingleType(parameters));
    }
    if (coercedType === "String") {
      return this.CallType<string>(this.CoerceValuesToSingleType(parameters));
    }
    if (coercedType === "DivertTarget") {
      return this.CallType<Path>(this.CoerceValuesToSingleType(parameters));
    }
    if (coercedType === "List") {
      return this.CallType<List>(this.CoerceValuesToSingleType(parameters));
    }

    return null;
  }

  public CallType<T>(parametersOfSingleType: Array<Value<T>>): Value<unknown> {
    const param1 = parametersOfSingleType[0] as Value;
    const valType = param1.valueType;

    const val1 = param1 as Value<T>;

    const paramCount = parametersOfSingleType.length;

    if (paramCount === 2 || paramCount === 1) {
      if (this._operationFuncs === null) {
        throw new NullException("NativeFunctionCall._operationFuncs");
      }
      const opForTypeObj = this._operationFuncs.get(valType);
      if (!opForTypeObj) {
        throw new StoryException(
          `Cannot perform operation ${this.name} on ${valType}`
        );
      }

      if (paramCount === 2) {
        const param2 = parametersOfSingleType[1] as Value;

        const val2 = param2 as Value<T>;

        const opForType = opForTypeObj as BinaryOp<T>;

        if (val1.value === null || val2.value === null) {
          throw new NullException("NativeFunctionCall.Call BinaryOp values");
        }
        const resultVal = opForType(val1.value, val2.value);

        return createValue(resultVal);
      }
      const opForType = opForTypeObj as UnaryOp<T>;

      if (val1.value === null) {
        throw new NullException("NativeFunctionCall.Call UnaryOp value");
      }
      const resultVal = opForType(val1.value);

      // This code is different from upstream. Since JavaScript treats
      // integers and floats as the same numbers, it's impossible
      // to force an number to be either an integer or a float.
      //
      // It can be useful to force a specific number type
      // (especially for divisions), so the result of INT() & FLOAT()
      // is coerced to the the proper value type.
      //
      // Note that we also force all other unary operation to
      // return the same value type, although this is only
      // meaningful for numbers. See `Value.Create`.
      if (this.name === NativeFunctionCall.Int) {
        return createValue(resultVal, "Int");
      }
      if (this.name === NativeFunctionCall.Float) {
        return createValue(resultVal, "Float");
      }
      return createValue(resultVal, param1.valueType);
    }
    throw new Error(
      `Unexpected number of parameters to NativeFunctionCall: ${parametersOfSingleType.length}`
    );
  }

  public CallBinaryListOperation(
    parameters: RuntimeObject[]
  ): ListValue | BoolValue | Value<unknown> {
    if (
      (this.name === "+" || this.name === "-") &&
      parameters[0] instanceof ListValue &&
      parameters[1] instanceof IntValue
    )
      return this.CallListIncrementOperation(parameters);

    const v1 = parameters[0] as Value;
    const v2 = parameters[1] as Value;

    if (
      (this.name === "&&" || this.name === "||") &&
      (v1.valueType !== "List" || v2.valueType !== "List")
    ) {
      if (this._operationFuncs === null) {
        throw new NullException("NativeFunctionCall._operationFuncs");
      }
      const op = this._operationFuncs.get("Int") as BinaryOp<number>;
      if (op === null) {
        throw new NullException(
          "NativeFunctionCall.CallBinaryListOperation op"
        );
      }
      const result = Boolean(op(v1.isTruthy ? 1 : 0, v2.isTruthy ? 1 : 0));
      return new BoolValue(result);
    }

    if (v1.valueType === "List" && v2.valueType === "List")
      return this.CallType<List>(this.CoerceValuesToSingleType([v1, v2]));

    throw new StoryException(
      `Can not call use ${this.name} operation on ${v1.valueType} and ${v2.valueType}`
    );
  }

  public CallListIncrementOperation(listIntParams: RuntimeObject[]): ListValue {
    const listVal = listIntParams[0] as ListValue;
    const intVal = listIntParams[1] as IntValue;

    const resultList = new List();

    if (listVal.value === null) {
      throw new NullException(
        "NativeFunctionCall.CallListIncrementOperation listVal.value"
      );
    }
    listVal.value.forEach((listItemValue, listItemKey) => {
      const listItem = ListItemFromSerializedKey(listItemKey);

      if (this._operationFuncs === null) {
        throw new NullException("NativeFunctionCall._operationFuncs");
      }
      const intOp = this._operationFuncs.get("Int") as BinaryOp<number>;

      if (intVal.value === null) {
        throw new NullException(
          "NativeFunctionCall.CallListIncrementOperation intVal.value"
        );
      }
      const targetInt = intOp(listItemValue, intVal.value) as number;

      let itemOrigin = null;
      if (listVal.value.origins === null) {
        throw new NullException(
          "NativeFunctionCall.CallListIncrementOperation listVal.value.origins"
        );
      }
      for (let i = 0; i < listVal.value.origins.length; i += 1) {
        const origin = listVal.value.origins[i];
        if (origin.name === listItem.originName) {
          itemOrigin = origin;
          break;
        }
      }
      if (itemOrigin != null) {
        const incrementedItem = itemOrigin.TryGetItemWithValue(
          targetInt,
          ListItem.Null
        );
        if (incrementedItem.exists)
          resultList.Add(incrementedItem.result, targetInt);
      }
    });

    return new ListValue(resultList);
  }

  public CoerceValuesToSingleType<T>(
    parametersIn: RuntimeObject[]
  ): Value<T>[] {
    let valType: ValueType = "Int" as ValueType;

    let specialCaseList: null | ListValue = null;

    parametersIn.forEach((obj) => {
      const val = obj as Value;
      if (val.valueType > valType) {
        valType = val.valueType;
      }

      if (val.valueType === "List") {
        specialCaseList = val as ListValue;
      }
    });

    const parametersOut = [];

    if (valType === "List") {
      parametersIn.forEach((inkObjectVal) => {
        const val = inkObjectVal as Value;
        if (val.valueType === "List") {
          parametersOut.push(val);
        } else if (val.valueType === "Int") {
          const intVal = Number(val.valueObject);

          specialCaseList = specialCaseList as ListValue;
          if (specialCaseList.value === null)
            throw new NullException(
              "NativeFunctionCall.CoerceValuesToSingleType specialCaseList.value"
            );
          const list = specialCaseList.value.originOfMaxItem;

          if (list === null) {
            throw new NullException(
              "NativeFunctionCall.CoerceValuesToSingleType list"
            );
          }
          const item = list.TryGetItemWithValue(intVal, ListItem.Null);
          if (item.exists) {
            const castedValue = new ListValue(item.result, intVal);
            parametersOut.push(castedValue);
          } else
            throw new StoryException(
              `Could not find List item with the value ${intVal} in ${list.name}`
            );
        } else {
          const key = val.valueType;
          throw new StoryException(
            `Cannot mix Lists and ${key} values in this operation`
          );
        }
      });
    } else {
      parametersIn.forEach((inkObjectVal) => {
        const val = inkObjectVal as Value;
        const castedValue = val.Cast(valType);
        parametersOut.push(castedValue);
      });
    }

    return parametersOut;
  }

  constructor(name: string);

  constructor(name: string, numberOfParameters: number);

  constructor();

  constructor(...args) {
    super();

    if (args.length === 0) {
      NativeFunctionCall.GenerateNativeFunctionsIfNecessary();
    } else if (args.length === 1) {
      const name = args[0];
      NativeFunctionCall.GenerateNativeFunctionsIfNecessary();
      this.name = name;
    } else if (args.length === 2) {
      const name = args[0];
      const numberOfParameters = args[1];

      this._isPrototype = true;
      this.name = name;
      this.numberOfParameters = numberOfParameters;
    }
  }

  public static Identity<T>(t: T): unknown {
    return t;
  }

  public static GenerateNativeFunctionsIfNecessary(): void {
    if (this._nativeFunctions == null) {
      this._nativeFunctions = {};

      // Int operations
      this.AddIntBinaryOp(this.Add, (x, y) => x + y);
      this.AddIntBinaryOp(this.Subtract, (x, y) => x - y);
      this.AddIntBinaryOp(this.Multiply, (x, y) => x * y);
      this.AddIntBinaryOp(this.Divide, (x, y) => Math.floor(x / y));
      this.AddIntBinaryOp(this.Mod, (x, y) => x % y);
      this.AddIntUnaryOp(this.Negate, (x) => -x);

      this.AddIntBinaryOp(this.Equal, (x, y) => x === y);
      this.AddIntBinaryOp(this.Greater, (x, y) => x > y);
      this.AddIntBinaryOp(this.Less, (x, y) => x < y);
      this.AddIntBinaryOp(this.GreaterThanOrEquals, (x, y) => x >= y);
      this.AddIntBinaryOp(this.LessThanOrEquals, (x, y) => x <= y);
      this.AddIntBinaryOp(this.NotEquals, (x, y) => x !== y);
      this.AddIntUnaryOp(this.Not, (x) => x === 0);

      this.AddIntBinaryOp(this.And, (x, y) => x !== 0 && y !== 0);
      this.AddIntBinaryOp(this.Or, (x, y) => x !== 0 || y !== 0);

      this.AddIntBinaryOp(this.Max, (x, y) => Math.max(x, y));
      this.AddIntBinaryOp(this.Min, (x, y) => Math.min(x, y));

      this.AddIntBinaryOp(this.Pow, (x, y) => x ** y);
      this.AddIntUnaryOp(this.Floor, NativeFunctionCall.Identity);
      this.AddIntUnaryOp(this.Ceiling, NativeFunctionCall.Identity);
      this.AddIntUnaryOp(this.Int, NativeFunctionCall.Identity);
      this.AddIntUnaryOp(this.Float, (x) => x);

      // Float operations
      this.AddFloatBinaryOp(this.Add, (x, y) => x + y);
      this.AddFloatBinaryOp(this.Subtract, (x, y) => x - y);
      this.AddFloatBinaryOp(this.Multiply, (x, y) => x * y);
      this.AddFloatBinaryOp(this.Divide, (x, y) => x / y);
      this.AddFloatBinaryOp(this.Mod, (x, y) => x % y);
      this.AddFloatUnaryOp(this.Negate, (x) => -x);

      this.AddFloatBinaryOp(this.Equal, (x, y) => x === y);
      this.AddFloatBinaryOp(this.Greater, (x, y) => x > y);
      this.AddFloatBinaryOp(this.Less, (x, y) => x < y);
      this.AddFloatBinaryOp(this.GreaterThanOrEquals, (x, y) => x >= y);
      this.AddFloatBinaryOp(this.LessThanOrEquals, (x, y) => x <= y);
      this.AddFloatBinaryOp(this.NotEquals, (x, y) => x !== y);
      this.AddFloatUnaryOp(this.Not, (x) => x === 0.0);

      this.AddFloatBinaryOp(this.And, (x, y) => x !== 0.0 && y !== 0.0);
      this.AddFloatBinaryOp(this.Or, (x, y) => x !== 0.0 || y !== 0.0);

      this.AddFloatBinaryOp(this.Max, (x, y) => Math.max(x, y));
      this.AddFloatBinaryOp(this.Min, (x, y) => Math.min(x, y));

      this.AddFloatBinaryOp(this.Pow, (x, y) => x ** y);
      this.AddFloatUnaryOp(this.Floor, (x) => Math.floor(x));
      this.AddFloatUnaryOp(this.Ceiling, (x) => Math.ceil(x));
      this.AddFloatUnaryOp(this.Int, (x) => Math.floor(x));
      this.AddFloatUnaryOp(this.Float, NativeFunctionCall.Identity);

      // String operations
      this.AddStringBinaryOp(this.Add, (x, y) => x + y); // concat
      this.AddStringBinaryOp(this.Equal, (x, y) => x === y);
      this.AddStringBinaryOp(this.NotEquals, (x, y) => !(x === y));
      this.AddStringBinaryOp(this.Has, (x, y) => x.includes(y));
      this.AddStringBinaryOp(this.Hasnt, (x, y) => !x.includes(y));

      this.AddListBinaryOp(this.Add, (x, y) => x.Union(y));
      this.AddListBinaryOp(this.Subtract, (x, y) => x.Without(y));
      this.AddListBinaryOp(this.Has, (x, y) => x.Contains(y));
      this.AddListBinaryOp(this.Hasnt, (x, y) => !x.Contains(y));
      this.AddListBinaryOp(this.Intersect, (x, y) => x.Intersect(y));

      this.AddListBinaryOp(this.Equal, (x, y) => x.Equals(y));
      this.AddListBinaryOp(this.Greater, (x, y) => x.GreaterThan(y));
      this.AddListBinaryOp(this.Less, (x, y) => x.LessThan(y));
      this.AddListBinaryOp(this.GreaterThanOrEquals, (x, y) =>
        x.GreaterThanOrEquals(y)
      );
      this.AddListBinaryOp(this.LessThanOrEquals, (x, y) =>
        x.LessThanOrEquals(y)
      );
      this.AddListBinaryOp(this.NotEquals, (x, y) => !x.Equals(y));

      this.AddListBinaryOp(this.And, (x, y) => x.Count > 0 && y.Count > 0);
      this.AddListBinaryOp(this.Or, (x, y) => x.Count > 0 || y.Count > 0);

      this.AddListUnaryOp(this.Not, (x) => (x.Count === 0 ? 1 : 0));

      this.AddListUnaryOp(this.Invert, (x) => x.inverse);
      this.AddListUnaryOp(this.All, (x) => x.all);
      this.AddListUnaryOp(this.ListMin, (x) => x.MinAsList());
      this.AddListUnaryOp(this.ListMax, (x) => x.MaxAsList());
      this.AddListUnaryOp(this.Count, (x) => x.Count);
      this.AddListUnaryOp(this.ValueOfList, (x) => x.maxItem.Value);

      const divertTargetsEqual = (d1: Path, d2: Path): boolean => d1.Equals(d2);
      const divertTargetsNotEqual = (d1: Path, d2: Path): boolean =>
        !d1.Equals(d2);
      this.AddOpToNativeFunc(this.Equal, 2, "DivertTarget", divertTargetsEqual);
      this.AddOpToNativeFunc(
        this.NotEquals,
        2,
        "DivertTarget",
        divertTargetsNotEqual
      );
    }
  }

  public AddOpFuncForType(
    valType: ValueType,
    op: UnaryOp<number | List> | BinaryOp<number | string | List | Path>
  ): void {
    if (this._operationFuncs == null) {
      this._operationFuncs = new Map();
    }

    this._operationFuncs.set(valType, op);
  }

  public static AddOpToNativeFunc(
    name: string,
    args: number,
    valType: ValueType,
    op: UnaryOp<unknown> | BinaryOp<unknown>
  ): void {
    if (this._nativeFunctions === null) {
      throw new NullException("NativeFunctionCall._nativeFunctions");
    }
    let nativeFunc = this._nativeFunctions[name];
    if (!nativeFunc) {
      nativeFunc = new NativeFunctionCall(name, args);
      this._nativeFunctions[name] = nativeFunc;
    }

    nativeFunc.AddOpFuncForType(valType, op);
  }

  public static AddIntBinaryOp(name: string, op: BinaryOp<number>): void {
    this.AddOpToNativeFunc(name, 2, "Int", op);
  }

  public static AddIntUnaryOp(name: string, op: UnaryOp<number>): void {
    this.AddOpToNativeFunc(name, 1, "Int", op);
  }

  public static AddFloatBinaryOp(name: string, op: BinaryOp<number>): void {
    this.AddOpToNativeFunc(name, 2, "Float", op);
  }

  public static AddFloatUnaryOp(name: string, op: UnaryOp<number>): void {
    this.AddOpToNativeFunc(name, 1, "Float", op);
  }

  public static AddStringBinaryOp(name: string, op: BinaryOp<string>): void {
    this.AddOpToNativeFunc(name, 2, "String", op);
  }

  public static AddListBinaryOp(name: string, op: BinaryOp<List>): void {
    this.AddOpToNativeFunc(name, 2, "List", op);
  }

  public static AddListUnaryOp(name: string, op: UnaryOp<List>): void {
    this.AddOpToNativeFunc(name, 1, "List", op);
  }

  public toString(): string {
    return `Native "${this.name}"`;
  }

  public _prototype: NativeFunctionCall = null;

  public _isPrototype = false;

  public _operationFuncs: Map<ValueType, BinaryOp<unknown> | UnaryOp<unknown>> =
    null;

  public static _nativeFunctions: Record<string, NativeFunctionCall> = null;
}
