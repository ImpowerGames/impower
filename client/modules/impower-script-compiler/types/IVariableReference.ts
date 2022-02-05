import { Identifier } from "./Identifier";

export interface IVariableReference {
  name: string;
  pathIdentifiers: Identifier[];
  path: string[];
  isConstantReference: boolean;
  isListItemReference: boolean;
}

export const isVariableReference = (
  obj: unknown
): obj is IVariableReference => {
  const castObj = obj as IVariableReference;
  if (typeof castObj !== "object") {
    return false;
  }
  return (
    castObj.name !== undefined &&
    castObj.pathIdentifiers !== undefined &&
    castObj.path !== undefined &&
    castObj.isConstantReference !== undefined &&
    castObj.isListItemReference !== undefined
  );
};
