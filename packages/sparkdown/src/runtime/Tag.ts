import { InkObject } from "./Object";

export class Tag extends InkObject {
  public readonly text: string;

  constructor(tagText: string) {
    super();
    this.text = tagText.toString() || "";
  }

  public override toString(): string {
    return "# " + this.text;
  }
}
