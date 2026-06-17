import { Container as RuntimeContainer } from "../../../../engine/Container";
import { VariablePointerValue } from "../../../../engine/Value";
import { Expression } from "./Expression";

// A parsed expression that, when emitted into a runtime container,
// produces a `VariablePointerValue` for the named variable. At
// runtime, when this pointer reaches `Story.Step`'s eval-stack push
// path with `contextIndex === -1`, it is automatically resolved to
// the current frame's index AND registered as an "open upvalue" with
// that frame (see `Story.ts` auto-resolve and `CallStack.Pop`).
//
// This is the closure-capture primitive — it lets us put a live
// reference to an outer-scope variable into a closure's
// `__closure_upvals` object, instead of a snapshot value. When the
// outer frame later pops, the pointer is "closed" (the value is
// snapshotted into `closedValue`) so the closure can still read and
// write through it after its lexical parent is gone.
//
// Same wire-format as the by-reference function-argument capture that
// `Divert.ts` emits — both add a `VariablePointerValue(name)` to the
// container and rely on the runtime to canonicalize it. We give it a
// dedicated parsed class so the closure-build lowering can use it as
// an Expression (slottable into `ObjectExpressionEntry.value`).
export class VariablePointerExpression extends Expression {
  constructor(public readonly variableName: string) {
    super();
  }

  get typeName(): string {
    return "VariablePointerExpression";
  }

  public readonly GenerateIntoContainer = (
    container: RuntimeContainer,
  ): void => {
    container.AddContent(new VariablePointerValue(this.variableName));
  };

  public readonly toString = (): string => `&${this.variableName}`;
}
