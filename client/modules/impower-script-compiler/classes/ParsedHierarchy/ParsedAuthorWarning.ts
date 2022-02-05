import { RuntimeObject } from "../../../impower-script-engine";
import { ParsedObject } from "./ParsedObject";

export class ParsedAuthorWarning extends ParsedObject {
  warningMessage: string = null;

  constructor(message: string) {
    super();
    this.warningMessage = message;
  }

  override GenerateRuntimeObject(): RuntimeObject {
    this.Warning(this.warningMessage);
    return null;
  }
}
