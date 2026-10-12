import { ParsedObject } from "./Object";
import type { ProgramEmitter } from "../../../../program/ProgramEmitter";
import { Op } from "../../../../program/ProgramInstructions";

export class Text extends ParsedObject {
  constructor(public text: string) {
    super();
  }
  override get typeName(): string {
    return "Text";
  }

  /** Whether the compiler rewrites this text in place after lowering, as it
   *  numbers a continuation's group name by document order. */
  get isCompilerNamed(): boolean {
    return false;
  }

  /** Nothing but the string it writes. */
  protected override Prepare(): boolean {
    return true;
  }

  public override EmitProgram(emitter: ProgramEmitter): void {
    if (this.text === "\n") {
      emitter.emit(Op.Newline);
    } else {
      emitter.emit(Op.Text, emitter.string(this.text));
    }
  }

  public override readonly toString = (): string => this.text;
}
