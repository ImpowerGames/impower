import { RuntimeObject } from "./RuntimeObject";

export class Tag extends RuntimeObject {
  public readonly text: string;

  constructor(tagText: string) {
    super();
    this.text = tagText.toString() || "";
  }

  override Copy(): Tag {
    const obj = new Tag(this.text);
    return obj;
  }

  public toString(): string {
    return `# ${this.text}`;
  }
}
