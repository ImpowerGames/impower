import { Expression } from "../Expression/Expression";
import { StringExpression } from "../Expression/StringExpression";
import { VariableReference } from "./VariableReference";
import { ParsedObject } from "../Object";
import type { ProgramEmitter } from "../../../../../program/ProgramEmitter";
import { Op } from "../../../../../program/ProgramInstructions";

/** The name a store through the globals table whose key the compiler cannot
 *  name stands as a write of (`_G[k] = v`, I-1394): it may write any global.
 *  No identifier spells it. */
export const ANY_GLOBAL = "_G[]";

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
  /** The target's table and key as the author wrote them, when the lowering
   *  stashed them in temporaries the store reads instead (a multiple
   *  assignment's `_G[k], x = g, 1`, a compound `_G[k] += 1`): which global
   *  the store writes is read from these (`globalWrittenAt`). */
  public writtenTarget: { base: Expression; key: Expression } | null = null;

  constructor(base: Expression, key: Expression, value: Expression) {
    super();
    this.baseExpression = this.AddContent(base) as Expression;
    this.keyExpression = this.AddContent(key) as Expression;
    this.valueExpression = this.AddContent(value) as Expression;
  }

  override get typeName(): string {
    return "StorePropertyAssignment";
  }

  /** The global a store into `table` at `key` writes when `table` is the
   *  globals table (`_G.f = v`, `_G['f'] = v`), which the runtime writes as
   *  the global `f` itself: the key's name when it is a string literal
   *  (I-1091), {@link ANY_GLOBAL} for a key the compiler cannot name
   *  (`_G[k]`, `_G[key()]`), whichever global it names when it runs
   *  (I-1394), and null for any other table. A plain assignment of that name
   *  writes the same global, so a call of a top-level function `f` calls
   *  what it holds. A literal key no name spells (empty, {@link ANY_GLOBAL}
   *  itself, or one starting with `*`, the resolver's keys for whole tables)
   *  writes a global no call reads, and is left out too, so that it stands
   *  for none of those. */
  static globalWrittenAt(
    table: Expression | undefined,
    key: Expression | undefined,
  ): string | null {
    if (
      !(table instanceof VariableReference) ||
      table.path.length !== 1 ||
      table.name !== "_G" ||
      !key
    ) {
      return null;
    }
    if (key instanceof StringExpression && key.isSingleString) {
      const name = key.toString();
      return !name || name === ANY_GLOBAL || name.startsWith("*") ? null : name;
    }
    return ANY_GLOBAL;
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
