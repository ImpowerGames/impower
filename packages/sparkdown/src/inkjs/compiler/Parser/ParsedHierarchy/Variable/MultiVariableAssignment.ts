import { Container as RuntimeContainer } from "../../../../engine/Container";
import { ControlCommand as RuntimeControlCommand } from "../../../../engine/ControlCommand";
import { InkObject as RuntimeObject } from "../../../../engine/Object";
import { Expression } from "../Expression/Expression";
import { Identifier } from "../Identifier";
import { ParsedObject } from "../Object";
import { VariableAssignment } from "./VariableAssignment";

// Lua/Luau multi-target assignment: `local a, b, c = expr`.
//
// Runtime emission:
//   <expr.runtimeObject>          // pushes 1 value (possibly a MultiValue)
//   UnpackTuple(N)                // pop 1, push N values in reverse
//   <child VA #1>                 // pop 1, store to first target
//   <child VA #2>                 // pop 1, store to second target
//   ...
//
// Each child `VariableAssignment` is constructed with no expression,
// so its own `GenerateRuntimeObject` emits ONLY the
// `RuntimeVariableAssignment` (no inner eval block). The children
// also handle their own `AddNewVariableDeclaration` registration with
// the closest `FlowBase`, so the compiler tracks the new
// temp-variable names without `MultiVariableAssignment` having to
// reach into FlowBase directly.
//
// Only local (temporary) declarations are supported. Multi-RHS
// positional form (`local a, b = 10, 20`) is currently blocked at
// the grammar level — the first `LuauVariableAssignment` parses as
// `ERROR_INCOMPLETE`. Single-RHS multi-target — the dominant
// multi-return use case (`local i, f = math.modf(x)`) — works.
export class MultiVariableAssignment extends ParsedObject {
  public expression: Expression | null = null;
  public targetAssignments: VariableAssignment[];

  constructor(
    targets: Identifier[],
    expression: Expression | null,
    isTemporaryNewDeclaration: boolean,
  ) {
    super();
    if (expression) {
      this.expression = this.AddContent(expression) as Expression;
    }
    this.targetAssignments = targets.map(
      (id) =>
        this.AddContent(
          new VariableAssignment({
            variableIdentifier: id,
            isTemporaryNewDeclaration,
          }),
        ) as VariableAssignment,
    );
  }

  get typeName(): string {
    return "MultiVariableAssignment";
  }

  public readonly GenerateRuntimeObject = (): RuntimeObject => {
    const container = new RuntimeContainer();
    if (this.expression) {
      container.AddContent(this.expression.runtimeObject);
    }
    container.AddContent(
      RuntimeControlCommand.UnpackTuple(this.targetAssignments.length),
    );
    for (const va of this.targetAssignments) {
      const ro = va.runtimeObject;
      if (ro) container.AddContent(ro);
    }
    return container;
  };
}
