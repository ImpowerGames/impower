import { IIdentifiable } from "./IIdentifiable";
import { INamedContent } from "./INamedContent";
import { IObject } from "./IObject";

export interface IListElementDefinition
  extends IIdentifiable,
    INamedContent,
    IObject {
  explicitValue?: number;
  seriesValue: number;
  inInitialList: boolean;
}
