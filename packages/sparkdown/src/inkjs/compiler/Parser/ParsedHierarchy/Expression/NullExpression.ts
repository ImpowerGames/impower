import { Expression } from "./Expression";
import { ParsedObject } from "../Object";
import type { ProgramEmitter } from "../../../../../program/ProgramEmitter";
import { ConstValue, Op } from "../../../../../program/ProgramInstructions";

// Sparkdown's first-class `nil` literal. Emits a runtime `NullValue`,
// which has its own ValueType (`ValueType.Null`) distinct from `Int`,
// `Float`, etc. Equality semantics: `nil == nil` is true; `nil ==
// anything-else` is false. Falsy in conditionals (`isTruthy` returns
// false). Used by the grammar's `LuauNil` lowering and by anywhere
// the lowerer needs to synthesize a nil sentinel (e.g. the
// iterator-end check in generic-for loops).
export class NullExpression extends Expression {
  override get typeName(): string {
    return "Null";
  }

  /** Nothing but the nil it pushes. */
  public override PrepareIntoContainer(): void {
  }

  public override EmitExpression(emitter: ProgramEmitter): void {
    emitter.emit(Op.Const, 0, ConstValue.Nil);
  }

  public override readonly toString = (): string => "nil";

  public override Equals(obj: ParsedObject): boolean {
    return obj instanceof NullExpression;
  }
}
