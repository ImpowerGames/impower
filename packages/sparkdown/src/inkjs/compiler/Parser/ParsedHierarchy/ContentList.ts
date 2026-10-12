import { ParsedObject } from "./Object";
import { Text } from "./Text";
import { asOrNull } from "../../../../runtime/TypeAssertion";
import type { ProgramEmitter } from "../../../../program/ProgramEmitter";

export class ContentList extends ParsedObject {
  constructor(objects?: ParsedObject[], ...moreObjects: ParsedObject[]) {
    super();

    if (objects) {
      this.AddContent(objects);
    }

    if (moreObjects) {
      this.AddContent(moreObjects);
    }
  }

  override get typeName(): string {
    return "ContentList";
  }

  // The code of its children in order, with no container
  // (docs/engine/binary-program.md, section 3).
  public override EmitProgram(emitter: ProgramEmitter): void {
    emitter.emitObjects(this.content);
  }

  public readonly TrimTrailingWhitespace = (): void => {
    for (let ii = this.content.length - 1; ii >= 0; --ii) {
      const text = asOrNull(this.content[ii], Text);
      if (text === null) {
        break;
      }

      text.text = text.text.replace(new RegExp(/[ \t]/g), "");
      if (text.text.length === 0) {
        this.content.splice(ii, 1);
      } else {
        break;
      }
    }
  };

  protected override Prepare(): boolean {
    for (const obj of this.content ?? []) {
      obj.prepare();
    }
    return true;
  }

  public override toString = (): string => `ContentList(${this.content.join(", ")})`;
}
