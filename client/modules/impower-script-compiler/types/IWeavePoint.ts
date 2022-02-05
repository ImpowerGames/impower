import { Container } from "../../impower-script-engine";
import { IIdentifiable, isIdentifiable } from "./IIdentifiable";
import { IObject } from "./IObject";

export interface IWeavePoint extends IIdentifiable, IObject {
  indentationDepth: number;
  runtimeContainer: Container;
  name: string;
}

export const isWeavePoint = (obj: unknown): obj is IWeavePoint => {
  const castObj = obj as IWeavePoint;
  if (typeof castObj !== "object") {
    return false;
  }
  return (
    isIdentifiable(castObj) &&
    castObj.indentationDepth !== undefined &&
    castObj.runtimeContainer !== undefined &&
    castObj.name !== undefined
  );
};
