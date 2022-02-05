import { RuntimeObject, StringValue } from "../../../impower-script-engine";
import { IText } from "../../types/IText";
import { ParsedObject } from "./ParsedObject";

export class ParsedText extends ParsedObject implements IText {
  text: string = null;

  constructor(str: string) {
    super();
    this.text = str;
  }

  override GenerateRuntimeObject(): RuntimeObject {
    return new StringValue(this.text);
  }

  override ToString(): string {
    return this.text;
  }
}
