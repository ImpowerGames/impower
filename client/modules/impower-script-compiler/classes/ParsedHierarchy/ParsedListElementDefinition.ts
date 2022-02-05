import { RuntimeObject } from "../../../impower-script-engine";
import { Identifier } from "../../types/Identifier";
import { isIdentifiable } from "../../types/IIdentifiable";
import { IListElementDefinition } from "../../types/IListElementDefinition";
import { IStory } from "../../types/IStory";
import { SymbolType } from "../../types/SymbolType";
import { ParsedObject } from "./ParsedObject";

export class ParsedListElementDefinition
  extends ParsedObject
  implements IListElementDefinition
{
  identifier: Identifier = null;

  explicitValue?: number = null;

  seriesValue = 0;

  inInitialList = false;

  get name(): string {
    return this.identifier?.name;
  }

  private get fullName(): string {
    const parentList = this.parent;
    if (!isIdentifiable(parentList))
      throw new Error("Can't get full name without a parent list");

    return `${parentList.identifier}.${this.name}`;
  }

  override get typeName(): string {
    return "List element";
  }

  constructor(
    identifier: Identifier,
    inInitialList: boolean,
    explicitValue?: number
  ) {
    super();
    this.identifier = identifier;
    this.inInitialList = inInitialList;
    this.explicitValue = explicitValue;
  }

  override GenerateRuntimeObject(): RuntimeObject {
    throw new Error("not implemented");
  }

  override ResolveReferences(context: IStory): void {
    super.ResolveReferences(context);

    context.CheckForNamingCollisions(
      this,
      this.identifier,
      SymbolType.ListItem
    );
  }
}
