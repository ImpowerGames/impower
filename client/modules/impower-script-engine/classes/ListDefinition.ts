import { TryGetResult } from "../types/TryGetResult";
import { ListItem, SerializedListItem } from "./ListItem";

export class ListDefinition {
  public _name: string;

  public _items: Record<SerializedListItem, number>;

  public _itemNameToValues: Record<string, number>;

  constructor(name: string, items: Record<string, number>) {
    this._name = name || "";
    this._items = null;
    this._itemNameToValues = items || {};
  }

  get name(): string {
    return this._name;
  }

  get items(): Record<string, number> {
    if (this._items == null) {
      this._items = {};
      Object.entries(this._itemNameToValues).forEach(([key, value]) => {
        const item = new ListItem(this.name, key);
        this._items[item.serialized()] = value;
      });
    }

    return this._items;
  }

  public ValueForItem(item: ListItem): number {
    if (!item.itemName) {
      return 0;
    }

    const intVal = this._itemNameToValues[item.itemName];
    if (typeof intVal !== "undefined") {
      return intVal;
    }
    return 0;
  }

  public ContainsItem(item: ListItem): boolean {
    if (!item.itemName) {
      return false;
    }
    if (item.originName !== this.name) {
      return false;
    }

    return Boolean(this._itemNameToValues[item.itemName]);
  }

  public ContainsItemWithName(itemName: string): boolean {
    return Boolean(this._itemNameToValues[itemName]);
  }

  public TryGetItemWithValue(
    val: number,
    /* out */ item: ListItem
  ): TryGetResult<ListItem> {
    const match = Object.entries(this._itemNameToValues).find(
      ([, value]) => value === val
    );

    if (match) {
      const [key] = match;
      item = new ListItem(this.name, key);
      return { result: item, exists: true };
    }

    item = ListItem.Null;
    return { result: item, exists: false };
  }

  public TryGetValueForItem(
    item: ListItem,
    /* out */ intVal: number
  ): TryGetResult<number> {
    if (!item.itemName) {
      intVal = 0;
      return { result: intVal, exists: false };
    }
    const value = this._itemNameToValues[item.itemName];

    if (!value) {
      intVal = 0;
      return { result: intVal, exists: false };
    }
    intVal = value;
    return { result: intVal, exists: true };
  }
}
