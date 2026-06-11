import {
  AbstractValue,
  Value,
  ValueType,
  IntValue,
  FloatValue,
  ListValue,
  BoolValue,
  NullValue,
  StringValue,
} from "./Value";
import { StoryException } from "./StoryException";
import { Void } from "./Void";
import { Path } from "./Path";
import { InkList, InkListItem } from "./InkList";
import { InkObject } from "./Object";
import {
  getPureStdLibEntries,
  VARIADIC_ARITY,
  NumericBinary,
  NumericUnary,
  METHOD_DISPATCH,
  METHOD_PREFIX,
  callBuiltinMethod,
  luauNumberToString,
  luauTypeOf,
  parseLuauNumber,
} from "./StdLib";
import { asOrNull, asOrThrows, asBooleanOrThrows } from "./TypeAssertion";
import { isLuauTruthy } from "./LuauTruthiness";
import { throwNullException } from "./NullException";

type BinaryOp<T> = (left: T, right: T) => any;

// Ops that trigger Lua's numeric-string coercion (`1 + "2"` → 3).
// Comparison / logical ops are NOT included — Lua does not coerce
// strings for `<` / `==` etc.
const ARITHMETIC_OP_NAMES: ReadonlySet<string> = new Set([
  "+",
  "-",
  "*",
  "/",
  "%",
  "POW",
  "//",
]);
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
  // Logical operators — named after the source keywords (`not` /
  // `and` / `or`) rather than the ink-style symbols (`!` / `&&` /
  // `||`), since sparkdown's grammar only exposes the keyword form.
  // Removing the layer of aliasing means runtime errors mention the
  // operator the user actually wrote. Ink's membership operators
  // (`?` / `!?`, also briefly exposed in sparkdown as `has` / `hasnt`)
  // are intentionally absent — membership checks go through the
  // method-call dispatch path (`list:find(item)`, `set:contains(sub)`)
  // instead. See docs/runtime/DIVERGENCES.md.
  public static readonly Not: string = "not";
  public static readonly And: string = "and";
  public static readonly Or: string = "or";
  // Lua-truthiness normalize op. Pops one value and pushes
  // `BoolValue(isLuauTruthy(v))`. The compiler wraps Luau `if` /
  // `elseif` / `while` condition expressions in this op so the
  // conditional-divert test (`Story.IsTruthy`, which keeps ink
  // semantics for narrative constructs) only ever sees a real
  // boolean for Luau control flow — `if 0 then` / `if "" then` /
  // `if {} then` are all truthy per Lua, where ink would treat
  // them as falsy.
  public static readonly LuauTruthy: string = "TRUTHY";
  // Lua `..` string concatenation — a first-class op (formerly
  // aliased to `+`, which silently ADDED numeric operands: `1 .. 2`
  // produced 3 instead of "12"). Numbers stringify via
  // `luauNumberToString`; nil / boolean / table operands raise Lua's
  // "attempt to concatenate <type> with <type>" error, which pcall
  // fixtures pattern-match (basic.luau line 123).
  public static readonly Concat: string = "..";
  public static readonly Min: string = "MIN";
  public static readonly Max: string = "MAX";
  public static readonly Pow: string = "POW";
  public static readonly Floor: string = "FLOOR";
  public static readonly Ceiling: string = "CEILING";
  public static readonly Int: string = "INT";
  public static readonly Float: string = "FLOAT";
  // Sparkdown removed `has`/`hasnt` (and the ink-symbol `?`/`!?` aliases)
  // when builtin method dispatch landed. Containment is now expressed via
  // `s:find(sub)` (truthy when found) and `t:find(value)` (1-based
  // position or `nil`). Set intersection — which ink wrote as `^` and
  // sparkdown formerly inherited — was likewise replaced by the
  // `t:intersection(other)` method. The `^` symbol is now Luau
  // exponentiation (aliased to `POW` in `BinaryExpression.NativeNameForOp`).
  // See docs/runtime/METHODS.md for the full method set.
  public static readonly ListMin: string = "LIST_MIN";
  public static readonly ListMax: string = "LIST_MAX";
  public static readonly All: string = "LIST_ALL";
  public static readonly Count: string = "LIST_COUNT";
  public static readonly ValueOfList: string = "LIST_VALUE";
  public static readonly Invert: string = "LIST_INVERT";
  // Luau `#x` length operator. Works on strings (chars), lists (count), and
  // objects (entry count). The runtime dispatches to the registered unary op
  // matching the operand's value type.
  public static readonly Length: string = "LEN";

  // Build a call-site instance pointing at the prototype registered for
  // `functionName`. For variadic prototypes (currently the `__method_*`
  // family), the caller passes `actualArity` so the runtime knows how
  // many parameters to pop off the eval stack. For fixed-arity natives
  // the actualArity argument is ignored — the prototype's arity wins.
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
      // Variadic prototypes (currently the `__method_*` family): the
      // actual arg count for this call site is stored on the instance
      // (`CallWithName` sets it when it constructs the call). Falling
      // back to the prototype's `-1` would make `PopEvaluationStack`
      // pop nothing, so call-site arity is required here.
      if (prototypeArity === VARIADIC_ARITY) {
        return this._numberOfParameters;
      }
      return prototypeArity;
    } else {
      return this._numberOfParameters;
    }
  }

  // Whether this native (call-site or prototype) is variadic. Variadic
  // natives validate arity at runtime inside the method impl rather
  // than at compile time, so FunctionCall.GenerateIntoContainer skips
  // its arity assertion when this returns true.
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

    // Builtin method dispatch (`obj:method(args)`). The lowerer emits
    // `__method_<name>` function names; we route those through
    // `callBuiltinMethod` for receiver-type-aware dispatch, bypassing
    // the operator-style numeric/string/list coercion path below. Each
    // method impl handles its own arity check, so we never consult
    // `this.numberOfParameters` (which is `VARIADIC_ARITY` for these).
    if (this._name !== null && this._name.startsWith(METHOD_PREFIX)) {
      return callBuiltinMethod(this._name, parameters);
    }

    // The call-site instance forwarded to its prototype via the
    // `if (this._prototype) return this._prototype.Call(parameters)`
    // guard above; by here `this` is the prototype itself. For
    // variadic prototypes (`_numberOfParameters === VARIADIC_ARITY`),
    // skip the arity check — the caller already popped the correct
    // number of params using the call-site instance's overridden
    // arity. The prototype just dispatches the type-coerced op,
    // which handles any number of args via the variadic JS spread.
    if (
      this._numberOfParameters !== VARIADIC_ARITY &&
      this.numberOfParameters != parameters.length
    ) {
      throw new Error("Unexpected number of parameters");
    }

    let hasList = false;
    for (let i = 0; i < parameters.length; i++) {
      const p = parameters[i];
      if (p instanceof Void) {
        // Luau-superset semantics: a function with no return values
        // produces `nil` in single-value contexts. The runtime
        // pushes a `Void` sentinel at PopFunction time so multi-
        // return / `select('#', ...)` callers can distinguish
        // "returned no values" from "returned nil"; for ordinary
        // single-value consumers (binary ops, comparisons) we
        // coerce Void to `nil` here so `(function() end)() == nil`
        // evaluates to true instead of erroring.
        parameters[i] = new NullValue();
        continue;
      }
      if (p instanceof ListValue) hasList = true;
    }

    // Luau short-circuit semantics for `and`/`or`. Unlike the other native
    // functions, these return one of the operands rather than a coerced
    // result, so we bypass `CoerceValuesToSingleType` entirely:
    //   `a and b` → `a` if `a` is falsy, else `b`
    //   `a or b`  → `a` if `a` is truthy, else `b`
    // This lets idioms like `cond and "yes" or "no"` work across mixed
    // operand types, matching the keyword-based source syntax users write.
    // The predicate is LUA truthiness (only nil/false falsy) — `0 and x`
    // returns x, `"" or y` returns "", `{} or y` returns the table —
    // NOT ink's `isTruthy` (which treats 0 / "" / empty containers as
    // falsy). basic.luau lines 132-140.
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
      return pickA ? a : b;
    }

    // Luau `not` — always returns a genuine boolean, with Lua
    // truthiness: `not 0` is false, `not ""` is false, `not nil` is
    // true, `not {}` is false. Handled here (before the nil-operand
    // guard and type coercion) because the legacy numeric unary ops
    // returned ink-truthiness Ints, crashed on tables ("Cannot perform
    // operation not on Object"), and silently returned null for nil
    // operands. basic.luau lines 149-151.
    if (
      parameters.length === 1 &&
      this.name === NativeFunctionCall.Not
    ) {
      return new BoolValue(!isLuauTruthy(parameters[0]));
    }

    // Lua-truthiness normalize op (see the `LuauTruthy` declaration).
    if (
      parameters.length === 1 &&
      this.name === NativeFunctionCall.LuauTruthy
    ) {
      return new BoolValue(isLuauTruthy(parameters[0]));
    }

    // Lua arithmetic coercion: a numeric STRING operand mixed with a
    // number converts to a number — `1 + "2"` is 3, `2 * "0xa"` is 20
    // (basic.luau lines 145-146). Without this, ink's max-type
    // coercion would cast the NUMBER to a string and `+` would
    // concatenate. String+string `+` is deliberately left alone (ink
    // narrative content uses it as concat); Lua-style string
    // arithmetic across two strings can revisit that if a fixture
    // demands it. A non-numeric string raises Lua's arithmetic error.
    if (parameters.length === 2 && ARITHMETIC_OP_NAMES.has(this.name)) {
      const p0 = parameters[0];
      const p1 = parameters[1];
      const isNum = (p: InkObject | undefined) =>
        p instanceof IntValue || p instanceof FloatValue;
      const oneStrOneNum =
        (isNum(p0) && p1 instanceof StringValue) ||
        (p0 instanceof StringValue && isNum(p1));
      if (oneStrOneNum) {
        for (let i = 0; i < 2; i++) {
          const p = parameters[i];
          if (p instanceof StringValue) {
            const n = parseLuauNumber(p.value ?? "");
            if (n === null) {
              throw new StoryException(
                `attempt to perform arithmetic (${this.name}) on string`,
              );
            }
            const replaced = Value.Create(n);
            if (replaced !== null) parameters[i] = replaced;
          }
        }
      }
    }

    // Lua `..` concatenation (see the `Concat` declaration). Strings
    // pass through; numbers stringify Lua-style (nan / inf / -0
    // formatting included); anything else — nil, booleans, tables,
    // functions — raises Lua's concat error naming both operand
    // types, e.g. "attempt to concatenate nil with string".
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
        throw new StoryException(
          `attempt to concatenate ${luauTypeOf(parameters[0])} with ${luauTypeOf(parameters[1])}`,
        );
      }
      return new StringValue(l + r);
    }

    if (parameters.length == 2 && hasList) {
      return this.CallBinaryListOperation(parameters);
    }

    // First-class `nil` semantics (matches Luau):
    //   - `nil == nil` is true; `nil == anything-else` is false.
    //   - `nil != X` is the inverse.
    //   - Any other op with a `nil` operand is an error (matches
    //     "attempt to perform arithmetic on a nil value" in Luau).
    // Handled here BEFORE `CoerceValuesToSingleType` because the
    // coercion would try to cast across types via `Cast(ValueType.Null)`
    // and crash — and we want a clean semantic answer for the
    // equality case regardless of types.
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
        throw new StoryException(
          `Attempting to perform ${this.name} on a nil value.`,
        );
      }
    }

    // Zero-args case for variadic ops (e.g. `bit32.band()`,
    // `math.max()` — though the latter errors at runtime). We can't
    // coerce nothing, so dispatch the registered Int variadic op
    // directly with an empty args list and let the impl decide.
    // bit32 ops return the identity element (`band()` → 0xffffffff,
    // `bor() / bxor()` → 0); math.max / math.min raise.
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
    let coercedType = coercedParams[0].valueType;

    if (coercedType == ValueType.Int) {
      return this.CallType<number>(coercedParams);
    } else if (coercedType == ValueType.Float) {
      return this.CallType<number>(coercedParams);
    } else if (coercedType == ValueType.String) {
      return this.CallType<string>(coercedParams);
    } else if (coercedType == ValueType.DivertTarget) {
      return this.CallType<Path>(coercedParams);
    } else if (coercedType == ValueType.List) {
      return this.CallType<InkList>(coercedParams);
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
        // N-ary (arity >= 3) — extract all values and spread into the
        // registered op. The op signature is `(...args: T[]) => any`,
        // which subsumes the unary and binary cases below: calling
        // `op(a)` is the same as `op(...[a])`, and the registered fn
        // sees a fixed arity matching `numberOfParameters` (enforced
        // upstream in `Call()`).
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
          return Value.Create(resultVal, ValueType.Int);
        } else if (this.name === NativeFunctionCall.Float) {
          return Value.Create(resultVal, ValueType.Float);
        } else {
          return Value.Create(resultVal, param1.valueType);
        }
      }
    } else {
      throw new Error(
        "Unexpected number of parameters to NativeFunctionCall: " +
          parametersOfSingleType.length,
      );
    }
  }

  public CallBinaryListOperation(parameters: InkObject[]) {
    if (
      (this.name == "+" || this.name == "-") &&
      parameters[0] instanceof ListValue &&
      parameters[1] instanceof IntValue
    )
      return this.CallListIncrementOperation(parameters);

    let v1 = asOrThrows(parameters[0], Value);
    let v2 = asOrThrows(parameters[1], Value);

    if (
      (this.name == NativeFunctionCall.And ||
        this.name == NativeFunctionCall.Or) &&
      (v1.valueType != ValueType.List || v2.valueType != ValueType.List)
    ) {
      if (this._operationFuncs === null)
        return throwNullException("NativeFunctionCall._operationFuncs");
      let op = this._operationFuncs.get(ValueType.Int) as BinaryOp<number>;
      if (op === null)
        return throwNullException(
          "NativeFunctionCall.CallBinaryListOperation op",
        );
      let result = asBooleanOrThrows(
        op(v1.isTruthy ? 1 : 0, v2.isTruthy ? 1 : 0),
      );
      return new BoolValue(result);
    }

    if (v1.valueType == ValueType.List && v2.valueType == ValueType.List)
      return this.CallType<InkList>([v1, v2]);

    throw new StoryException(
      "Can not call use " +
        this.name +
        " operation on " +
        ValueType[v1.valueType] +
        " and " +
        ValueType[v2.valueType],
    );
  }

  public CallListIncrementOperation(listIntParams: InkObject[]) {
    let listVal = asOrThrows(listIntParams[0], ListValue);
    let intVal = asOrThrows(listIntParams[1], IntValue);

    let resultInkList = new InkList();

    if (listVal.value === null)
      return throwNullException(
        "NativeFunctionCall.CallListIncrementOperation listVal.value",
      );
    for (let [listItemKey, listItemValue] of listVal.value) {
      let listItem = InkListItem.fromSerializedKey(listItemKey);

      if (this._operationFuncs === null)
        return throwNullException("NativeFunctionCall._operationFuncs");
      let intOp = this._operationFuncs.get(ValueType.Int) as BinaryOp<number>;

      if (intVal.value === null)
        return throwNullException(
          "NativeFunctionCall.CallListIncrementOperation intVal.value",
        );
      let targetInt = intOp(listItemValue, intVal.value);

      let itemOrigin = null;
      if (listVal.value.origins === null)
        return throwNullException(
          "NativeFunctionCall.CallListIncrementOperation listVal.value.origins",
        );
      for (let origin of listVal.value.origins) {
        if (origin.name == listItem.originName) {
          itemOrigin = origin;
          break;
        }
      }
      if (itemOrigin != null) {
        let incrementedItem = itemOrigin.TryGetItemWithValue(
          targetInt,
          InkListItem.Null,
        );
        if (incrementedItem.exists)
          resultInkList.Add(incrementedItem.result, targetInt);
      }
    }

    return new ListValue(resultInkList);
  }

  public CoerceValuesToSingleType(parametersIn: InkObject[]) {
    let valType = ValueType.Int;

    let specialCaseList: null | ListValue = null;

    for (let obj of parametersIn) {
      let val = asOrThrows(obj, Value);
      if (val.valueType > valType) {
        valType = val.valueType;
      }

      if (val.valueType == ValueType.List) {
        specialCaseList = asOrNull(val, ListValue);
      }
    }

    let parametersOut = [];

    if (ValueType[valType] == ValueType[ValueType.List]) {
      for (let inkObjectVal of parametersIn) {
        let val = asOrThrows(inkObjectVal, Value);
        if (val.valueType == ValueType.List) {
          parametersOut.push(val);
        } else if (val.valueType == ValueType.Int) {
          let intVal = parseInt(val.valueObject);

          specialCaseList = asOrThrows(specialCaseList, ListValue);
          if (specialCaseList.value === null)
            return throwNullException(
              "NativeFunctionCall.CoerceValuesToSingleType specialCaseList.value",
            );
          let list = specialCaseList.value.originOfMaxItem;

          if (list === null)
            return throwNullException(
              "NativeFunctionCall.CoerceValuesToSingleType list",
            );
          let item = list.TryGetItemWithValue(intVal, InkListItem.Null);
          if (item.exists) {
            let castedValue = new ListValue(item.result, intVal);
            parametersOut.push(castedValue);
          } else
            throw new StoryException(
              "Could not find List item with the value " +
                intVal +
                " in " +
                list.name,
            );
        } else {
          const key = ValueType[val.valueType];
          throw new StoryException(
            "Cannot mix Lists and " + key + " values in this operation",
          );
        }
      }
    } else {
      for (let inkObjectVal of parametersIn) {
        let val = asOrThrows(inkObjectVal, Value);
        let castedValue = val.Cast(valType);
        parametersOut.push(castedValue);
      }
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

      // Int operations
      this.AddIntBinaryOp(this.Add, (x, y) => x + y);
      this.AddIntBinaryOp(this.Subtract, (x, y) => x - y);
      this.AddIntBinaryOp(this.Multiply, (x, y) => x * y);
      // Lua `/` is ALWAYS true (float) division — `1 / 2` is 0.5 even
      // for integer operands (basic.luau line 93). The fractional
      // result auto-promotes to FloatValue via `Value.Create`'s
      // preferred-type fallthrough; `1 / 0` promotes to
      // FloatValue(Infinity), matching Lua's inf. Floor division is
      // the separate `//` op below.
      this.AddIntBinaryOp(this.Divide, (x, y) => x / y);
      // Lua `%` is FLOOR-mod (`a - floor(a/b)*b`), not JS's truncated
      // remainder — they differ for negative operands: `-5 % 3` is 1
      // in Lua, -2 in JS.
      this.AddIntBinaryOp(this.Mod, (x, y) => x - Math.floor(x / y) * y);
      this.AddIntUnaryOp(this.Negate, (x) => -x);

      this.AddIntBinaryOp(this.Equal, (x, y) => x == y);
      this.AddIntBinaryOp(this.Greater, (x, y) => x > y);
      this.AddIntBinaryOp(this.Less, (x, y) => x < y);
      this.AddIntBinaryOp(this.GreaterThanOrEquals, (x, y) => x >= y);
      this.AddIntBinaryOp(this.LessThanOrEquals, (x, y) => x <= y);
      this.AddIntBinaryOp(this.NotEquals, (x, y) => x != y);
      this.AddIntUnaryOp(this.Not, (x) => x == 0);
      // `TRUTHY` and `..` are fully handled by Lua-semantics special
      // cases in `Call` — these registrations only exist so the names
      // are known to `CallWithName` / `CallExistsWithName` (JSON
      // round-trip). The op bodies are unreachable.
      this.AddIntUnaryOp(this.LuauTruthy, (x) => x != 0);
      this.AddIntBinaryOp(this.Concat, (x, y) => `${x}${y}`);

      this.AddIntBinaryOp(this.And, (x, y) => x != 0 && y != 0);
      this.AddIntBinaryOp(this.Or, (x, y) => x != 0 || y != 0);

      this.AddIntBinaryOp(this.Max, (x, y) => Math.max(x, y));
      this.AddIntBinaryOp(this.Min, (x, y) => Math.min(x, y));

      this.AddIntBinaryOp(this.Pow, (x, y) => Math.pow(x, y));
      // Luau `//` floor division (rounds toward -infinity): `1 // 2`
      // is 0, `-3 // 2` is -2. Distinct from `/`, which is always
      // true float division.
      this.AddIntBinaryOp("//", (x, y) => Math.floor(x / y));
      this.AddIntUnaryOp(this.Floor, NativeFunctionCall.Identity);
      this.AddIntUnaryOp(this.Ceiling, NativeFunctionCall.Identity);
      this.AddIntUnaryOp(this.Int, NativeFunctionCall.Identity);
      this.AddIntUnaryOp(this.Float, (x) => x);

      // Float operations
      this.AddFloatBinaryOp(this.Add, (x, y) => x + y);
      this.AddFloatBinaryOp(this.Subtract, (x, y) => x - y);
      this.AddFloatBinaryOp(this.Multiply, (x, y) => x * y);
      this.AddFloatBinaryOp(this.Divide, (x, y) => x / y);
      // Lua floor-mod (see the Int registration above).
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
      // Luau `//` floor division on floats: `7.5 // 2 = 3`, `-7.5 // 2 = -4`.
      this.AddFloatBinaryOp("//", (x, y) => Math.floor(x / y));
      this.AddFloatUnaryOp(this.Floor, (x) => Math.floor(x));
      this.AddFloatUnaryOp(this.Ceiling, (x) => Math.ceil(x));
      this.AddFloatUnaryOp(this.Int, (x) => Math.floor(x));
      this.AddFloatUnaryOp(this.Float, NativeFunctionCall.Identity);

      // String operations
      this.AddStringBinaryOp(this.Add, (x, y) => x + y); // concat
      this.AddStringBinaryOp(this.Equal, (x, y) => x === y);
      this.AddStringBinaryOp(this.NotEquals, (x, y) => !(x === y));

      // Object (table) equality — Lua semantics: reference equality on
      // the underlying Map. Two ObjectValues with identical content
      // but distinct map objects are NOT equal. Without these
      // registrations, `t1 == t2` throws "Cannot perform operation
      // == on Object" at runtime.
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
      // String containment is now via `s:find(sub)` (returns 1-based
      // position or nil) — no `has`/`hasnt` operator registration.

      this.AddListBinaryOp(this.Add, (x, y) => x.Union(y));
      this.AddListBinaryOp(this.Subtract, (x, y) => x.Without(y));
      // List containment / intersection are now method-based — see the
      // `Intersect` constant's removal comment above and `:union` /
      // `:intersection` / `:difference` in `MethodDispatch.ts`. The `^`
      // symbol is reclaimed for Luau exponentiation.

      this.AddListBinaryOp(this.Equal, (x, y) => x.Equals(y));
      this.AddListBinaryOp(this.Greater, (x, y) => x.GreaterThan(y));
      this.AddListBinaryOp(this.Less, (x, y) => x.LessThan(y));
      this.AddListBinaryOp(this.GreaterThanOrEquals, (x, y) =>
        x.GreaterThanOrEquals(y),
      );
      this.AddListBinaryOp(this.LessThanOrEquals, (x, y) =>
        x.LessThanOrEquals(y),
      );
      this.AddListBinaryOp(this.NotEquals, (x, y) => !x.Equals(y));

      this.AddListBinaryOp(this.And, (x, y) => x.Count > 0 && y.Count > 0);
      this.AddListBinaryOp(this.Or, (x, y) => x.Count > 0 || y.Count > 0);

      this.AddListUnaryOp(this.Not, (x) => (x.Count == 0 ? 1 : 0));

      this.AddListUnaryOp(this.Invert, (x) => x.inverse);
      this.AddListUnaryOp(this.All, (x) => x.all);
      this.AddListUnaryOp(this.ListMin, (x) => x.MinAsList());
      this.AddListUnaryOp(this.ListMax, (x) => x.MaxAsList());
      this.AddListUnaryOp(this.Count, (x) => x.Count);
      this.AddListUnaryOp(this.ValueOfList, (x) => x.maxItem.Value);

      // Luau `#` length: number of characters in a string, items in a list,
      // or entries in an object.
      this.AddStringUnaryOp(this.Length, (x) => x.length);
      this.AddListUnaryOp(this.Length, (x) => x.Count);
      // Lua `#t` is the ARRAY-PORTION length (consecutive integer
      // keys from 1), not the total entry count: `#{1,2}` is 2 but
      // `#{a=1,b=2}` is 0 — and `#_G` is 0 (its marker key is
      // non-numeric). Formerly `x.size`, which counted every entry.
      this.AddObjectUnaryOp(this.Length, (x: Map<string, any>) => {
        let n = 0;
        while (x.has(String(n + 1))) n++;
        return n;
      });

      let divertTargetsEqual = (d1: Path, d2: Path) => d1.Equals(d2);
      let divertTargetsNotEqual = (d1: Path, d2: Path) => !d1.Equals(d2);
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

      // Pure Luau stdlib (`math.floor`, `string.contains`, ...). The
      // unified STDLIB registry holds these as entries with a `pure`
      // field — either `true` (shorthand for the classic numeric pair
      // `["Int", "Float"]`) or an explicit operand-type list like
      // `["String"]`. Adding a new pure entry there auto-registers
      // it here under every type the entry accepts, so the runtime's
      // type-dispatcher resolves it regardless of how the caller's
      // value is typed. The wrapper converts the registry's
      // `(_, args)` signature into the operator-style calling
      // convention (`(a)`, `(a, b)`, `(...args)` for n-ary).
      // Lua's `type()` names → concrete `ValueType` slots to register
      // under. `"number"` fans out to both `Int` and `Float` so callers
      // get the same op regardless of how their numeric literal was
      // typed; `"string"` is a single slot.
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

      // Builtin method dispatch (`obj:method(args)` → `__method_<name>`).
      // Each entry from `METHOD_DISPATCH` registers as a variadic native:
      // `numberOfParameters` is set to `VARIADIC_ARITY` so neither the
      // compiler's call-site arity check (FunctionCall.GenerateIntoContainer)
      // nor `Call`'s runtime check rejects calls. The actual arity and
      // receiver-type validation happens inside each method impl. See
      // `MethodDispatch.ts` for the implementations and docs/runtime/METHODS.md for
      // the design rationale.
      for (const methodName of Object.keys(METHOD_DISPATCH)) {
        const fullName = `${METHOD_PREFIX}${methodName}`;
        const native = new NativeFunctionCall(fullName, VARIADIC_ARITY);
        this._nativeFunctions.set(fullName, native);
      }
    }
  }

  public AddOpFuncForType(
    valType: ValueType,
    op: UnaryOp<number | InkList> | BinaryOp<number | string | InkList | Path>,
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

  // N-ary (arity >= 3) numeric op. Used by `math.clamp`, `math.map`,
  // and any future pure-numeric stdlib entry with more than two
  // arguments. `CallType` spreads the coerced values into `op(...)`,
  // so the registered fn receives them in source order.
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

  public static AddListBinaryOp(name: string, op: BinaryOp<InkList>) {
    this.AddOpToNativeFunc(name, 2, ValueType.List, op);
  }
  public static AddListUnaryOp(name: string, op: UnaryOp<InkList>) {
    this.AddOpToNativeFunc(name, 1, ValueType.List, op);
  }

  public static AddObjectUnaryOp(
    name: string,
    op: UnaryOp<Map<string, any>>,
  ) {
    this.AddOpToNativeFunc(name, 1, ValueType.Object, op);
  }

  public toString() {
    return 'Native "' + this.name + '"';
  }

  public _prototype: NativeFunctionCall | null = null;
  public _isPrototype: boolean = false;
  public _operationFuncs: Map<ValueType, BinaryOp<any> | UnaryOp<any>> | null =
    null;
  public static _nativeFunctions: Map<string, NativeFunctionCall> | null = null;
}
