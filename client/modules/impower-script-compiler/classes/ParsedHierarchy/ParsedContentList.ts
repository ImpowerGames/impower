import {
  Container,
  RuntimeObject,
  StringBuilder,
} from "../../../impower-script-engine";
import { isText } from "../../types/IText";
import { ParsedObject } from "./ParsedObject";

export class ParsedContentList extends ParsedObject {
  dontFlatten: boolean;

  get runtimeContainer(): Container {
    return this.runtimeObject as Container;
  }

  constructor(...objects: ParsedObject[]) {
    super();
    if (objects != null) this.AddContent(objects);
  }

  TrimTrailingWhitespace(): void {
    for (let i = this.content.length - 1; i >= 0; i -= 1) {
      const text = this.content[i];
      if (!isText(text)) {
        break;
      }

      text.text = text.text.trimEnd();
      if (text.text.length === 0) {
        this.content.splice(i, 1);
      } else break;
    }
  }

  override GenerateRuntimeObject(): RuntimeObject {
    const container = new Container();
    if (this.content != null) {
      this.content.forEach((obj) => {
        const contentObjRuntime = obj.runtimeObject;

        // Some objects (e.g. author warnings) don't generate runtime objects
        if (contentObjRuntime) container.AddContent(contentObjRuntime);
      });
    }

    if (this.dontFlatten) {
      this.story.DontFlattenContainer(container);
    }

    return container;
  }

  override ToString(): string {
    const sb = new StringBuilder();
    sb.Append("ContentList(");
    sb.Append(this.content.map((x) => x.ToString()).join(", "));
    sb.Append(")");
    return sb.ToString();
  }
}
