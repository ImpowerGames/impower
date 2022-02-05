import { Argument } from "./Argument";
import { FlowLevel } from "./FlowLevel";
import { IIdentifiable, isIdentifiable } from "./IIdentifiable";
import { INamedContent, isNamedContent } from "./INamedContent";
import { IObject } from "./IObject";
import { IVariableAssignment } from "./IVariableAssignment";
import { VariableResolveResult } from "./VariableResolveResult";

export interface IFlowBase extends IIdentifiable, INamedContent, IObject {
  flowLevel: FlowLevel;
  arguments: Argument[];
  isFunction: boolean;
  hasParameters: boolean;
  variableDeclarations: Record<string, IVariableAssignment>;
  TryAddNewVariableDeclaration: (varDecl: IVariableAssignment) => void;
  ContentWithNameAtLevel: (
    name: string,
    level?: FlowLevel,
    deepSearch?: boolean
  ) => IObject;
  ResolveVariableWithName: (
    varName: string,
    fromNode: IObject
  ) => VariableResolveResult;
}

export const isFlowBase = (obj: unknown): obj is IFlowBase => {
  const castObj = obj as IFlowBase;
  if (typeof castObj !== "object") {
    return false;
  }
  return (
    isIdentifiable(obj) &&
    isNamedContent(obj) &&
    castObj.flowLevel !== undefined &&
    castObj.arguments !== undefined &&
    castObj.isFunction !== undefined &&
    castObj.variableDeclarations !== undefined
  );
};
