import { Container } from "../../impower-script-engine";
import { Identifier } from "./Identifier";
import { IExpression } from "./IExpression";
import { IExternalDeclaration } from "./IExternalDeclaration";
import { IFlowBase } from "./IFlowBase";
import { IListDefinition } from "./IListDefinition";
import { IListElementDefinition } from "./IListElementDefinition";
import { IObject } from "./IObject";
import { SymbolType } from "./SymbolType";
import { VariableResolveResult } from "./VariableResolveResult";

export interface IStory extends IFlowBase {
  constants: Record<string, IExpression>;
  externals: Record<string, IExternalDeclaration>;
  content: IObject[];
  countAllVisits: boolean;
  AddExternal: (decl: IExternalDeclaration) => void;
  ResolveVariableWithName: (
    varName: string,
    fromNode: IObject
  ) => VariableResolveResult;
  CheckForNamingCollisions: (
    obj: IObject,
    identifier: Identifier,
    symbolType: SymbolType,
    typeNameOverride?: string
  ) => void;
  ResolveListItem: (
    listName: string,
    itemName: string,
    source?: IObject
  ) => IListElementDefinition;
  ResolveList: (listName: string) => IListDefinition;
  IsExternal: (namedFuncTarget: string) => boolean;
  DontFlattenContainer: (container: Container) => void;
}

export const isStory = (obj: unknown): obj is IStory => {
  const castObj = obj as IStory;
  if (typeof castObj !== "object") {
    return false;
  }
  return (
    castObj.constants !== undefined &&
    castObj.externals !== undefined &&
    castObj.content !== undefined
  );
};
