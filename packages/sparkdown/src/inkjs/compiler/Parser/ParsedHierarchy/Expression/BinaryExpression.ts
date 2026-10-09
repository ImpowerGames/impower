import { Expression } from "./Expression";
import { NativeFunctionCall } from "../../../../../runtime/NativeFunctionCall";
import type { ProgramEmitter } from "../../../../../program/ProgramEmitter";
import { KEEP_OR, Op } from "../../../../../program/ProgramInstructions";

export class BinaryExpression extends Expression {
  public readonly leftExpression: Expression;
  public readonly rightExpression: Expression;

  constructor(
    left: Expression,
    right: Expression,
    public opName: string,
  ) {
    super();

    this.leftExpression = this.AddContent(left) as Expression;
    this.rightExpression = this.AddContent(right) as Expression;

    this.opName = opName;
  }

  override get typeName(): string {
    return "BinaryExpression";
  }

  public override PrepareIntoContainer(): void {
    // Generation names the operator by its native name, which is what a
    // divert target compared with `!=` reads afterwards.
    this.opName = this.NativeNameForOp(this.opName);
    this.leftExpression.PrepareIntoContainer();
    this.rightExpression.PrepareIntoContainer();
  }

  // `and` and `or` keep the left value and jump past the right when it
  // decides the result, as `ShortCircuit` does, and the right value adjusts
  // to one value. Any other operator is its native function.
  public override EmitExpression(emitter: ProgramEmitter): void {
    const op = this.NativeNameForOp(this.opName);
    emitter.emitObject(this.leftExpression);
    if (op === "and" || op === "or") {
      const decided = emitter.jump(Op.JumpIfKeep, op === "or" ? KEEP_OR : 0);
      emitter.emitObject(this.rightExpression);
      emitter.emit(Op.Unpack, 1);
      emitter.bind(decided);
      return;
    }
    emitter.emitObject(this.rightExpression);
    emitter.emit(Op.Native, emitter.string(op), 2);
  }

  public readonly NativeNameForOp = (opName: string): string => {
    // Source keywords (`and`/`or`/`not`) flow through verbatim — the native
    // functions are registered under the keyword form so error messages and
    // JSON output match what the user wrote.
    //
    // Symbol aliases that map source-level Luau operators onto the
    // existing ink runtime native names:
    //   - `mod` → `%`: keyword form of the modulo symbol.
    //   - `^`   → `POW`: Luau exponentiation (matching `math.pow`).
    //   - `..` flows through as its OWN native op (a Lua-semantics
    //     special case in `NativeFunctionCall.Call`): it stringifies
    //     number operands (`1 .. 2` is "12", NOT 3 — the old `+`
    //     alias ADDED numeric operands) and raises Lua's "attempt to
    //     concatenate <type> with <type>" on nil/boolean/table
    //     operands (basic.luau line 123 pattern-matches that message
    //     through pcall).
    if (opName === "mod") {
      return "%";
    }
    if (opName === "^") {
      return NativeFunctionCall.Pow;
    }
    if (opName === "~=") {
      // Luau not-equal — the runtime registers the C-style `!=` form.
      return NativeFunctionCall.NotEquals;
    }

    return opName;
  };

  public override readonly toString = (): string =>
    `(${this.leftExpression} ${this.opName} ${this.rightExpression})`;
}
