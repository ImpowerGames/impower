import { IStringParserElement } from "../types/IStringParserElement";

export class StringParserElement implements IStringParserElement {
  static _uniqueIdCounter = 0;

  characterIndex = 0;

  characterInLineIndex = 0;

  lineIndex = 0;

  reportedErrorInScope = false;

  uniqueId = 0;

  customFlags = 0;

  CopyFrom(fromElement: StringParserElement): void {
    StringParserElement._uniqueIdCounter += 1;
    this.uniqueId = StringParserElement._uniqueIdCounter;
    this.characterIndex = fromElement.characterIndex;
    this.characterInLineIndex = fromElement.characterInLineIndex;
    this.lineIndex = fromElement.lineIndex;
    this.customFlags = fromElement.customFlags;
    this.reportedErrorInScope = false;
  }

  // Squash is used when succeeding from a rule,
  // so only the state information we wanted to carry forward is
  // retained. e.g. characterIndex and lineIndex are global,
  // however uniqueId is specific to the individual rule,
  // and likewise, custom flags are designed for the temporary
  // state of the individual rule too.
  SquashFrom(fromElement: StringParserElement): void {
    this.characterIndex = fromElement.characterIndex;
    this.characterInLineIndex = fromElement.characterInLineIndex;
    this.lineIndex = fromElement.lineIndex;
    this.reportedErrorInScope = fromElement.reportedErrorInScope;
  }
}
