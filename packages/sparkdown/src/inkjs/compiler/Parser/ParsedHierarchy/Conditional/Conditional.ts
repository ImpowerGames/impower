import { ConditionalSingleBranch } from "./ConditionalSingleBranch";
import { Expression } from "../Expression/Expression";
import { ParsedObject } from "../Object";
import { Story } from "../Story";
import type {
  ProgramEmitter,
  ProgramLabel,
} from "../../../../../program/ProgramEmitter";
import { Op } from "../../../../../program/ProgramInstructions";

export class Conditional extends ParsedObject {
  constructor(
    public initialCondition: Expression,
    public branches: ConditionalSingleBranch[],
  ) {
    super();

    if (this.initialCondition) {
      this.AddContent(this.initialCondition);
    }

    if (this.branches !== null) {
      this.AddContent(this.branches);
    }
  }

  override get typeName(): string {
    return "Conditional";
  }

  protected override Prepare(): boolean {
    this.initialCondition?.prepare();
    for (const branch of this.branches) {
      branch.prepare();
    }
    return true;
  }

  // One chunk of relative jumps: each branch's test, as a decision, and its
  // content, whose body is a block of the statement, then a jump past the
  // other branches. A switch-like conditional keeps its value on the stack
  // for each branch to compare with, and pops it when no branch took it.
  public override EmitProgram(emitter: ProgramEmitter): void {
    if (this.initialCondition) {
      emitter.emitObject(this.initialCondition);
    }
    const end: ProgramLabel = { offset: -1 };
    for (const branch of this.branches) {
      branch.EmitBranch(emitter, end);
    }
    // With no branch to take the value (a `match` with no arm, which the
    // lowering reports), it is popped as well. A switch-like conditional
    // whose first branch is keyless (`match c | k | x = m end`) keeps it
    // too, where no branch took it.
    const first = this.branches[0];
    if (
      this.initialCondition !== null &&
      (!first ||
        ((first.ownExpression !== null ||
          (first.matchingEquality && !first.isTrueBranch)) &&
          !this.branches[this.branches.length - 1]!.isElse))
    ) {
      emitter.emit(Op.Pop);
    }
    emitter.bind(end);
  }

  public override ResolveWith(context: Story): void {
    if (!this.isPrepared) {
      throw new TypeError("A conditional resolved before it was generated");
    }

    for (const branch of this.branches) {
      if (!branch.isPrepared) {
        throw new Error();
      }
    }

    super.ResolveWith(context);
  }
}
