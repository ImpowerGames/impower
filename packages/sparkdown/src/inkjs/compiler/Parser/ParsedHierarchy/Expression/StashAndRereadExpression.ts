import { Container as RuntimeContainer } from "../../../../engine/Container";
import { VariableAssignment as RuntimeVariableAssignment } from "../../../../engine/VariableAssignment";
import { VariableReference as RuntimeVariableReference } from "../../../../engine/VariableReference";
import { Expression } from "./Expression";

// Evaluate `inner` ONCE, stash the result in a temp, and leave the
// temp's value on the eval stack. Companion reads elsewhere in the
// same generated expression reference the temp by name instead of
// re-lowering `inner` — Lua's "the receiver is evaluated exactly
// once" rule for method calls (`a:add(10):add(20)` must not run
// `add(10)` twice just because the chain link needs the receiver for
// both the method lookup AND the threaded `self` argument —
// calls.luau line 47).
//
// The temp write uses the same runtime `VariableAssignment` op that
// binds function parameters, so re-executing the expression (loops,
// recursion) simply rebinds the temp in the current frame. The stash
// MUST generate before any companion read — for
// `CallValueExpression` that means riding in the first generated
// arg (args generate before the target expression).
export class StashAndRereadExpression extends Expression {
  public readonly innerExpression: Expression;

  constructor(
    inner: Expression,
    public readonly tempName: string,
  ) {
    super();
    this.innerExpression = this.AddContent(inner) as Expression;
  }

  get typeName(): string {
    return "StashAndReread";
  }

  public readonly GenerateIntoContainer = (
    container: RuntimeContainer,
  ): void => {
    this.innerExpression.GenerateIntoContainer(container);
    container.AddContent(new RuntimeVariableAssignment(this.tempName, true));
    container.AddContent(new RuntimeVariableReference(this.tempName));
  };

  public readonly toString = (): string =>
    `(${this.tempName} = ${this.innerExpression})`;
}
