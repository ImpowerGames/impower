import { Expression } from "../Expression/Expression";
import { StringExpression } from "../Expression/StringExpression";
import { VariableReference } from "./VariableReference";
import { ParsedObject } from "../Object";
import type { ProgramEmitter } from "../../../../../program/ProgramEmitter";
import { Op } from "../../../../../program/ProgramInstructions";

// Mutating assignment into an existing object property: `obj.field = value`,
// `obj.a.b = value`, etc.
//
// The lowered shape is three expressions plus a `StoreIndex` runtime command:
//   1. `base` — evaluates to the container ObjectValue (e.g. a
//      `VariableReference([obj])` or a chain `IndexExpression(...)` that
//      reaches the final container).
//   2. `key`  — evaluates to a `StringValue` for `.field` access or any
//      indexable value for `[expr]` access.
//   3. `value` — the right-hand-side expression.
//
// Wrapped in `EvalStart`/`EvalEnd`, the runtime evaluates all three, then
// `StoreIndex` pops them and mutates the container in place. Because
// `ObjectValue.value` is a `Map<string, AbstractValue>` shared by reference,
// the change is visible through the original variable.
//
// This is a *statement*: it leaves nothing on the eval stack and has no
// result value. Compound assignments (`obj.field += v`) are desugared by the
// lowerer to read the current value, compute the new one, and store back.
export class StorePropertyAssignment extends ParsedObject {
  public readonly baseExpression: Expression;
  public readonly keyExpression: Expression;
  public readonly valueExpression: Expression;
  /** The assignment is a member or method function's definition
   *  (`function api.f()`, `function api:f()`), which writes the function
   *  into its table. */
  public definesFunction = false;

  constructor(base: Expression, key: Expression, value: Expression) {
    super();
    this.baseExpression = this.AddContent(base) as Expression;
    this.keyExpression = this.AddContent(key) as Expression;
    this.valueExpression = this.AddContent(value) as Expression;
  }

  override get typeName(): string {
    return "StorePropertyAssignment";
  }

  /** The global a store through the globals table writes (`_G.f = v`,
   *  `_G['f'] = v`), which the runtime writes as the global `f` itself; null
   *  for any other store, a key it cannot name before it runs (`_G[k] = v`)
   *  included. A plain assignment of that name writes the same global, so a
   *  call of a top-level function `f` calls what it holds (I-1091). */
  get globalName(): string | null {
    const base = this.baseExpression;
    const key = this.keyExpression;
    if (
      base instanceof VariableReference &&
      base.path.length === 1 &&
      base.name === "_G" &&
      key instanceof StringExpression &&
      key.isSingleString
    ) {
      return key.toString() || null;
    }
    return null;
  }

  public override EmitProgram(emitter: ProgramEmitter): void {
    emitter.emitObject(this.baseExpression);
    emitter.emitObject(this.keyExpression);
    emitter.emitObject(this.valueExpression);
    emitter.emit(Op.StoreIndex);
  }

  protected override Prepare(): boolean {
    this.baseExpression.PrepareIntoContainer();
    this.keyExpression.PrepareIntoContainer();
    this.valueExpression.PrepareIntoContainer();
    return true;
  }

  public override readonly toString = (): string =>
    `${this.baseExpression}[${this.keyExpression}] = ${this.valueExpression}`;
}
