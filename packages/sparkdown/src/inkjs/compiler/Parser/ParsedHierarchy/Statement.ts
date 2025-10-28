import { Container as RuntimeContainer } from "../../../engine/Container";
import { InkObject as RuntimeObject } from "../../../engine/Object";
import { FlowBase } from "./Flow/FlowBase";
import { ParsedObject } from "./Object";

export class Statement extends ParsedObject {
  public uuid?: string;

  constructor(uuid: string, topLevelObjects: ParsedObject[]) {
    super();
    this.uuid = uuid;
    this.AddContent(topLevelObjects);
  }

  get typeName(): string {
    return "Paragraph";
  }

  public readonly GenerateRuntimeObject = (): RuntimeObject => {
    const container = new RuntimeContainer();

    if (this.uuid) {
      // Use disallowed character so it's impossible to have a name collision
      container.name = "id-" + this.uuid;
    }

    let contentIdx: number = 0;
    while (this.content !== null && contentIdx < this.content.length) {
      const obj: ParsedObject = this.content[contentIdx]!;

      // Inner knots and stitches
      if (!(obj instanceof FlowBase)) {
        const runtimeObj = obj.runtimeObject;
        if (runtimeObj) {
          container.AddContent(runtimeObj);
        }
      }

      contentIdx += 1;
    }

    return container;
  };
}
