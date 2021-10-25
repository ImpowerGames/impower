import { ItemType } from "../../../../data";
import {
  ItemReference,
  isItemReference,
} from "../../../../data/interfaces/references/itemReference";
import { createInstanceData, InstanceData } from "../../instance/instanceData";

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ItemData<
  D extends ItemType = ItemType,
  R extends ItemReference<D> = ItemReference<D>
> extends InstanceData<D, R> {}

export const isItemData = (obj: unknown): obj is ItemData => {
  if (!obj) {
    return false;
  }
  const itemData = obj as ItemData;
  return isItemReference(itemData.reference);
};

export const createItemData = <
  D extends ItemType = ItemType,
  R extends ItemReference<D> = ItemReference<D>
>(
  obj?: Partial<ItemData<D, R>> & Pick<ItemData<D, R>, "reference">
): ItemData<D, R> => ({
  ...createInstanceData(obj),
  ...obj,
});
