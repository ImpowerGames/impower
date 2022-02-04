import { TryGetResult } from "../types/TryGetResult";
import { ImpowerListItem, SerializedImpowerListItem } from "./ImpowerListItem";

export class ListDefinition {
  public _name: string;

  public _items: Record<SerializedImpowerListItem, number>;

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
        const item = new ImpowerListItem(this.name, key);
        this._items[item.serialized()] = value;
      });
    }

    return this._items;
  }

  public ValueForItem(item: ImpowerListItem): number {
    if (!item.itemName) {
      return 0;
    }

    const intVal = this._itemNameToValues[item.itemName];
    if (typeof intVal !== "undefined") {
      return intVal;
    }
    return 0;
  }

  public ContainsItem(item: ImpowerListItem): boolean {
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
    /* out */ item: ImpowerListItem
  ): TryGetResult<ImpowerListItem> {
    const match = Object.entries(this._itemNameToValues).find(
      ([, value]) => value === val
    );

    if (match) {
      const [key] = match;
      item = new ImpowerListItem(this.name, key);
      return { result: item, exists: true };
    }

    item = ImpowerListItem.Null;
    return { result: item, exists: false };
  }

  public TryGetValueForItem(
    item: ImpowerListItem,
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
