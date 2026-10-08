import { ParsedObject } from "./Object";
import { ControlCommand } from "../../../../runtime/ControlCommand";
import { InkObject as RuntimeObject } from "../../../../runtime/Object";
import type { ProgramEmitter } from "../../../../program/ProgramEmitter";
import { Op } from "../../../../program/ProgramInstructions";

export class Tag extends ParsedObject {
  public isStart: boolean;
  public inChoice: boolean;

  constructor(isStart: boolean, inChoice: boolean = false) {
    super();
    this.isStart = isStart;
    this.inChoice = inChoice;
  }
  override get typeName(): string {
    return "Tag";
  }
  /** Nothing but the marker it writes. */
  protected override Prepare(): boolean {
    return true;
  }

  public readonly GenerateRuntimeObject = (): RuntimeObject => {
    if (this.isStart) {
      return ControlCommand.BeginTag();
    } else {
      return ControlCommand.EndTag();
    }
  };

  public override EmitProgram(emitter: ProgramEmitter): void {
    emitter.emit(this.isStart ? Op.BeginTag : Op.EndTag);
  }

  public override readonly toString = () => {
    if (this.isStart) {
      return "#StartTag";
    } else {
      return "#EndTag";
    }
  };
}

import { Tag as RuntimeTag } from "../../../../runtime/Tag";
import { Wrap } from "./Wrap";
export class LegacyTag extends Wrap<RuntimeTag> {
  constructor(tag: RuntimeTag) {
    super(tag);
  }
  override get typeName(): string {
    return "Tag";
  }
}
