import { RuntimeObject } from "../../../impower-script-engine";
import { IStory } from "../../types/IStory";
import { ParsedObject } from "./ParsedObject";

export class ParsedIncludedFile extends ParsedObject {
  includedStory: IStory = null;

  IncludedFile(includedStory: IStory): void {
    this.includedStory = includedStory;
  }

  override GenerateRuntimeObject(): RuntimeObject {
    // Left to the main story to process
    return null;
  }
}
