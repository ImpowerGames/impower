import { Container as RuntimeContainer } from "../../../../engine/Container";
import { ControlCommand } from "../../../../engine/ControlCommand";
import { Expression } from "./Expression";
import { NullExpression } from "./NullExpression";
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
// eager generate-then-select is not an option. Reuses the
// `ShortCircuit` ControlCommand family from `and`/`or`:
//
//   [cond ops] [sc:if:2] [thenContainer] [sc:jump:1] [elseContainer]
//
// `sc:if` pops the condition; falsy jumps the content pointer over
// the then-container AND the jump command (skip 2), landing in the
// else-container. Truthy falls through into the then-container, and
// the unconditional `sc:jump:1` after it hops over the
// else-container. Both arm containers are single content elements
// marked DontFlatten so the constant jump distances survive the
// `FlattenContainersIn` post-pass — same trick as BinaryExpression's
// short-circuit RHS. `elseif` chains nest recursively inside the
// else-container.
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

  public readonly GenerateIntoContainer = (container: RuntimeContainer) => {
    this.emitFrom(0, container);
  };

  private emitFrom(index: number, container: RuntimeContainer): void {
    const branch = this.branches[index];
    if (!branch) {
      // No `else` clause (Luau requires one in expression position,
      // but stay stack-balanced if the parse was lenient): the
      // expression's value is nil.
      new NullExpression().GenerateIntoContainer(container);
      return;
    }
    if (branch.condition === null) {
      branch.value.GenerateIntoContainer(container);
      return;
    }
    branch.condition.GenerateIntoContainer(container);
    container.AddContent(ControlCommand.ShortCircuit("if", 2));
    const thenContainer = new RuntimeContainer();
    branch.value.GenerateIntoContainer(thenContainer);
    container.AddContent(thenContainer);
    this.story.DontFlattenContainer(thenContainer);
    container.AddContent(ControlCommand.ShortCircuit("jump", 1));
    const elseContainer = new RuntimeContainer();
    this.emitFrom(index + 1, elseContainer);
    container.AddContent(elseContainer);
    this.story.DontFlattenContainer(elseContainer);
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
