import { Expression } from "./Expression";
import type { ProgramEmitter } from "../../../../../program/ProgramEmitter";
import { Op, ROOT_SLOT } from "../../../../../program/ProgramInstructions";

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
//
// A closure built in the root frame that reads a `local` the root frame's
// own scope declares more than once captures the binding of the declaration
// in scope where it is written, which that declaration's slot keeps
// (`rootSlot`, `rootSlotName`), rather than the newest binding of the name.
export class VariablePointerExpression extends Expression {
  constructor(
    public readonly variableName: string,
    public readonly rootSlot: string | null = null,
  ) {
    super();
  }

  override get typeName(): string {
    return "VariablePointerExpression";
  }

  /** Nothing but the pointer it pushes. */
  public override PrepareIntoContainer(): void {
  }

  public override EmitExpression(emitter: ProgramEmitter): void {
    if (this.rootSlot) {
      emitter.emit(Op.VarPtr, emitter.variable(this.rootSlot), 0, ROOT_SLOT);
      return;
    }
    emitter.emit(Op.VarPtr, emitter.variable(this.variableName));
  }

  public override readonly toString = (): string =>
    `&${this.rootSlot ?? this.variableName}`;
}
