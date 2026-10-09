import { ParsedObject } from "./Object";
import { Story } from "./Story";

export class IncludedFile extends ParsedObject {
  constructor(public readonly includedStory: Story | null) {
    super();
  }

  /** Nothing: the story places the included content. */
  protected override Prepare(): boolean {
    return false;
  }

  override get typeName(): string {
    return "IncludedFile";
  }
}
