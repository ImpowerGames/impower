import { isReference, Reference } from "../reference";
import { ContainerType, ItemType } from "../../enums/data";

export interface ItemReference<D extends ItemType = ItemType>
  extends Reference<D> {
  parentContainerType: ContainerType;
  parentContainerId: string;
  refType: D;
}

export const isItemReference = <D extends ItemType = ItemType>(
  obj: unknown
): obj is ItemReference<D> => {
  if (!obj) {
    return false;
  }
  const itemReference = obj as ItemReference<D>;
  return (
    isReference(obj) &&
    itemReference.parentContainerType !== undefined &&
    itemReference.parentContainerId !== undefined &&
    (itemReference.refType === ItemType.Element ||
      itemReference.refType === ItemType.Variable ||
      itemReference.refType === ItemType.Trigger ||
      itemReference.refType === ItemType.Command)
  );
};
