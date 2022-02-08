import { IDivert } from "./IDivert";
import { IObject } from "./IObject";

export interface IDivertTarget extends IObject {
  divert: IDivert;
}

export const isDivertTarget = (obj: unknown): obj is IDivertTarget => {
  const castObj = obj as IDivertTarget;
  if (typeof castObj !== "object") {
    return false;
  }
  return castObj.divert !== undefined;
};
