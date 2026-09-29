import { ParsedObject } from "./Object";
import { ControlCommand } from "../../../engine/ControlCommand";
import { InkObject as RuntimeObject } from "../../../engine/Object";
import type { ProgramEmitter } from "../../../../program/ProgramEmitter";
import { Op } from "../../../../program/ProgramInstructions";

export class Wrap<T extends RuntimeObject> extends ParsedObject {
  constructor(private _objToWrap: T) {
    super();
  }

  public readonly GenerateRuntimeObject = (): RuntimeObject => this._objToWrap;

  // A block's scope markers are the instructions of the same names. Any
  // other wrapped runtime object is not emitted yet.
  public override EmitProgram(emitter: ProgramEmitter): void {
    const wrapped = this._objToWrap;
    if (wrapped instanceof ControlCommand) {
      if (wrapped.commandType === ControlCommand.CommandType.BeginScope) {
        emitter.emit(Op.BeginScope);
        return;
      }
      if (wrapped.commandType === ControlCommand.CommandType.EndScope) {
        emitter.emit(Op.EndScope);
        return;
      }
    }
    emitter.unsupported(this.typeName);
  }
}
