import {
  Container,
  ControlCommand,
  StringBuilder,
} from "../../../impower-script-engine";
import { ParsedExpression } from "./ParsedExpression";
import { ParsedObject } from "./ParsedObject";
import { ParsedText } from "./ParsedText";

export class ParsedStringExpression extends ParsedExpression {
  get isSingleString(): boolean {
    if (this.content.length !== 1) {
      return false;
    }

    const c = this.content[0];
    if (!(c instanceof ParsedText)) {
      return false;
    }

    return true;
  }

  constructor(content: ParsedObject[]) {
    super();
    this.AddContent(content);
  }

  override GenerateIntoContainer(container: Container): void {
    container.AddContent(ControlCommand.BeginString());

    this.content.forEach((c) => {
      container.AddContent(c.runtimeObject);
    });

    container.AddContent(ControlCommand.EndString());
  }

  override ToString(): string {
    const sb = new StringBuilder();
    this.content.forEach((c) => {
      sb.Append(c.ToString());
    });
    return sb.ToString();
  }

  // Equals override necessary in order to check for CONST multiple definition equality
  override Equals(obj: unknown): boolean {
    const otherStr = obj as ParsedStringExpression;
    if (otherStr == null) return false;

    // Can only compare direct equality on single strings rather than
    // complex string expressions that contain dynamic logic
    if (!this.isSingleString || !otherStr.isSingleString) {
      return false;
    }

    const thisTxt = this.ToString();
    const otherTxt = otherStr.ToString();
    return thisTxt === otherTxt;
  }
}
