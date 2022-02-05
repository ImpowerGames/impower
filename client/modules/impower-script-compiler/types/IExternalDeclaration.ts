import { IIdentifiable } from "./IIdentifiable";
import { INamedContent } from "./INamedContent";
import { IObject } from "./IObject";

export interface IExternalDeclaration
  extends INamedContent,
    IIdentifiable,
    IObject {
  argumentNames: string[];
}
