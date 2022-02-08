import { Divert } from "../../impower-script-engine";
import { IExpression } from "./IExpression";
import { IObject } from "./IObject";
import { IPath } from "./IPath";

export interface IDivert extends IObject {
  target: IPath;
  targetContent: IObject;
  arguments: IExpression[];
  runtimeDivert: Divert;
  isFunctionCall: boolean;
  isEmpty: boolean;
  isTunnel: boolean;
  isThread: boolean;
  isEnd: boolean;
  isDone: boolean;
}

export const isDivert = (obj: unknown): obj is IDivert => {
  const castObj = obj as IDivert;
  if (typeof castObj !== "object") {
    return false;
  }
  return (
    castObj.target !== undefined &&
    castObj.targetContent !== undefined &&
    castObj.arguments !== undefined &&
    castObj.runtimeDivert !== undefined &&
    castObj.isFunctionCall !== undefined &&
    castObj.isEmpty !== undefined &&
    castObj.isTunnel !== undefined &&
    castObj.isThread !== undefined
  );
};
