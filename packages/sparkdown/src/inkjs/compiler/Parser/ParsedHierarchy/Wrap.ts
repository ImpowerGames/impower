import { ParsedObject } from "./Object";
import { ControlCommand } from "../../../../runtime/ControlCommand";
import { InkObject as RuntimeObject } from "../../../../runtime/Object";
import { Tag as RuntimeTag } from "../../../../runtime/Tag";
import type { ProgramEmitter } from "../../../../program/ProgramEmitter";
import { Op } from "../../../../program/ProgramInstructions";

export class Wrap<T extends RuntimeObject> extends ParsedObject {
  constructor(private _objToWrap: T) {
    super();
  }

  /** The runtime-layer object it stands for: a scope marker or a tag. */
  get wrapped(): T {
    return this._objToWrap;
  }

  /** Nothing but the object it wraps. */
  protected override Prepare(): boolean {
    return this._objToWrap != null;
  }

  // A block's scope markers are the instructions of the same names, and a
  // legacy tag, which an inline alternator's arm writes inside the string
  // of its line, is `Tag` with its text. Any other wrapped runtime object is
  // not emitted yet.
  public override EmitProgram(emitter: ProgramEmitter): void {
    const wrapped = this._objToWrap;
    if (wrapped instanceof RuntimeTag) {
      emitter.emit(Op.Tag, emitter.string(wrapped.text));
      return;
    }
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
