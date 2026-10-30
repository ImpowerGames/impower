import { InkObject } from "./Object";
import { StoryException } from "./StoryException";
import { asOrThrows } from "./TypeAssertion";
import { tryParseInt, tryParseFloat } from "./TryGetResult";
import { throwNullException } from "./NullException";

export abstract class AbstractValue extends InkObject {
  public abstract get valueType(): ValueType;
  public abstract get isTruthy(): boolean;
  public abstract get valueObject(): any;

  public abstract Cast(newType: ValueType): Value<any>;

  public static Create(
    val: any,
    preferredNumberType?: ValueType,
  ): Value<any> | null {
    if (preferredNumberType) {
      if (
        preferredNumberType === (ValueType.Int as ValueType) &&
        Number.isInteger(Number(val))
      ) {
        return new IntValue(Number(val));
      } else if (
        preferredNumberType === (ValueType.Float as ValueType) &&
        !isNaN(val)
      ) {
        return new FloatValue(Number(val));
      }
    }

    if (val === null) {
      return new NullValue();
    }

    if (typeof val === "number" && Number.isNaN(val)) {
      return new FloatValue(NaN);
    }

    if (typeof val === "boolean") {
      return new BoolValue(Boolean(val));
    }

    if (typeof val === "string") {
      return new StringValue(String(val));
    } else if (Number.isInteger(Number(val))) {
      return new IntValue(Number(val));
    } else if (!isNaN(val)) {
      return new FloatValue(Number(val));
    }

    return null;
  }
  public override Copy() {
    return asOrThrows(AbstractValue.Create(this.valueObject), InkObject);
  }
  public BadCastException(targetType: ValueType) {
    return new StoryException(
      "Can't cast " +
        this.valueObject +
        " from " +
        this.valueType +
        " to " +
        targetType,
    );
  }
}

export abstract class Value<
  T extends { toString: () => string },
> extends AbstractValue {
  public value: T | null;

  constructor(val: T | null) {
    super();
    this.value = val;
  }
  public get valueObject() {
    return this.value;
  }
  public override toString() {
    if (this.value === null) return throwNullException("Value.value");
    return this.value.toString();
  }
}

export class BoolValue extends Value<boolean> {
  constructor(val: boolean) {
    super(val || false);
  }
  public get isTruthy() {
    return Boolean(this.value);
  }
  public get valueType() {
    return ValueType.Bool;
  }

  public Cast(newType: ValueType): Value<any> {
    if (this.value === null) return throwNullException("Value.value");

    if (newType == this.valueType) {
      return this;
    }

    if (newType == ValueType.Int) {
      return new IntValue(this.value ? 1 : 0);
    }

    if (newType == ValueType.Float) {
      return new FloatValue(this.value ? 1.0 : 0.0);
    }

    if (newType == ValueType.String) {
      return new StringValue(this.value ? "true" : "false");
    }

    throw this.BadCastException(newType);
  }

  public override toString() {
    return this.value ? "true" : "false";
  }
}

export class MultiValue extends Value<any> {
  public values: AbstractValue[];
  constructor(values: AbstractValue[]) {
    super(null);
    this.values = values;
  }
  public get valueType(): ValueType {
    return this.values[0]?.valueType ?? ValueType.Null;
  }
  public override get valueObject(): any {
    return this.values[0]?.valueObject ?? null;
  }
  public get isTruthy(): boolean {
    const first = this.values[0];
    return first != null && first.isTruthy;
  }
  public Cast(newType: ValueType): Value<any> {
    if (newType === ValueType.Multi) return this;
    const first = this.values[0];
    if (!first) return new NullValue();
    return first.Cast(newType);
  }
  public override toString(): string {
    return this.values[0]?.toString() ?? "nil";
  }
  public override Copy(): InkObject {
    return new MultiValue(
      this.values.map((v) => v.Copy() as AbstractValue),
    );
  }
}

export class NullValue extends Value<any> {
  constructor() {
    super(null);
  }
  public get isTruthy(): boolean {
    return false;
  }
  public get valueType(): ValueType {
    return ValueType.Null;
  }
  public Cast(newType: ValueType): Value<any> {
    if (newType === this.valueType) return this;
    if (newType === ValueType.String) return new StringValue("nil");
    if (newType === ValueType.Bool) return new BoolValue(false);
    throw this.BadCastException(newType);
  }
  public override toString(): string {
    return "nil";
  }
  public override Copy(): InkObject {
    return new NullValue();
  }
}

export class IntValue extends Value<number> {
  constructor(val: number) {
    super(val ?? 0);
  }
  public get isTruthy() {
    return this.value != 0;
  }
  public get valueType() {
    return ValueType.Int;
  }

  public Cast(newType: ValueType): Value<any> {
    if (this.value === null) return throwNullException("Value.value");

    if (newType == this.valueType) {
      return this;
    }

    if (newType == ValueType.Bool) {
      return new BoolValue(this.value === 0 ? false : true);
    }

    if (newType == ValueType.Float) {
      return new FloatValue(this.value);
    }

    if (newType == ValueType.String) {
      return new StringValue("" + this.value);
    }

    throw this.BadCastException(newType);
  }
}

export class FloatValue extends Value<number> {
  constructor(val: number) {
    super(val ?? 0.0);
  }
  public get isTruthy() {
    return this.value != 0.0;
  }
  public get valueType() {
    return ValueType.Float;
  }

  public Cast(newType: ValueType): Value<any> {
    if (this.value === null) return throwNullException("Value.value");

    if (newType == this.valueType) {
      return this;
    }

    if (newType == ValueType.Bool) {
      return new BoolValue(this.value === 0.0 ? false : true);
    }

    if (newType == ValueType.Int) {
      return new IntValue(this.value);
    }

    if (newType == ValueType.String) {
      return new StringValue("" + this.value);
    }

    throw this.BadCastException(newType);
  }
}

export class StringValue extends Value<string> {
  public _isNewline: boolean;
  public _isInlineWhitespace: boolean;

  constructor(val: string) {
    super(val || "");

    this._isNewline = this.value == "\n";
    this._isInlineWhitespace = true;

    if (this.value === null) return throwNullException("Value.value");

    if (this.value.length > 0) {
      this.value.split("").every((c) => {
        if (c != " " && c != "\t") {
          this._isInlineWhitespace = false;
          return false;
        }

        return true;
      });
    }
  }
  public get valueType() {
    return ValueType.String;
  }
  public get isTruthy() {
    if (this.value === null) return throwNullException("Value.value");
    return this.value.length > 0;
  }
  public get isNewline() {
    return this._isNewline;
  }
  public get isInlineWhitespace() {
    return this._isInlineWhitespace;
  }
  public get isNonWhitespace() {
    return !this.isNewline && !this.isInlineWhitespace;
  }

  public Cast(newType: ValueType): Value<any> {
    if (newType == this.valueType) {
      return this;
    }

    if (newType == ValueType.Int) {
      let parsedInt = tryParseInt(this.value);
      if (parsedInt.exists) {
        return new IntValue(parsedInt.result);
      } else {
        throw this.BadCastException(newType);
      }
    }

    if (newType == ValueType.Float) {
      let parsedFloat = tryParseFloat(this.value);
      if (parsedFloat.exists) {
        return new FloatValue(parsedFloat.result);
      } else {
        throw this.BadCastException(newType);
      }
    }

    throw this.BadCastException(newType);
  }
}

export class SymbolRef {
  constructor(
    public readonly symbol: number,
    public readonly generation: number,
    public readonly name: string | null,
    public readonly label: string,
  ) {}

  public Equals(other: unknown): boolean {
    if (!(other instanceof SymbolRef)) {
      return false;
    }
    if (this.name !== null || other.name !== null) {
      return this.name === other.name;
    }
    return (
      this.symbol === other.symbol && this.generation === other.generation
    );
  }

  public toString(): string {
    return this.label;
  }
}

export class SymbolValue extends Value<SymbolRef> {
  constructor(ref: SymbolRef) {
    super(ref);
  }
  public get valueType() {
    return ValueType.DivertTarget;
  }
  public get ref(): SymbolRef {
    if (this.value === null) return throwNullException("Value.value");
    return this.value;
  }
  public get isTruthy(): never {
    throw new Error("Shouldn't be checking the truthiness of a divert target");
  }

  public Cast(newType: ValueType): Value<any> {
    if (newType == this.valueType) return this;

    throw this.BadCastException(newType);
  }
  public override toString() {
    return "DivertTargetValue(" + this.ref.label + ")";
  }
  public override Copy() {
    return new SymbolValue(this.ref);
  }
}

export class VariablePointerValue extends Value<string> {
  public _contextIndex: number;

  private _closedValue: InkObject | null = null;
  private _isClosed: boolean = false;

  public scopeIndex: number = -1;

  public get closedValue(): InkObject | null {
    return this._closedValue;
  }

  public set closedValue(value: InkObject | null) {
    this._closedValue = value;
    this._isClosed = true;
  }

  public get isClosed(): boolean {
    return this._isClosed;
  }

  public Reopen() {
    this._closedValue = null;
    this._isClosed = false;
  }

  constructor(variableName: string, contextIndex: number = -1) {
    super(variableName);

    this._contextIndex = contextIndex;
  }

  public get contextIndex() {
    return this._contextIndex;
  }
  public set contextIndex(value: number) {
    this._contextIndex = value;
  }
  public get variableName() {
    if (this.value === null) return throwNullException("Value.value");
    return this.value;
  }
  public set variableName(value: string) {
    this.value = value;
  }
  public get valueType() {
    return ValueType.VariablePointer;
  }

  public get isTruthy(): never {
    throw new Error(
      "Shouldn't be checking the truthiness of a variable pointer",
    );
  }

  public Cast(newType: ValueType): Value<any> {
    if (newType == this.valueType) return this;

    throw this.BadCastException(newType);
  }
  public override toString() {
    return "VariablePointerValue(" + this.variableName + ")";
  }
  public override Copy() {
    const copy = new VariablePointerValue(this.variableName, this.contextIndex);
    copy.scopeIndex = this.scopeIndex;
    return copy;
  }
}

export class ObjectValue extends Value<Map<string, AbstractValue>> {
  private _frozen: boolean = false;
  private _metatable: ObjectValue | null = null;

  constructor(entries?: Map<string, AbstractValue> | null) {
    super(entries ?? new Map<string, AbstractValue>());
  }
  public get valueType() {
    return ValueType.Object;
  }
  public get isTruthy() {
    return this.value !== null && this.value.size > 0;
  }
  public get isFrozen(): boolean {
    return this._frozen;
  }
  public Freeze(): void {
    this._frozen = true;
  }
  public RestoreFrozen(frozen: boolean): void {
    this._frozen = frozen;
  }
  public get metatable(): ObjectValue | null {
    return this._metatable;
  }
  public set metatable(mt: ObjectValue | null) {
    this._metatable = mt;
  }
  public Cast(newType: ValueType): Value<any> {
    if (newType == this.valueType) return this;
    if (newType == ValueType.String) {
      return new StringValue(this.toString());
    }
    throw this.BadCastException(newType);
  }
  public override toString(): string {
    if (this.value === null) return "{}";
    const parts: string[] = [];
    for (const [k, v] of this.value) {
      parts.push(`${k} = ${v?.toString() ?? "null"}`);
    }
    return `{${parts.join(", ")}}`;
  }
  public override Copy() {
    if (this.value === null) return new ObjectValue();
    const next = new Map<string, AbstractValue>();
    for (const [k, v] of this.value) {
      const copy = v?.Copy() as AbstractValue | null;
      if (copy) next.set(k, copy);
    }
    const out = new ObjectValue(next);
    out._metatable = this._metatable;
    return out;
  }
}

export function functionText(
  value: unknown,
  labelOf: (ref: SymbolRef) => string = (ref) => ref.label,
): string | null {
  if (value instanceof SymbolValue) return "function: " + labelOf(value.ref);
  if (!(value instanceof ObjectValue) || value.value === null) return null;
  const closure = value.value.get("__closure_fn");
  if (closure !== undefined) {
    const label = closure instanceof SymbolValue ? labelOf(closure.ref) : null;
    return `function: ${label ?? "<closure>"}`;
  }
  const builtin = value.value.get("__stdlib_fn");
  if (builtin !== undefined) {
    return `function: builtin: ${builtin?.valueObject ?? "?"}`;
  }
  return null;
}

export enum ValueType {
  Bool = -1,
  Int = 0,
  Float = 1,
  String = 3,
  DivertTarget = 4,
  VariablePointer = 5,
  Object = 6,
  Null = 7,
  Multi = 8,
}
