import { Identifier } from "./Identifier";
import { IExpression } from "./IExpression";
import { IListDefinition } from "./IListDefinition";
import { IObject } from "./IObject";

export interface IVariableAssignment extends IObject {
  variableIdentifier: Identifier;
  expression: IExpression;
  listDefinition: IListDefinition;
  isGlobalDeclaration: boolean;
  isNewTemporaryDeclaration: boolean;
  variableName: string;
  isDeclaration: boolean;
}

export const isVariableAssignment = (
  obj: unknown
): obj is IVariableAssignment => {
  const castObj = obj as IVariableAssignment;
  if (typeof castObj !== "object") {
    return false;
  }
  return (
    castObj.variableIdentifier !== undefined &&
    castObj.expression !== undefined &&
    castObj.listDefinition !== undefined &&
    castObj.isGlobalDeclaration !== undefined &&
    castObj.isNewTemporaryDeclaration !== undefined &&
    castObj.variableName !== undefined &&
    castObj.isDeclaration !== undefined
  );
};
