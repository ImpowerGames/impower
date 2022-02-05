import { ListDefinition, RuntimeObject } from "../../impower-script-engine";
import { IIdentifiable } from "./IIdentifiable";
import { IListElementDefinition } from "./IListElementDefinition";
import { IObject } from "./IObject";

export interface IListDefinition extends IIdentifiable, IObject {
  itemDefinitions: IListElementDefinition[];
  runtimeObject: RuntimeObject;
  runtimeListDefinition: ListDefinition;
  variableAssignment: IObject;
  ItemNamed: (itemName: string) => IListElementDefinition;
}
