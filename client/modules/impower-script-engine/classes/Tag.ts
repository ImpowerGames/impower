import { RuntimeObject } from "./RuntimeObject";

export class Tag extends RuntimeObject {
  public readonly text: string;

  constructor(tagText: string) {
    super();
    this.text = tagText.toString() || "";
  }

  public toString(): string {
    return `# ${this.text}`;
  }
}
