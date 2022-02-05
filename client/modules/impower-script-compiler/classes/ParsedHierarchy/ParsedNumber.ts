import {
  BoolValue,
  Container,
  FloatValue,
  IntValue,
} from "../../../impower-script-engine";
import { ParsedExpression } from "./ParsedExpression";

export class ParsedNumber extends ParsedExpression {
  value: number | boolean = null;

  constructor(value: number | boolean) {
    super();
    if (typeof value === "number" || typeof value === "boolean") {
      this.value = value;
    } else {
      throw new Error("Unexpected object type in Number");
    }
  }

  override GenerateIntoContainer(container: Container): void {
    if (typeof this.value === "number" && Number.isInteger(this.value)) {
      container.AddContent(new IntValue(this.value));
    } else if (typeof this.value === "number") {
      container.AddContent(new FloatValue(this.value));
    } else if (typeof this.value === "boolean") {
      container.AddContent(new BoolValue(this.value));
    }
  }

  override ToString(): string {
    return this.value.toString();
  }

  // Equals override necessary in order to check for CONST multiple definition equality
  override Equals(obj: unknown): boolean {
    const otherNum = obj as ParsedNumber;
    if (otherNum == null) {
      return false;
    }

    return this.value === otherNum.value;
  }
}
