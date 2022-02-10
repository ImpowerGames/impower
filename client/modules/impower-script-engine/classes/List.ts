import { IStory } from "../types/IStory";
import { ListDefinition } from "./ListDefinition";
import {
  ListItem,
  ListItemFromSerializedKey,
  SerializedListItem,
} from "./ListItem";
import { NullException } from "./NullException";
import { StringBuilder } from "./StringBuilder";

export class List extends Map<SerializedListItem, number> {
  public origins: ListDefinition[] = null;

  public _originNames: string[] = [];

  constructor();

  constructor(otherList: List);

  constructor(singleOriginListName: string, originStory: IStory);

  constructor(singleElement: KeyValuePair<ListItem, number>);

  constructor(...args) {
    // Trying to be smart here, this emulates the constructor inheritance found
    // in the original code, but only if otherList is an InkList. IIFE FTW.
    super(args[0] instanceof List ? args[0] : []);

    if (args[0] instanceof List) {
      const otherList = args[0] as List;

      this._originNames = otherList.originNames;
      if (otherList.origins !== null) {
        this.origins = otherList.origins.slice();
      }
    } else if (typeof args[0] === "string") {
      const singleOriginListName = args[0] as string;
      const originStory = args[1] as IStory;
      this.SetInitialOriginName(singleOriginListName);

      if (originStory.listDefinitions === null) {
        throw new NullException("originStory.listDefinitions");
      }
      const def = originStory.listDefinitions.TryListGetDefinition(
        singleOriginListName,
        null
      );
      if (def.exists) {
        // Throwing now, because if the value is `null` it will
        // eventually throw down the line.
        if (def.result === null) {
          throw new NullException("def.result");
        }
        this.origins = [def.result];
      } else {
        throw new Error(
          `InkList origin could not be found in story when constructing new list: ${singleOriginListName}`
        );
      }
    } else if (
      typeof args[0] === "object" &&
      args[0].Key !== undefined &&
      args[0].Value !== undefined
    ) {
      const singleElement = args[0] as KeyValuePair<ListItem, number>;
      this.Add(singleElement.Key, singleElement.Value);
    }
  }

  public static FromString(myListItem: string, originStory: IStory): List {
    const listValue =
      originStory.listDefinitions?.FindSingleItemListWithName(myListItem);
    if (listValue) {
      if (listValue.value === null) {
        throw new NullException("listValue.value");
      }
      return new List(listValue.value);
    }
    throw new Error(
      `Could not find the InkListItem from the string '${myListItem}' to create an InkList because it doesn't exist in the original list definition in ink.`
    );
  }

  public AddItem(itemOrItemName: ListItem | string): void {
    if (itemOrItemName instanceof ListItem) {
      const item = itemOrItemName;

      if (item.originName == null) {
        this.AddItem(item.itemName);
        return;
      }

      if (this.origins === null) {
        throw new NullException("this.origins");
      }

      this.origins.forEach((origin) => {
        if (origin.name === item.originName) {
          const intVal = origin.TryGetValueForItem(item, 0);
          if (intVal.exists) {
            this.Add(item, intVal.result);
            return;
          }
          throw new Error(
            `Could not add the item ${item} to this list because it doesn't exist in the original list definition in ink.`
          );
        }
      });

      throw new Error(
        "Failed to add item to list because the item was from a new list definition that wasn't previously known to this list. Only items from previously known lists can be used, so that the int value can be found."
      );
    } else {
      const itemName = itemOrItemName as string;

      let foundListDef: ListDefinition = null;

      if (this.origins === null) {
        throw new NullException("this.origins");
      }

      this.origins.forEach((origin) => {
        if (itemName === null) {
          throw new NullException("itemName");
        }

        if (origin.ContainsItemWithName(itemName)) {
          if (foundListDef != null) {
            throw new Error(
              `Could not add the item ${itemName} to this list because it could come from either ${origin.name} or ${foundListDef.name}`
            );
          } else {
            foundListDef = origin;
          }
        }
      });

      if (foundListDef == null)
        throw new Error(
          `Could not add the item ${itemName} to this list because it isn't known to any list definitions previously associated with this list.`
        );

      const item = new ListItem(foundListDef.name, itemName);
      const itemVal = foundListDef.ValueForItem(item);
      this.Add(item, itemVal);
    }
  }

  public ContainsItemNamed(itemName: string): boolean {
    const keys = Array.from(this.keys());
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      const item = ListItemFromSerializedKey(key);
      if (item.itemName === itemName) {
        return true;
      }
    }

    return false;
  }

  public ContainsKey(key: ListItem): boolean {
    return this.has(key.serialized());
  }

  public Add(key: ListItem, value: number): void {
    const serializedKey = key.serialized();
    if (this.has(serializedKey)) {
      // Throw an exception to match the C# behavior.
      throw new Error(`The Map already contains an entry for ${key}`);
    }
    this.set(serializedKey, value);
  }

  public Remove(key: ListItem): boolean {
    return this.delete(key.serialized());
  }

  get Count(): number {
    return this.size;
  }

  get originOfMaxItem(): ListDefinition {
    if (this.origins == null) return null;

    const maxOriginName = this.maxItem.Key.originName;
    let result = null;
    this.origins.every((origin) => {
      if (origin.name === maxOriginName) {
        result = origin;
        return false;
      }
      return true;
    });

    return result;
  }

  get originNames(): string[] {
    if (this.Count > 0) {
      if (this._originNames == null && this.Count > 0) this._originNames = [];
      else {
        if (!this._originNames) this._originNames = [];
        this._originNames.length = 0;
      }

      this.forEach((value, key) => {
        const item = ListItemFromSerializedKey(key);
        if (item.originName === null) {
          throw new NullException("item.originName");
        }
        this._originNames.push(item.originName);
      });
    }

    return this._originNames as string[];
  }

  public SetInitialOriginName(initialOriginName: string): void {
    this._originNames = [initialOriginName];
  }

  public SetInitialOriginNames(initialOriginNames: string[]): void {
    if (initialOriginNames == null) {
      this._originNames = null;
    } else {
      this._originNames = initialOriginNames.slice(); // store a copy
    }
  }

  get maxItem(): KeyValuePair<ListItem, number> {
    let max: KeyValuePair<ListItem, number> = {
      Key: ListItem.Null,
      Value: 0,
    };
    this.forEach((value, key) => {
      const item = ListItemFromSerializedKey(key);
      if (max.Key.isNull || value > max.Value) {
        max = { Key: item, Value: value };
      }
    });
    return max;
  }

  get minItem(): KeyValuePair<ListItem, number> {
    let min: KeyValuePair<ListItem, number> = {
      Key: ListItem.Null,
      Value: 0,
    };
    this.forEach((value, key) => {
      const item = ListItemFromSerializedKey(key);
      if (min.Key.isNull || value < min.Value) {
        min = { Key: item, Value: value };
      }
    });
    return min;
  }

  get inverse(): List {
    const list = new List();
    if (this.origins != null) {
      this.origins.forEach((origin) => {
        Object.entries(origin.items).forEach(([key, value]) => {
          const item = ListItemFromSerializedKey(key);
          if (!this.ContainsKey(item)) list.Add(item, value);
        });
      });
    }
    return list;
  }

  get all(): List {
    const list = new List();
    if (this.origins != null) {
      this.origins.forEach((origin) => {
        Object.entries(origin.items).forEach(([key, value]) => {
          const item = ListItemFromSerializedKey(key);
          list.set(item.serialized(), value);
        });
      });
    }
    return list;
  }

  public Union(otherList: List): List {
    const union = new List(this);
    otherList.forEach((value, key) => {
      union.set(key, value);
    });

    return union;
  }

  public Intersect(otherList: List): List {
    const intersection = new List();
    this.forEach((value, key) => {
      if (otherList.has(key)) {
        intersection.set(key, value);
      }
    });

    return intersection;
  }

  public Without(listToRemove: List): List {
    const result = new List(this);
    listToRemove.forEach((value, key) => {
      result.delete(key);
    });

    return result;
  }

  public Contains(otherList: List): boolean {
    const keys = Array.from(otherList.keys());
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      if (!this.has(key)) {
        return false;
      }
    }

    return true;
  }

  public GreaterThan(otherList: List): boolean {
    if (this.Count === 0) {
      return false;
    }
    if (otherList.Count === 0) {
      return true;
    }

    return this.minItem.Value > otherList.maxItem.Value;
  }

  public GreaterThanOrEquals(otherList: List): boolean {
    if (this.Count === 0) {
      return false;
    }
    if (otherList.Count === 0) {
      return true;
    }

    return (
      this.minItem.Value >= otherList.minItem.Value &&
      this.maxItem.Value >= otherList.maxItem.Value
    );
  }

  public LessThan(otherList: List): boolean {
    if (otherList.Count === 0) {
      return false;
    }
    if (this.Count === 0) {
      return true;
    }

    return this.maxItem.Value < otherList.minItem.Value;
  }

  public LessThanOrEquals(otherList: List): boolean {
    if (otherList.Count === 0) {
      return false;
    }
    if (this.Count === 0) {
      return true;
    }

    return (
      this.maxItem.Value <= otherList.maxItem.Value &&
      this.minItem.Value <= otherList.minItem.Value
    );
  }

  public MaxAsList(): List {
    if (this.Count > 0) {
      return new List(this.maxItem);
    }
    return new List();
  }

  public MinAsList(): List {
    if (this.Count > 0) {
      return new List(this.minItem);
    }
    return new List();
  }

  public ListWithSubRange(minBound: unknown, maxBound: unknown): List {
    if (this.Count === 0) {
      return new List();
    }

    const ordered = this.orderedItems;

    let minValue = 0;
    let maxValue = Number.MAX_SAFE_INTEGER;

    if (Number.isInteger(minBound) && typeof minBound === "number") {
      minValue = minBound;
    } else if (minBound instanceof List && minBound.Count > 0) {
      minValue = minBound.minItem.Value;
    }

    if (Number.isInteger(maxBound) && typeof maxBound === "number") {
      maxValue = maxBound;
    } else if (maxBound instanceof List && maxBound.Count > 0) {
      maxValue = maxBound.maxItem.Value;
    }

    const subList = new List();
    subList.SetInitialOriginNames(this.originNames);
    ordered.forEach((item) => {
      if (item.Value >= minValue && item.Value <= maxValue) {
        subList.Add(item.Key, item.Value);
      }
    });

    return subList;
  }

  public Equals(otherInkList: List): boolean {
    if (otherInkList instanceof List === false) {
      return false;
    }
    if (otherInkList.Count !== this.Count) {
      return false;
    }

    const keys = Array.from(this.keys());
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      if (!otherInkList.has(key)) {
        return false;
      }
    }

    return true;
  }

  // GetHashCode not implemented
  get orderedItems(): KeyValuePair<ListItem, number>[] {
    // List<KeyValuePair<InkListItem, int>>
    const ordered = new Array<KeyValuePair<ListItem, number>>();

    this.forEach((value, key) => {
      const item = ListItemFromSerializedKey(key);
      ordered.push({ Key: item, Value: value });
    });

    ordered.sort((x, y) => {
      if (x.Key.originName === null) {
        throw new NullException("x.Key.originName");
      }
      if (y.Key.originName === null) {
        throw new NullException("y.Key.originName");
      }

      if (x.Value === y.Value) {
        return x.Key.originName.localeCompare(y.Key.originName);
      }
      // TODO: refactor this bit into a numberCompareTo method?
      if (x.Value < y.Value) return -1;
      return x.Value > y.Value ? 1 : 0;
    });

    return ordered;
  }

  public toString(): string {
    const ordered = this.orderedItems;

    const sb = new StringBuilder();
    for (let i = 0; i < ordered.length; i += 1) {
      if (i > 0) sb.Append(", ");

      const item = ordered[i].Key;
      if (item.itemName === null) {
        throw new NullException("item.itemName");
      }
      sb.Append(item.itemName);
    }

    return sb.ToString();
  }

  // casting a InkList to a Number, for somereason, actually gives a number.
  // This messes up the type detection when creating a Value from a InkList.
  // Returning NaN here prevents that.
  public valueOf(): number {
    return NaN;
  }
}

export interface KeyValuePair<K, V> {
  Key: K;
  Value: V;
}
