import { ErrorHandler } from "../../types/ErrorHandler";
import { ParsedStory } from "../ParsedHierarchy/ParsedStory";
import { StringParser } from "../StringParser";

export class ImpowerParser extends StringParser {
  private _externalErrorHandler: ErrorHandler;

  private _filename: string;

  constructor(
    str: string,
    inkFilename: string = null,
    externalErrorHandler: ErrorHandler = null
  ) {
    super(str);
    this._filename = inkFilename;
  }

  Parse(): ParsedStory {
    const topLevelContent = [];

    // Note we used to return null if there were any errors, but this would mean
    // that include files would return completely empty rather than attempting to
    // continue with errors. Returning an empty include files meant that anything
    // that *did* compile successfully would otherwise be ignored, generating way
    // more errors than necessary.
    return new ParsedStory(topLevelContent);
  }
}
