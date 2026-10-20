import { ParsedObject } from "../Object";
import type { ProgramEmitter } from "../../../../../program/ProgramEmitter";
import { Op } from "../../../../../program/ProgramInstructions";

// The binding a function or a define's method written at the top level
// makes at its entry for a name it reads that no scope of its own binds:
// `BindRoot`, which declares the name as a local of the function's frame
// pointing at the top-level local of that name, when the root frame binds
// one as the function runs, and leaves the name to read the global
// otherwise. A top-level function is a flow of its own that can be called
// before the line that defines it, so it can capture no upvalue when it is
// built, as a closure does (`buildClosureExpression`); it reaches the
// top-level local by name each time it is called, through the cell a closure
// over the same local shares.
export class RootBinding extends ParsedObject {
  constructor(public readonly variableName: string) {
    super();
  }

  override get typeName(): string {
    return "RootBinding";
  }

  /** Nothing but the instruction it writes. */
  protected override Prepare(): boolean {
    return true;
  }

  public override EmitProgram(emitter: ProgramEmitter): void {
    emitter.emit(Op.BindRoot, emitter.variable(this.variableName));
  }

  public override readonly toString = (): string => `^${this.variableName}`;
}
