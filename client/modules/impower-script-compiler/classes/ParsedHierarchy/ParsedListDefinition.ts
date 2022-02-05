import {
  List,
  ListDefinition,
  ListItem,
  ListValue,
  RuntimeObject,
} from "../../../impower-script-engine";
import { Identifier } from "../../types/Identifier";
import { IListDefinition } from "../../types/IListDefinition";
import { IStory } from "../../types/IStory";
import { IVariableAssignment } from "../../types/IVariableAssignment";
import { SymbolType } from "../../types/SymbolType";
import { ParsedListElementDefinition } from "./ParsedListElementDefinition";
import { ParsedObject } from "./ParsedObject";

export class ParsedListDefinition
  extends ParsedObject
  implements IListDefinition
{
  identifier: Identifier = null;

  itemDefinitions: ParsedListElementDefinition[] = null;

  variableAssignment: IVariableAssignment = null;

  private _elementsByName: Record<string, ParsedListElementDefinition> = null;

  get runtimeListDefinition(): ListDefinition {
    const allItems: Record<string, number> = {};
    this.itemDefinitions.forEach((e) => {
      if (allItems[e.name] === undefined) allItems[e.name] = e.seriesValue;
      else
        this.Error(
          `List '${this.identifier}' contains dupicate items called '${e.name}'`
        );
    });

    return new ListDefinition(this.identifier?.name, allItems);
  }

  override get typeName(): string {
    return "List definition";
  }

  ItemNamed(itemName: string): ParsedListElementDefinition {
    if (this._elementsByName == null) {
      this._elementsByName = {};
      this.itemDefinitions.forEach((el) => {
        this._elementsByName[el.name] = el;
      });
    }

    const foundElement = this._elementsByName[itemName];
    if (foundElement !== undefined) {
      return foundElement;
    }

    return null;
  }

  constructor(elements: ParsedListElementDefinition[]) {
    super();
    this.itemDefinitions = elements;

    let currentValue = 1;
    this.itemDefinitions.forEach((e) => {
      if (e.explicitValue != null) {
        currentValue = e.explicitValue;
      }

      e.seriesValue = currentValue;

      currentValue += 1;
    });

    this.AddContent(elements);
  }

  override GenerateRuntimeObject(): RuntimeObject {
    const initialValues = new List();
    this.itemDefinitions.forEach((itemDef) => {
      if (itemDef.inInitialList) {
        const item = new ListItem(this.identifier?.name, itemDef.name);
        initialValues[item.serialized()] = itemDef.seriesValue;
      }
    });

    // Set origin name, so
    initialValues.SetInitialOriginName(this.identifier?.name);

    return new ListValue(initialValues);
  }

  override ResolveReferences(context: IStory): void {
    super.ResolveReferences(context);

    context.CheckForNamingCollisions(this, this.identifier, SymbolType.List);
  }
}
