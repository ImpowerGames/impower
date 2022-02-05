import {
  Container,
  ControlCommand,
  RuntimeObject,
} from "../../../impower-script-engine";
import { IStory } from "../../types/IStory";
import { ParsedConditionalSingleBranch } from "./ParsedConditionalSingleBranch";
import { ParsedExpression } from "./ParsedExpression";
import { ParsedObject } from "./ParsedObject";

export class ParsedConditional extends ParsedObject {
  initialCondition: ParsedExpression = null;

  branches: ParsedConditionalSingleBranch[] = null;

  private _reJoinTarget: ControlCommand = null;

  constructor(
    condition: ParsedExpression,
    branches: ParsedConditionalSingleBranch[]
  ) {
    super();
    this.initialCondition = condition;
    if (this.initialCondition) {
      this.AddContent(condition);
    }

    this.branches = branches;
    if (this.branches != null) {
      this.AddContent(this.branches);
    }
  }

  override GenerateRuntimeObject(): RuntimeObject {
    const container = new Container();

    // Initial condition
    if (this.initialCondition) {
      container.AddContent(this.initialCondition.runtimeObject);
    }

    // Individual branches
    this.branches.forEach((branch) => {
      const branchContainer = branch.runtimeObject;
      container.AddContent(branchContainer);
    });

    // If it's a switch-like conditional, each branch
    // will have a "duplicate" operation for the original
    // switched value. If there's no final else clause
    // and we fall all the way through, we need to clean up.
    // (An else clause doesn't dup but it *does* pop)
    if (
      this.initialCondition != null &&
      this.branches[0].ownExpression != null &&
      !this.branches[this.branches.length - 1].isElse
    ) {
      container.AddContent(ControlCommand.PopEvaluatedValue());
    }

    // Target for branches to rejoin to
    this._reJoinTarget = ControlCommand.NoOp();
    container.AddContent(this._reJoinTarget);

    return container;
  }

  override ResolveReferences(context: IStory): void {
    const pathToReJoin = this._reJoinTarget.path;

    this.branches.forEach((branch) => {
      branch.returnDivert.targetPath = pathToReJoin;
    });

    super.ResolveReferences(context);
  }
}
