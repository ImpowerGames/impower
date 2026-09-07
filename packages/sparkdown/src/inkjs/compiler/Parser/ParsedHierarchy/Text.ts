import { ParsedObject } from "./Object";
import { InkObject as RuntimeObject } from "../../../engine/Object";
import { StringValue } from "../../../engine/Value";

export class Text extends ParsedObject {
  constructor(public text: string) {
    super();
  }
  override get typeName(): string {
    return "Text";
  }

  public readonly GenerateRuntimeObject = (): RuntimeObject =>
    new StringValue(this.text);

  public override readonly toString = (): string => this.text;
}
