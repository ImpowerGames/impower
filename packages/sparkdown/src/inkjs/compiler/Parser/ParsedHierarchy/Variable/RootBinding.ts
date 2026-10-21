import { ParsedObject } from "../Object";
import type { ProgramEmitter } from "../../../../../program/ProgramEmitter";
import { Op, ROOT_SLOT } from "../../../../../program/ProgramInstructions";

// The binding a function, a define's method or a closure makes at its entry
// for a name it reads from a `local` of the root frame's own scope that is in
// scope where it is written (`rootBindings`): `BindRoot`, which declares the
// name as a local of the function's frame pointing at that local, when the
// root frame binds it as the function runs, and leaves the name to read the
// global otherwise. A top-level function is a flow of its own that can be
// called before the line that defines it, so it can capture no upvalue when it
// is built, as a closure does (`buildClosureExpression`); it reaches the
// local each time it is called, through the cell a closure over the same
// local shares. It reaches it through the slot of the declaration in scope
// (`slot`, `rootSlotName`), which the declarations of the name after it, in
// this script or another, leave in place; without one, by name in that scope.
export class RootBinding extends ParsedObject {
  constructor(
    public readonly variableName: string,
    public readonly slot: string | null = null,
  ) {
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
    if (this.slot) {
      emitter.emit(Op.BindRoot, emitter.variable(this.slot), 0, ROOT_SLOT);
      return;
    }
    emitter.emit(Op.BindRoot, emitter.variable(this.variableName));
  }

  public override readonly toString = (): string => `^${this.slot ?? this.variableName}`;
}
