import { TryGetResult } from "../types/TryGetResult";
import { ImpowerListItemFromSerializedKey } from "./ImpowerListItem";
import { ListDefinition } from "./ListDefinition";
import { ListValue } from "./ListValue";
import { NullException } from "./NullException";

export class ListDefinitionsOrigin {
  protected _lists: Record<string, ListDefinition>;

  protected _allUnambiguousListValueCache: Record<string, ListValue>;

  constructor(lists: ListDefinition[]) {
    this._lists = {};
    this._allUnambiguousListValueCache = {};

    lists.forEach((list) => {
      this._lists[list.name] = list;

      Object.entries(list.items).forEach(([key, val]) => {
        const item = ImpowerListItemFromSerializedKey(key);
        const listValue = new ListValue(item, val);

        if (!item.itemName) {
          throw new Error("item.itemName is null or undefined.");
        }

        this._allUnambiguousListValueCache[item.itemName] = listValue;
        this._allUnambiguousListValueCache[item.fullName] = listValue;
      });
    });
  }

  get lists(): ListDefinition[] {
    const listOfLists: ListDefinition[] = [];

    Object.entries(this._lists).forEach(([, value]) => {
      listOfLists.push(value);
    });

    return listOfLists;
  }

  public TryListGetDefinition(
    name: string,
    /* out */ def: ListDefinition
  ): TryGetResult<ListDefinition> {
    if (name === null) {
      return { result: def, exists: false };
    }
    // initially, this function returns a boolean and the second parameter is an out.
    const definition = this._lists[name];
    if (!definition) return { result: def, exists: false };

    return { result: definition, exists: true };
  }

  public FindSingleItemListWithName(name: string): ListValue {
    if (name === null) {
      throw new NullException("name");
    }
    const val = this._allUnambiguousListValueCache[name];

    if (typeof val !== "undefined") {
      return val;
    }

    return null;
  }
}
