import { ParsedObject } from "../Object";
import type { ProgramEmitter } from "../../../../../program/ProgramEmitter";
import { Op } from "../../../../../program/ProgramInstructions";

export abstract class Expression extends ParsedObject {
  public outputWhenComplete: boolean = false;

  protected override Prepare(): boolean {
    this.PrepareIntoContainer();
    return true;
  }

  /** The expression's preparation (`ParsedObject.prepare`), which its
   *  parent calls directly: it is heard by no resolver tap and kept by
   *  nothing, so it is prepared again each time it is asked. Each expression
   *  says what its preparation does. */
  public PrepareIntoContainer(): void {
    throw new Error(`${this.typeName} has no preparation for the program path`);
  }

  // (Constants used to be materialized here, once per reference site, by
  // copying a prototype of their runtime objects — each runtime object can
  // only have one parent, so the copy was unavoidable. That approach threw
  // outright for any initializer containing an operator, because
  // `NativeFunctionCall` implements no `Copy()`. Constants are now
  // initialized once as ordinary globals, so nothing needs copying.)

  override get typeName(): string {
    return "Expression";
  }

  // The expression's value, then `Out` when the value is output, as
  // `EvalOutput` follows the expression's runtime objects.
  public override EmitProgram(emitter: ProgramEmitter): void {
    this.EmitExpression(emitter);
    if (this.outputWhenComplete) {
      emitter.emit(Op.Out);
    }
  }

  /** The code that pushes the expression's value. An expression the binary
   *  program does not cover yet names itself. */
  public EmitExpression(emitter: ProgramEmitter): void {
    emitter.unsupported(this.typeName);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public Equals(_obj: ParsedObject): boolean {
    return false;
  }

  public override readonly toString = () => "No string value in JavaScript.";

}
