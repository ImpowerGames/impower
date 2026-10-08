import { FlowBase } from "./Flow/FlowBase";
import { ParsedObject } from "./Object";

export class Statement extends ParsedObject {
  public uuid?: string;

  constructor(uuid: string, topLevelObjects: ParsedObject[]) {
    super();
    this.uuid = uuid;
    this.AddContent(topLevelObjects);
  }

  override get typeName(): string {
    return "Paragraph";
  }

  protected override Prepare(): boolean {
    for (const obj of this.content ?? []) {
      if (!(obj instanceof FlowBase)) {
        obj.prepare();
      }
    }
    return true;
  }
}
