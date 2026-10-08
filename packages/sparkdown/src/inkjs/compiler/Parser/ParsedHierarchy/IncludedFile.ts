import { ParsedObject } from "./Object";
import { InkObject as RuntimeObject } from "../../../../runtime/Object";
import { Story } from "./Story";

export class IncludedFile extends ParsedObject {
  constructor(public readonly includedStory: Story | null) {
    super();
  }

  /** Nothing: the story places the included content. */
  protected override Prepare(): boolean {
    return false;
  }

  public readonly GenerateRuntimeObject = (): RuntimeObject | null => {
    // Left to the main story to process
    return null;
  };

  override get typeName(): string {
    return "IncludedFile";
  }
}
