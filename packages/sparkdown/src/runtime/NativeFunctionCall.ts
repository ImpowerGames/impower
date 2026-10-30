import {
  Value,
  ValueType,
  IntValue,
  FloatValue,
  BoolValue,
  MultiValue,
  NullValue,
  StringValue,
  SymbolRef,
} from "./Value";
import { StoryException, luauRuntimeError } from "./StoryException";
import { Void } from "./Void";
import { InkObject } from "./Object";
import {
  getPureStdLibEntries,
  VARIADIC_ARITY,
  METHOD_DISPATCH,
  METHOD_PREFIX,
  callBuiltinMethod,
  isPureNumberStdLibOp,
  lookupAnyStdLib,
  luauNumberToString,
  stdLibRequiredArgs,
  luauTableBorder,
  luauTypeOf,
  parseLuauNumber,
} from "./StdLib";
import { asOrThrows } from "./TypeAssertion";
import { isLuauTruthy } from "./LuauTruthiness";
import { throwNullException } from "./NullException";

type BinaryOp<T> = (left: T, right: T) => any;

const ARITHMETIC_OP_NAMES: ReadonlySet<string> = new Set([
  "+",
  "-",
  "*",
  "/",
  "%",
  "POW",
  "//",
  "_",
]);

const LUAU_ARITH_NAMES: Readonly<Record<string, string>> = {
  "+": "add",
  "-": "sub",
  "*": "mul",
  "/": "div",
  "//": "idiv",
  "%": "mod",
  POW: "pow",
  _: "unm",
};

const COMPARISON_OP_NAMES: ReadonlySet<string> = new Set([
  "<",
  "<=",
  ">",
  ">=",
]);

const ARITHMETIC_OPERAND_TYPES: ReadonlySet<string> = new Set([
  "number",
  "string",
]);

function luauArithError(op: string, operands: InkObject[]): StoryException {
  const t1 = luauTypeOf(operands[0]);
  const t2 = operands.length > 1 ? luauTypeOf(operands[1]) : t1;
  const name = LUAU_ARITH_NAMES[op] ?? op;
  return luauRuntimeError(
    t1 === t2
      ? `attempt to perform arithmetic (${name}) on ${t1}`
      : `attempt to perform arithmetic (${name}) on ${t1} and ${t2}`,
  );
}

function luauOrderError(op: string, a: InkObject, b: InkObject): StoryException {
  const swapped = op === ">" || op === ">=";
  const [l, r] = swapped ? [b, a] : [a, b];
  const name = op === ">" ? "<" : op === ">=" ? "<=" : op;
  return luauRuntimeError(
    `attempt to compare ${luauTypeOf(l)} ${name} ${luauTypeOf(r)}`,
  );
}

function luauOperandCheck(op: string, operands: InkObject[]): void {
  if (ARITHMETIC_OP_NAMES.has(op)) {
    if (!operands.every((p) => ARITHMETIC_OPERAND_TYPES.has(luauTypeOf(p)))) {
      throw luauArithError(op, operands);
    }
    return;
  }
  if (COMPARISON_OP_NAMES.has(op) && operands.length === 2) {
    const t1 = luauTypeOf(operands[0]);
    const t2 = luauTypeOf(operands[1]);
    if (t1 !== t2 || (t1 !== "number" && t1 !== "string")) {
      throw luauOrderError(op, operands[0]!, operands[1]!);
    }
  }
}
type UnaryOp<T> = (val: T) => any;

export class NativeFunctionCall extends InkObject {
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
  public static readonly Not: string = "not";
  public static readonly And: string = "and";
  public static readonly Or: string = "or";
  public static readonly LuauTruthy: string = "TRUTHY";
  public static readonly Concat: string = "..";
  public static readonly Min: string = "MIN";
  public static readonly Max: string = "MAX";
  public static readonly Pow: string = "POW";
  public static readonly Floor: string = "FLOOR";
  public static readonly Ceiling: string = "CEILING";
  public static readonly Int: string = "INT";
  public static readonly Float: string = "FLOAT";
  public static readonly Length: string = "LEN";

  public static CallWithName(functionName: string, actualArity?: number) {
    const call = new NativeFunctionCall(functionName);
    if (actualArity !== undefined) {
      call._numberOfParameters = actualArity;
    }
    return call;
  }

  public static CallExistsWithName(functionName: string) {
    this.GenerateNativeFunctionsIfNecessary();
    return this._nativeFunctions!.get(functionName);
  }

  get name() {
    if (this._name === null)
      return throwNullException("NativeFunctionCall._name");
    return this._name;
  }
  set name(value: string) {
    this._name = value;
    if (!this._isPrototype) {
      if (NativeFunctionCall._nativeFunctions === null)
        throwNullException("NativeFunctionCall._nativeFunctions");
      else
        this._prototype =
          NativeFunctionCall._nativeFunctions.get(this._name) || null;
    }
  }
  public _name: string | null = null;

  get numberOfParameters() {
    if (this._prototype) {
      const prototypeArity = this._prototype.numberOfParameters;
      if (prototypeArity === VARIADIC_ARITY) {
        return this._numberOfParameters;
      }
      return prototypeArity;
    } else {
      return this._numberOfParameters;
    }
  }

  get isVariadic(): boolean {
    const arity = this._prototype
      ? this._prototype._numberOfParameters
      : this._numberOfParameters;
    return arity === VARIADIC_ARITY;
  }
  set numberOfParameters(value: number) {
    this._numberOfParameters = value;
  }
  public _numberOfParameters: number = 0;

  public Call(parameters: InkObject[]): InkObject | null {
    if (this._prototype) {
      return this._prototype.Call(parameters);
    }

    if (this._name !== null && this._name.startsWith(METHOD_PREFIX)) {
      return callBuiltinMethod(this._name, parameters);
    }

    if (
      this._numberOfParameters !== VARIADIC_ARITY &&
      this.numberOfParameters != parameters.length
    ) {
      throw new Error("Unexpected number of parameters");
    }

    if (this._numberOfParameters === VARIADIC_ARITY && parameters.length > 0) {
      const last = parameters[parameters.length - 1];
      if (last instanceof MultiValue) {
        parameters.splice(parameters.length - 1, 1, ...last.values);
      } else if (last instanceof Void) {
        parameters.pop();
      }
    }

    if (isPureNumberStdLibOp(this.name)) {
      const shortName = this.name.includes(".")
        ? this.name.slice(this.name.lastIndexOf(".") + 1)
        : this.name;
      if (parameters.length === 0 && this.numberOfParameters >= 1) {
        throw new StoryException(`missing argument #1 to '${shortName}'`);
      }
      if (this._numberOfParameters === VARIADIC_ARITY) {
        const entry = lookupAnyStdLib(this.name);
        if (entry && parameters.length < stdLibRequiredArgs(entry)) {
          throw new StoryException(
            `missing argument #${parameters.length + 1} to '${shortName}'`,
          );
        }
      }
      for (let i = 0; i < parameters.length; i++) {
        let p = parameters[i];
        if (p instanceof MultiValue) {
          if (p.values.length === 0) {
            throw new StoryException(
              `missing argument #${i + 1} to '${shortName}'`,
            );
          }
          p = p.values[0]!;
          parameters[i] = p;
        }
        if (p instanceof Void) {
          throw new StoryException(
            `missing argument #${i + 1} to '${shortName}'`,
          );
        }
        if (p instanceof IntValue || p instanceof FloatValue) continue;
        if (p instanceof StringValue) {
          const n = parseLuauNumber(p.value ?? "");
          if (n !== null) {
            const replaced = Value.Create(n);
            if (replaced !== null) {
              parameters[i] = replaced;
              continue;
            }
          }
        }
        throw new StoryException(
          `invalid argument #${i + 1} to '${shortName}' (number expected, got ${luauTypeOf(p)})`,
        );
      }
    }

    for (let i = 0; i < parameters.length; i++) {
      const p = parameters[i];
      if (p instanceof Void) {
        parameters[i] = new NullValue();
        continue;
      }
      if (p instanceof MultiValue) {
        parameters[i] = p.values[0] ?? new NullValue();
        continue;
      }
    }

    if (
      parameters.length === 2 &&
      (this.name === NativeFunctionCall.And ||
        this.name === NativeFunctionCall.Or)
    ) {
      const a = parameters[0];
      const b = parameters[1];
      const aTruthy = isLuauTruthy(a);
      const pickA =
        this.name === NativeFunctionCall.And ? !aTruthy : aTruthy;
      return pickA ? a! : b!;
    }

    if (
      parameters.length === 1 &&
      this.name === NativeFunctionCall.Not
    ) {
      return new BoolValue(!isLuauTruthy(parameters[0]));
    }

    if (
      parameters.length === 1 &&
      this.name === NativeFunctionCall.LuauTruthy
    ) {
      return new BoolValue(isLuauTruthy(parameters[0]));
    }

    if (
      parameters.length === 2 &&
      this.name === NativeFunctionCall.Concat
    ) {
      const coerce = (p: InkObject | undefined): string | null => {
        if (p instanceof StringValue) return p.value ?? "";
        if (p instanceof IntValue || p instanceof FloatValue) {
          return luauNumberToString(p.value ?? 0);
        }
        return null;
      };
      const l = coerce(parameters[0]);
      const r = coerce(parameters[1]);
      if (l === null || r === null) {
        throw luauRuntimeError(
          `attempt to concatenate ${luauTypeOf(parameters[0])} with ${luauTypeOf(parameters[1])}`,
        );
      }
      return new StringValue(l + r);
    }

    if (parameters.length === 2) {
      const aIsNull = parameters[0] instanceof NullValue;
      const bIsNull = parameters[1] instanceof NullValue;
      if (aIsNull || bIsNull) {
        if (this.name === NativeFunctionCall.Equal) {
          return new BoolValue(aIsNull && bIsNull);
        }
        if (this.name === NativeFunctionCall.NotEquals) {
          return new BoolValue(!(aIsNull && bIsNull));
        }
        luauOperandCheck(this.name, parameters);
        throw new StoryException(
          `Attempting to perform ${this.name} on a nil value.`,
        );
      }
    }

    if (parameters.length === 1 && parameters[0] instanceof NullValue) {
      if (this.name === NativeFunctionCall.Length) {
        throw luauRuntimeError("attempt to get length of a nil value");
      }
      if (this.name === NativeFunctionCall.Negate) {
        throw luauRuntimeError(
          "attempt to perform arithmetic (unm) on a nil value",
        );
      }
      throw new StoryException(
        `Attempting to perform ${this.name} on a nil value.`,
      );
    }

    if (parameters.length === 1 && this.name === NativeFunctionCall.Length) {
      const type = luauTypeOf(parameters[0]);
      if (type !== "string" && type !== "table") {
        throw luauRuntimeError(`attempt to get length of a ${type} value`);
      }
    }

    if (
      parameters.length === 2 &&
      (this.name === NativeFunctionCall.Equal ||
        this.name === NativeFunctionCall.NotEquals) &&
      luauTypeOf(parameters[0]) !== luauTypeOf(parameters[1])
    ) {
      return new BoolValue(this.name === NativeFunctionCall.NotEquals);
    }

    luauOperandCheck(this.name, parameters);
    if (ARITHMETIC_OP_NAMES.has(this.name)) {
      const operands = [...parameters];
      for (let i = 0; i < parameters.length; i++) {
        const p = parameters[i];
        if (p instanceof StringValue && p.value !== null) {
          const n = parseLuauNumber(p.value);
          if (n === null) {
            throw luauArithError(this.name, operands);
          }
          const replaced = Value.Create(n);
          if (replaced !== null) parameters[i] = replaced;
        }
      }
    }

    if (parameters.length === 0) {
      if (this._operationFuncs === null)
        return throwNullException("NativeFunctionCall._operationFuncs");
      const opForType = this._operationFuncs.get(ValueType.Int);
      if (!opForType) {
        throw new StoryException(
          `Cannot perform 0-arg ${this.name} (no Int variadic op registered)`,
        );
      }
      const result = (opForType as (...args: any[]) => any)();
      return Value.Create(result);
    }

    let coercedParams = this.CoerceValuesToSingleType(parameters);
    let coercedType = coercedParams[0]!.valueType;

    if (coercedType == ValueType.Int) {
      return this.CallType<number>(coercedParams);
    } else if (coercedType == ValueType.Float) {
      return this.CallType<number>(coercedParams);
    } else if (coercedType == ValueType.String) {
      return this.CallType<string>(coercedParams);
    } else if (coercedType == ValueType.DivertTarget) {
      return this.CallType<SymbolRef>(coercedParams);
    } else if (coercedType == ValueType.Object) {
      return this.CallType<Map<string, any>>(coercedParams);
    }

    return null;
  }

  public CallType<T extends { toString: () => string }>(
    parametersOfSingleType: Array<Value<T>>,
  ) {
    let param1 = asOrThrows(parametersOfSingleType[0], Value);
    let valType = param1.valueType;

    let val1 = param1 as Value<T>;

    let paramCount = parametersOfSingleType.length;

    if (paramCount >= 1) {
      if (this._operationFuncs === null)
        return throwNullException("NativeFunctionCall._operationFuncs");
      let opForTypeObj = this._operationFuncs.get(valType);
      if (!opForTypeObj) {
        const key = ValueType[valType];
        throw new StoryException(
          "Cannot perform operation " + this.name + " on " + key,
        );
      }

      if (paramCount >= 3) {
        const values = parametersOfSingleType.map((p) => {
          const v = (p as Value<T>).value;
          if (v === null)
            return throwNullException(
              "NativeFunctionCall.Call N-ary param value",
            );
          return v;
        });
        const opForType = opForTypeObj as (...args: T[]) => any;
        const resultVal = opForType(...(values as T[]));
        return Value.Create(resultVal);
      }

      if (paramCount == 2) {
        let param2 = asOrThrows(parametersOfSingleType[1], Value);

        let val2 = param2 as Value<T>;

        let opForType = opForTypeObj as BinaryOp<T>;

        if (val1.value === null || val2.value === null)
          return throwNullException("NativeFunctionCall.Call BinaryOp values");
        let resultVal = opForType(val1.value, val2.value);

        return Value.Create(resultVal);
      } else {
        let opForType = opForTypeObj as UnaryOp<T>;

        if (val1.value === null)
          return throwNullException("NativeFunctionCall.Call UnaryOp value");
        let resultVal = opForType(val1.value);

        if (this.name === NativeFunctionCall.Int) {
          return Value.Create(resultVal, ValueType.Int);
        } else if (this.name === NativeFunctionCall.Float) {
          return Value.Create(resultVal, ValueType.Float);
        } else if (typeof resultVal === "number") {
          return Value.Create(resultVal, param1.valueType);
        } else {
          return Value.Create(resultVal);
        }
      }
    } else {
      throw new Error(
        "Unexpected number of parameters to NativeFunctionCall: " +
          parametersOfSingleType.length,
      );
    }
  }

  public CoerceValuesToSingleType(parametersIn: InkObject[]) {
    let valType = ValueType.Int;

    for (let obj of parametersIn) {
      let val = asOrThrows(obj, Value);
      if (val.valueType > valType) {
        valType = val.valueType;
      }
    }

    let parametersOut = [];

    for (let inkObjectVal of parametersIn) {
      let val = asOrThrows(inkObjectVal, Value);
      let castedValue = val.Cast(valType);
      parametersOut.push(castedValue);
    }

    return parametersOut;
  }

  constructor(name: string);
  constructor(name: string, numberOfParameters: number);
  constructor();
  constructor() {
    super();

    if (arguments.length === 0) {
      NativeFunctionCall.GenerateNativeFunctionsIfNecessary();
    } else if (arguments.length === 1) {
      let name = arguments[0];
      NativeFunctionCall.GenerateNativeFunctionsIfNecessary();
      this.name = name;
    } else if (arguments.length === 2) {
      let name = arguments[0];
      let numberOfParameters = arguments[1];

      this._isPrototype = true;
      this.name = name;
      this.numberOfParameters = numberOfParameters;
    }
  }

  public static Identity<T>(t: T): any {
    return t;
  }

  public static GenerateNativeFunctionsIfNecessary() {
    if (this._nativeFunctions == null) {
      this._nativeFunctions = new Map();

      this.AddIntBinaryOp(this.Add, (x, y) => x + y);
      this.AddIntBinaryOp(this.Subtract, (x, y) => x - y);
      this.AddIntBinaryOp(this.Multiply, (x, y) => x * y);
      this.AddIntBinaryOp(this.Divide, (x, y) => x / y);
      this.AddIntBinaryOp(this.Mod, (x, y) => x - Math.floor(x / y) * y);
      this.AddIntUnaryOp(this.Negate, (x) => -x);

      this.AddIntBinaryOp(this.Equal, (x, y) => x == y);
      this.AddIntBinaryOp(this.Greater, (x, y) => x > y);
      this.AddIntBinaryOp(this.Less, (x, y) => x < y);
      this.AddIntBinaryOp(this.GreaterThanOrEquals, (x, y) => x >= y);
      this.AddIntBinaryOp(this.LessThanOrEquals, (x, y) => x <= y);
      this.AddIntBinaryOp(this.NotEquals, (x, y) => x != y);
      this.AddIntUnaryOp(this.Not, (x) => x == 0);
      this.AddIntUnaryOp(this.LuauTruthy, (x) => x != 0);
      this.AddIntBinaryOp(this.Concat, (x, y) => `${x}${y}`);

      this.AddIntBinaryOp(this.And, (x, y) => x != 0 && y != 0);
      this.AddIntBinaryOp(this.Or, (x, y) => x != 0 || y != 0);

      this.AddIntBinaryOp(this.Max, (x, y) => Math.max(x, y));
      this.AddIntBinaryOp(this.Min, (x, y) => Math.min(x, y));

      this.AddIntBinaryOp(this.Pow, (x, y) => Math.pow(x, y));
      this.AddIntBinaryOp("//", (x, y) => Math.floor(x / y));
      this.AddIntUnaryOp(this.Floor, NativeFunctionCall.Identity);
      this.AddIntUnaryOp(this.Ceiling, NativeFunctionCall.Identity);
      this.AddIntUnaryOp(this.Int, NativeFunctionCall.Identity);
      this.AddIntUnaryOp(this.Float, (x) => x);

      this.AddFloatBinaryOp(this.Add, (x, y) => x + y);
      this.AddFloatBinaryOp(this.Subtract, (x, y) => x - y);
      this.AddFloatBinaryOp(this.Multiply, (x, y) => x * y);
      this.AddFloatBinaryOp(this.Divide, (x, y) => x / y);
      this.AddFloatBinaryOp(this.Mod, (x, y) => x - Math.floor(x / y) * y);
      this.AddFloatUnaryOp(this.Negate, (x) => -x);

      this.AddFloatBinaryOp(this.Equal, (x, y) => x == y);
      this.AddFloatBinaryOp(this.Greater, (x, y) => x > y);
      this.AddFloatBinaryOp(this.Less, (x, y) => x < y);
      this.AddFloatBinaryOp(this.GreaterThanOrEquals, (x, y) => x >= y);
      this.AddFloatBinaryOp(this.LessThanOrEquals, (x, y) => x <= y);
      this.AddFloatBinaryOp(this.NotEquals, (x, y) => x != y);
      this.AddFloatUnaryOp(this.Not, (x) => x == 0.0);

      this.AddFloatBinaryOp(this.And, (x, y) => x != 0.0 && y != 0.0);
      this.AddFloatBinaryOp(this.Or, (x, y) => x != 0.0 || y != 0.0);

      this.AddFloatBinaryOp(this.Max, (x, y) => Math.max(x, y));
      this.AddFloatBinaryOp(this.Min, (x, y) => Math.min(x, y));

      this.AddFloatBinaryOp(this.Pow, (x, y) => Math.pow(x, y));
      this.AddFloatBinaryOp("//", (x, y) => Math.floor(x / y));
      this.AddFloatUnaryOp(this.Floor, (x) => Math.floor(x));
      this.AddFloatUnaryOp(this.Ceiling, (x) => Math.ceil(x));
      this.AddFloatUnaryOp(this.Int, (x) => Math.floor(x));
      this.AddFloatUnaryOp(this.Float, NativeFunctionCall.Identity);

      this.AddStringBinaryOp(this.Add, (x, y) => x + y);
      this.AddStringBinaryOp(this.Equal, (x, y) => x === y);
      this.AddStringBinaryOp(this.NotEquals, (x, y) => !(x === y));
      this.AddStringBinaryOp(this.Less, (x, y) => x < y);
      this.AddStringBinaryOp(this.Greater, (x, y) => x > y);
      this.AddStringBinaryOp(this.LessThanOrEquals, (x, y) => x <= y);
      this.AddStringBinaryOp(this.GreaterThanOrEquals, (x, y) => x >= y);

      this.AddOpToNativeFunc(
        this.Equal,
        2,
        ValueType.Object,
        (x: Map<string, any>, y: Map<string, any>) => x === y,
      );
      this.AddOpToNativeFunc(
        this.NotEquals,
        2,
        ValueType.Object,
        (x: Map<string, any>, y: Map<string, any>) => x !== y,
      );

      this.AddStringUnaryOp(this.Length, (x) => x.length);
      this.AddObjectUnaryOp(this.Length, luauTableBorder);

      let divertTargetsEqual = (d1: SymbolRef, d2: SymbolRef) => d1.Equals(d2);
      let divertTargetsNotEqual = (d1: SymbolRef, d2: SymbolRef) =>
        !d1.Equals(d2);
      this.AddOpToNativeFunc(
        this.Equal,
        2,
        ValueType.DivertTarget,
        divertTargetsEqual,
      );
      this.AddOpToNativeFunc(
        this.NotEquals,
        2,
        ValueType.DivertTarget,
        divertTargetsNotEqual,
      );

      const PURE_TYPE_TO_VALUE_TYPES: Record<string, ValueType[]> = {
        number: [ValueType.Int, ValueType.Float],
        string: [ValueType.String],
      };
      for (const [fullName, entry, types] of getPureStdLibEntries()) {
        const valTypes = types.flatMap(
          (t) => PURE_TYPE_TO_VALUE_TYPES[t] ?? [],
        );
        for (const valType of valTypes) {
          if (entry.arity === 1) {
            const unary = (v: any) => entry.fn(null, [v]);
            this.AddOpToNativeFunc(fullName, 1, valType, unary as any);
          } else if (entry.arity === 2) {
            const binary = (a: any, b: any) => entry.fn(null, [a, b]);
            this.AddOpToNativeFunc(fullName, 2, valType, binary as any);
          } else if (entry.arity >= 3) {
            const nary = (...args: any[]) => entry.fn(null, args);
            this.AddOpToNativeFunc(fullName, entry.arity, valType, nary as any);
          } else if (entry.arity === VARIADIC_ARITY) {
            const variadic = (...args: any[]) => entry.fn(null, args);
            this.AddOpToNativeFunc(
              fullName,
              VARIADIC_ARITY,
              valType,
              variadic as any,
            );
          }
        }
      }

      for (const methodName of Object.keys(METHOD_DISPATCH)) {
        const fullName = `${METHOD_PREFIX}${methodName}`;
        const native = new NativeFunctionCall(fullName, VARIADIC_ARITY);
        this._nativeFunctions.set(fullName, native);
      }
    }
  }

  public AddOpFuncForType(
    valType: ValueType,
    op: UnaryOp<number> | BinaryOp<number | string | SymbolRef>,
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
    op: UnaryOp<any> | BinaryOp<any>,
  ): void {
    if (this._nativeFunctions === null)
      return throwNullException("NativeFunctionCall._nativeFunctions");
    let nativeFunc = this._nativeFunctions.get(name);
    if (!nativeFunc) {
      nativeFunc = new NativeFunctionCall(name, args);
      this._nativeFunctions.set(name, nativeFunc);
    }

    nativeFunc.AddOpFuncForType(valType, op);
  }

  public static AddIntBinaryOp(name: string, op: BinaryOp<number>) {
    this.AddOpToNativeFunc(name, 2, ValueType.Int, op);
  }
  public static AddIntUnaryOp(name: string, op: UnaryOp<number>) {
    this.AddOpToNativeFunc(name, 1, ValueType.Int, op);
  }

  public static AddFloatBinaryOp(name: string, op: BinaryOp<number>) {
    this.AddOpToNativeFunc(name, 2, ValueType.Float, op);
  }
  public static AddFloatUnaryOp(name: string, op: UnaryOp<number>) {
    this.AddOpToNativeFunc(name, 1, ValueType.Float, op);
  }

  public static AddIntNaryOp(
    name: string,
    arity: number,
    op: (...args: number[]) => any,
  ) {
    this.AddOpToNativeFunc(name, arity, ValueType.Int, op as any);
  }
  public static AddFloatNaryOp(
    name: string,
    arity: number,
    op: (...args: number[]) => any,
  ) {
    this.AddOpToNativeFunc(name, arity, ValueType.Float, op as any);
  }

  public static AddStringBinaryOp(name: string, op: BinaryOp<string>) {
    this.AddOpToNativeFunc(name, 2, ValueType.String, op);
  }
  public static AddStringUnaryOp(name: string, op: UnaryOp<string>) {
    this.AddOpToNativeFunc(name, 1, ValueType.String, op);
  }


  public static AddObjectUnaryOp(
    name: string,
    op: UnaryOp<Map<string, any>>,
  ) {
    this.AddOpToNativeFunc(name, 1, ValueType.Object, op);
  }

  public override toString() {
    return 'Native "' + this.name + '"';
  }

  public _prototype: NativeFunctionCall | null = null;
  public _isPrototype: boolean = false;
  public _operationFuncs: Map<ValueType, BinaryOp<any> | UnaryOp<any>> | null =
    null;
  public static _nativeFunctions: Map<string, NativeFunctionCall> | null = null;
}
