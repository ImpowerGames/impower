import { IObject } from "./IObject";

export interface VariableResolveResult {
  found: boolean;
  isGlobal: boolean;
  isArgument: boolean;
  isTemporary: boolean;
  ownerFlow: IObject;
}
