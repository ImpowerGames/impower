import { ParsedObject } from "./Object";
import { ControlCommand } from "../../../engine/ControlCommand";
import { InkObject as RuntimeObject } from "../../../engine/Object";

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
  public readonly GenerateRuntimeObject = (): RuntimeObject => {
    if (this.isStart) {
      return ControlCommand.BeginTag();
    } else {
      return ControlCommand.EndTag();
    }
  };

  public override readonly toString = () => {
    if (this.isStart) {
      return "#StartTag";
    } else {
      return "#EndTag";
    }
  };
}

import { Tag as RuntimeTag } from "../../../engine/Tag";
import { Wrap } from "./Wrap";
export class LegacyTag extends Wrap<RuntimeTag> {
  constructor(tag: RuntimeTag) {
    super(tag);
  }
  override get typeName(): string {
    return "Tag";
  }
}
