import { IImpowerListItem } from "../types/IImpowerListItem";

/**
 * In the original C# code, `InkListItem` was defined as value type, meaning
 * that two `InkListItem` would be considered equal as long as they held the
 * same values. This doesn't hold true in Javascript, as `InkListItem` is a
 * reference type (Javascript doesn't allow the creation of custom value types).
 *
 * The key equality of Map objects is based on the "SameValueZero" algorithm;
 * since `InkListItem` is a value type, two keys will only be considered
 * equal if they are, in fact, the same object. As we are trying to emulate
 * the original behavior as close as possible, this will lead to unforeseen
 * side effects.
 *
 * In order to have a key equality based on value semantics, we'll convert
 * `InkListItem` to a valid string representation and use this representation
 * as a key (strings are value types in Javascript). Rather than using the
 * type `string` directly, we'll alias it to `SerializedInkListItem` and use
 * this type as the key for our Map-based `InkList`.
 *
 * Reducing `InkListItem` to a JSON representation would not be bulletproof
 * in the general case, but for our needs it works well. The major downside of
 * this method is that we will have to to reconstruct the original `InkListItem`
 * every time we'll need to access its properties.
 */
export type SerializedImpowerListItem = string;

/**
 * Determines whether the given item is sufficiently `InkListItem`-like
 * to be used as a template when reconstructing the InkListItem.
 */
export const isImpowerListItem = (obj: unknown): obj is ImpowerListItem => {
  const item = obj as ImpowerListItem;
  if (typeof item !== "object") {
    return false;
  }
  if (item.originName === undefined || item.itemName === undefined) {
    return false;
  }
  if (typeof item.originName !== "string" && typeof item.originName !== null) {
    return false;
  }
  if (typeof item.itemName !== "string" && typeof item.itemName !== null) {
    return false;
  }

  return true;
};

export class ImpowerListItem implements IImpowerListItem {
  // InkListItem is a struct

  public readonly originName: string = null;

  public readonly itemName: string = null;

  constructor(originName: string, itemName: string);

  constructor(fullName: string);

  constructor(...args) {
    if (typeof args[1] !== "undefined") {
      const originName = args[0] as string;
      const itemName = args[1] as string;

      this.originName = originName;
      this.itemName = itemName;
    } else if (args[0]) {
      const fullName = args[0] as string;

      const nameParts = fullName.toString().split(".");
      [this.originName, this.itemName] = nameParts;
    }
  }

  public static get Null(): ImpowerListItem {
    return new ImpowerListItem(null, null);
  }

  public get isNull(): boolean {
    return this.originName == null && this.itemName == null;
  }

  get fullName(): string {
    return `${this.originName !== null ? this.originName : "?"}.${
      this.itemName
    }`;
  }

  public toString(): string {
    return this.fullName;
  }

  public Equals(obj: ImpowerListItem): boolean {
    if (obj instanceof ImpowerListItem) {
      const otherItem = obj;
      return (
        otherItem.itemName === this.itemName &&
        otherItem.originName === this.originName
      );
    }

    return false;
  }

  // These methods did not exist in the original C# code. Their purpose is to
  // make `InkListItem` mimics the value-type semantics of the original
  // struct. Please refer to the end of this file, for a more in-depth
  // explanation.

  /**
   * Returns a shallow clone of the current instance.
   */
  public copy(): ImpowerListItem {
    return new ImpowerListItem(this.originName, this.itemName);
  }

  /**
   * Returns a `SerializedInkListItem` representing the current
   * instance. The result is intended to be used as a key inside a Map.
   */
  public serialized(): SerializedImpowerListItem {
    // We are simply using a JSON representation as a value-typed key.
    return JSON.stringify({
      originName: this.originName,
      itemName: this.itemName,
    });
  }
}

/**
 * Reconstructs a `ImpowerListItem` from the given SerializedImpowerListItem.
 */
export const ImpowerListItemFromSerializedKey = (
  key: SerializedImpowerListItem
): ImpowerListItem => {
  const obj = JSON.parse(key);
  if (!isImpowerListItem(obj)) {
    return ImpowerListItem.Null;
  }

  const inkListItem = obj as IImpowerListItem;

  return new ImpowerListItem(inkListItem.originName, inkListItem.itemName);
};
