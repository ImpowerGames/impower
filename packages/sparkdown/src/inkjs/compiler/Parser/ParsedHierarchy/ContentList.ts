import { Container as RuntimeContainer } from "../../../engine/Container";
import { ParsedObject } from "./Object";
import { InkObject as RuntimeObject } from "../../../../runtime/Object";
import { Text } from "./Text";
import { asOrNull } from "../../../../runtime/TypeAssertion";
import type { ProgramEmitter } from "../../../../program/ProgramEmitter";

export class ContentList extends ParsedObject {
  public dontFlatten: boolean = false;

  get runtimeContainer(): RuntimeContainer {
    return this.runtimeObject as RuntimeContainer;
  }

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

  public readonly GenerateRuntimeObject = (): RuntimeObject => {
    const container = new RuntimeContainer();
    if (this.content !== null) {
      for (const obj of this.content) {
        const contentObjRuntime = obj.runtimeObject;

        // Some objects (e.g. author warnings) don't generate runtime objects
        if (contentObjRuntime) {
          container.AddContent(contentObjRuntime);
        }
      }
    }

    if (this.dontFlatten) {
      this.story.DontFlattenContainer(container);
    }

    return container;
  };

  public override toString = (): string => `ContentList(${this.content.join(", ")})`;
}
