import { ConditionalSingleBranch } from "./ConditionalSingleBranch";
import { Container as RuntimeContainer } from "../../../../engine/Container";
import { ControlCommand as RuntimeControlCommand } from "../../../../../runtime/ControlCommand";
import { Expression } from "../Expression/Expression";
import { ParsedObject } from "../Object";
import { InkObject as RuntimeObject } from "../../../../../runtime/Object";
import { Story } from "../Story";
import type {
  ProgramEmitter,
  ProgramLabel,
} from "../../../../../program/ProgramEmitter";
import { Op } from "../../../../../program/ProgramInstructions";

export class Conditional extends ParsedObject {
  private _reJoinTarget: RuntimeControlCommand | null = null;

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

  public readonly GenerateRuntimeObject = (): RuntimeObject => {
    const container = new RuntimeContainer();

    // Initial condition
    if (this.initialCondition) {
      container.AddContent(this.initialCondition.runtimeObject);
    }

    // Individual branches
    for (const branch of this.branches) {
      const branchContainer = branch.runtimeObject;
      container.AddContent(branchContainer);
    }

    // If it's a switch-like conditional, each branch
    // will have a "duplicate" operation for the original
    // switched value. If there's no final else clause
    // and we fall all the way through, we need to clean up.
    // (An else clause doesn't dup but it *does* pop)
    if (
      this.initialCondition !== null &&
      this.branches[0]!.ownExpression !== null &&
      !this.branches[this.branches.length - 1]!.isElse
    ) {
      container.AddContent(RuntimeControlCommand.PopEvaluatedValue());
    }

    // Target for branches to rejoin to
    this._reJoinTarget = RuntimeControlCommand.NoOp();
    container.AddContent(this._reJoinTarget);

    return container;
  };

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
    if (
      this.initialCondition !== null &&
      this.branches[0]!.ownExpression !== null &&
      !this.branches[this.branches.length - 1]!.isElse
    ) {
      emitter.emit(Op.Pop);
    }
    emitter.bind(end);
  }

  public override ResolveWith(context: Story, program: boolean): void {
    if (!this._reJoinTarget) {
      throw new TypeError("A conditional resolved before it was generated");
    }
    const pathToReJoin = program ? null : this._reJoinTarget.path;

    for (const branch of this.branches) {
      if (!branch.returnDivert) {
        throw new Error();
      }

      if (pathToReJoin) {
        branch.returnDivert.targetPath = pathToReJoin;
      }
    }

    super.ResolveWith(context, program);
  }

  override OnResetRuntime(): void {
    this._reJoinTarget = null;
  }
}
