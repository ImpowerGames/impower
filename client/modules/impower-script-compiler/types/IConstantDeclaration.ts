import { Identifier } from "./Identifier";
import { IExpression } from "./IExpression";
import { IObject } from "./IObject";

export interface IConstantDeclaration extends IObject {
  expression: IExpression;
  constantIdentifier: Identifier;
}

export const isConstantDeclaration = (
  obj: unknown
): obj is IConstantDeclaration => {
  const castObj = obj as IConstantDeclaration;
  if (typeof castObj !== "object") {
    return false;
  }
  return (
    castObj.expression !== undefined && castObj.constantIdentifier !== undefined
  );
};
