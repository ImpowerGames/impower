import { Argument } from "./Argument";
import { FlowBase } from "./Flow/FlowBase";
import { FlowLevel } from "./Flow/FlowLevel";
import { Identifier } from "./Identifier";
import { ParsedObject } from "./Object";

export class Stitch extends FlowBase {
  get flowLevel(): FlowLevel {
    return FlowLevel.Stitch;
  }

  constructor(
    name: Identifier,
    topLevelObjects: ParsedObject[],
    args: Argument[],
    isFunction: boolean,
  ) {
    super(name, topLevelObjects, args, isFunction);
  }

  override get typeName(): string {
    return "Stitch";
  }

  // The override below is a property, not a method, so it cannot reach the
  // base implementation through `super`. Capture it here instead.
  private baseToString = FlowBase.prototype.toString;

  public override toString = (): string => {
    return `${
      this.parent !== null ? this.parent + " > " : ""
    }${this.baseToString()}`;
  };
}
