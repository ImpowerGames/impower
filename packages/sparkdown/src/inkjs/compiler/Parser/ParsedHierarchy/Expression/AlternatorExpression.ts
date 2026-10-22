import { Expression } from "./Expression";
import { ParsedObject } from "../Object";
import type { ProgramEmitter } from "../../../../../program/ProgramEmitter";
import { Op } from "../../../../../program/ProgramInstructions";

// An alternator Luau code uses as a value or writes as a statement
// (`local line = cycle "a" | "b" end`, I-1284, I-1397): the `Sequence` or
// `Conditional` a displayed alternator lowers to, whose arms each push one
// value, the arm's last value or nil, instead of writing it out. Its code is
// the alternator's own, so it selects its arm with the counting of its own
// symbol, as a displayed one does, and the statement that holds it aligns
// that symbol by the alternator's source (`alternatorsOf`, which finds the
// alternator among the expression's content). As a statement
// (`discarded`), the value is popped.
export class AlternatorExpression extends Expression {
  public readonly alternator: ParsedObject;

  constructor(
    alternator: ParsedObject,
    public readonly discarded = false,
  ) {
    super();
    this.alternator = this.AddContent(alternator) as ParsedObject;
  }

  override get typeName(): string {
    return "AlternatorExpression";
  }

  public override PrepareIntoContainer(): void {
    this.alternator.prepare();
  }

  public override EmitExpression(emitter: ProgramEmitter): void {
    emitter.emitObject(this.alternator);
    if (this.discarded) {
      emitter.emit(Op.Pop);
    }
  }

  public override readonly toString = (): string => `(${this.alternator.typeName})`;
}
