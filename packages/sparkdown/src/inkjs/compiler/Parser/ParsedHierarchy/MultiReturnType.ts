import { Container as RuntimeContainer } from "../../../engine/Container";
import { ControlCommand as RuntimeControlCommand } from "../../../engine/ControlCommand";
import { InkObject as RuntimeObject } from "../../../engine/Object";
import { Expression } from "./Expression/Expression";
import { ParsedObject } from "./Object";
import type { ProgramEmitter } from "../../../../program/ProgramEmitter";
import { Op } from "../../../../program/ProgramInstructions";

// Lua/Luau multi-return: `return a, b, c`.
//
// Emits the bytecode for each sub-expression in order (each pushes
// one value onto the eval stack), then a `PackTuple(N)` ControlCommand
// that pops N and pushes one `MultiValue` wrapping them, then
// `PopFunction` to exit the call frame leaving the MultiValue as the
// return.
//
// Single-expression returns continue to use `ReturnType` — there's no
// need to wrap a single value in a MultiValue. Multi-target callers
// (`local a, b = f()`) use `UnpackTuple` to redistribute; single-target
// callers (`local x = f()`) auto-unwrap MultiValue → first inner value
// in the runtime's `VariableAssignment` handler.
export class MultiReturnType extends ParsedObject {
  public expressions: Expression[];

  constructor(expressions: Expression[]) {
    super();
    this.expressions = expressions.map(
      (e) => this.AddContent(e) as Expression,
    );
  }

  override get typeName(): string {
    return "MultiReturnType";
  }

  // The values, packed into one multiple value, then `Return`.
  public override EmitProgram(emitter: ProgramEmitter): void {
    for (const expr of this.expressions) {
      emitter.emitObject(expr);
    }
    emitter.emit(Op.Pack, this.expressions.length);
    emitter.emit(Op.Return);
  }

  public readonly GenerateRuntimeObject = (): RuntimeObject => {
    const container = new RuntimeContainer();
    for (const expr of this.expressions) {
      container.AddContent(expr.runtimeObject);
    }
    container.AddContent(
      RuntimeControlCommand.PackTuple(this.expressions.length),
    );
    container.AddContent(RuntimeControlCommand.PopFunction());
    return container;
  };
}
