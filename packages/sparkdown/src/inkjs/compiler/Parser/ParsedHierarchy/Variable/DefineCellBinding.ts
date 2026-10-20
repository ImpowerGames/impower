import { ParsedObject } from "../Object";
import type { ProgramEmitter } from "../../../../../program/ProgramEmitter";
import { Op, SET_DECLARE, SET_GLOBAL } from "../../../../../program/ProgramInstructions";

// Where a define is written in a function, the binding of a local of that
// function that a method of the define reads. The define's table is built
// when the story starts, before the function runs, so the method's closure
// captures, in place of the local, a pointer at a global the compiler names
// for the define, the method and the local (`defineCellName`), which reads
// nil until the define's line runs. This points that global at the local's
// cell in the running frame: `VarPtr` of the local, then `SetVar` of the
// global with the declare and global flags, which binds the global to the
// pointer itself rather than writing through a pointer it held before. Each
// call of the function points it at that call's local, and the global, which
// a save keeps, holds the cell once the call returns and the cell closes.
export class DefineCellBinding extends ParsedObject {
  constructor(
    public readonly cellName: string,
    public readonly variableName: string,
  ) {
    super();
  }

  override get typeName(): string {
    return "DefineCellBinding";
  }

  /** Nothing but the instructions it writes. */
  protected override Prepare(): boolean {
    return true;
  }

  public override EmitProgram(emitter: ProgramEmitter): void {
    emitter.emit(Op.VarPtr, emitter.variable(this.variableName));
    emitter.emit(
      Op.SetVar,
      emitter.variable(this.cellName),
      0,
      SET_DECLARE | SET_GLOBAL,
    );
  }

  public override readonly toString = (): string =>
    `${this.cellName} = &${this.variableName}`;
}

/** The global a method of a define written in a function reads the local
 *  `local` of that function through (`DefineCellBinding`), by the define's
 *  parent type, its name and the method's name, none of which holds a `$`:
 *  no author can write the name, and only a define of the same name and
 *  parent, whose table is the same one, shares it. */
export const defineCellName = (
  parentName: string,
  defineName: string,
  methodName: string,
  local: string,
): string => `__cell$${parentName}$${defineName}$${methodName}$${local}`;
