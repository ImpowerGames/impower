import { Expression } from "./Expression";
import type {
  ProgramEmitter,
  ProgramLabel,
} from "../../../../../program/ProgramEmitter";
import {
  ConstValue,
  JUMP_LUAU,
  Op,
} from "../../../../../program/ProgramInstructions";

export type TernaryBranch = {
  // null condition marks the trailing `else` branch.
  condition: Expression | null;
  value: Expression;
};

// Luau's `if cond then a elseif cond2 then b else c` EXPRESSION form.
// Branches are conditionally evaluated — only the taken arm's value
// ops run (the fixture verifies this with side-effecting arms), so
// eager generate-then-select is not an option.
export class TernaryExpression extends Expression {
  public readonly branches: TernaryBranch[];

  constructor(branches: TernaryBranch[]) {
    super();
    this.branches = branches.map((b) => ({
      condition: b.condition
        ? (this.AddContent(b.condition) as Expression)
        : null,
      value: this.AddContent(b.value) as Expression,
    }));
  }

  override get typeName(): string {
    return "TernaryExpression";
  }

  public override PrepareIntoContainer(): void {
    this.prepareFrom(0);
  }

  private prepareFrom(index: number): void {
    const branch = this.branches[index];
    if (!branch) {
      return;
    }
    if (branch.condition === null) {
      branch.value.PrepareIntoContainer();
      return;
    }
    branch.condition.PrepareIntoContainer();
    branch.value.PrepareIntoContainer();
    this.prepareFrom(index + 1);
  }

  // Each condition tested by Luau truthiness, the taken branch's value, and a
  // jump past the rest, as the `ShortCircuit` "if" and "jump" commands do; a
  // chain with no `else` is nil when no condition holds.
  public override EmitExpression(emitter: ProgramEmitter): void {
    const ends: ProgramLabel[] = [];
    for (const branch of this.branches) {
      if (branch.condition === null) {
        emitter.emitObject(branch.value);
        ends.forEach((end) => emitter.bind(end));
        return;
      }
      emitter.emitObject(branch.condition);
      const next = emitter.jump(Op.JumpIfFalse, JUMP_LUAU);
      emitter.emitObject(branch.value);
      ends.push(emitter.jump(Op.Jump));
      emitter.bind(next);
    }
    emitter.emit(Op.Const, 0, ConstValue.Nil);
    ends.forEach((end) => emitter.bind(end));
  }

  public override readonly toString = (): string =>
    `(if ${this.branches
      .map((b) => (b.condition ? `${b.condition} then ${b.value}` : `else ${b.value}`))
      .join(" ")})`;
}
