import { Container as RuntimeContainer } from "../../../../engine/Container";
import { ControlCommand as RuntimeControlCommand } from "../../../../engine/ControlCommand";
import { InkObject as RuntimeObject } from "../../../../engine/Object";
import { Expression } from "../Expression/Expression";
import { Identifier } from "../Identifier";
import { ParsedObject } from "../Object";
import { VariableAssignment } from "./VariableAssignment";

// Lua/Luau multi-target assignment: `local a, b, c = expr1, expr2, …`.
//
// Runtime emission:
//   <expression-1.runtimeObject>      // pushes 1 value
//   <expression-2.runtimeObject>      // pushes 1 value
//   …
//   PackTuple(M)                      // (only when M > 1) pop M, push 1 MultiValue
//                                     //  with spread-last semantics — multi-return
//                                     //  in the LAST expression flattens, earlier
//                                     //  positions truncate to their first value
//   UnpackTuple(N)                    // pop 1, push N values padded with nil
//   <child VA #1>                     // pop 1, store to first target
//   <child VA #2>                     // pop 1, store to second target
//   …
//
// Both single-RHS (`local a, b = f()`) and multi-RHS (`local a, b = 10, 20`)
// route through this class. For single-RHS, PackTuple is skipped — the
// single expression's MultiValue (if any) goes straight to UnpackTuple
// which already knows how to spread.
//
// Each child `VariableAssignment` is constructed with no expression,
// so its own `GenerateRuntimeObject` emits ONLY the
// `RuntimeVariableAssignment` (no inner eval block). The children
// also handle their own `AddNewVariableDeclaration` registration with
// the closest `FlowBase`.
//
// Only local (temporary) declarations are supported. Global
// multi-target (`store a, b = ...`) is left to a follow-up because
// globals don't emit procedural runtime objects — they register at
// the story level.
export class MultiVariableAssignment extends ParsedObject {
  public expressions: Expression[];
  public targetAssignments: VariableAssignment[];

  constructor(
    targets: Identifier[],
    expressions: Expression[],
    isTemporaryNewDeclaration: boolean,
  ) {
    super();
    this.expressions = expressions.map(
      (e) => this.AddContent(e) as Expression,
    );
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
    for (const expr of this.expressions) {
      container.AddContent(expr.runtimeObject);
    }
    if (this.expressions.length > 1) {
      container.AddContent(
        RuntimeControlCommand.PackTuple(this.expressions.length),
      );
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
