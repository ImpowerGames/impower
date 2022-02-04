import { ImpowerObject } from "./ImpowerObject";

export class Tag extends ImpowerObject {
  public readonly text: string;

  constructor(tagText: string) {
    super();
    this.text = tagText.toString() || "";
  }

  public toString(): string {
    return `# ${this.text}`;
  }
}
