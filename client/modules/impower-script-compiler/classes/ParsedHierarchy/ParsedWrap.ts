import { RuntimeObject } from "../../../impower-script-engine";
import { ParsedObject } from "./ParsedObject";

export class ParsedWrap<T extends RuntimeObject> extends ParsedObject {
  _objToWrap: T;

  constructor(objToWrap: T) {
    super();
    this._objToWrap = objToWrap;
  }

  public override GenerateRuntimeObject(): RuntimeObject {
    return this._objToWrap;
  }
}
