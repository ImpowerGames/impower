import { ContainerType, ItemType } from "../../enums/data";
import { isReference, Reference } from "../reference";

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
    (itemReference.refType === "Element" ||
      itemReference.refType === "Variable" ||
      itemReference.refType === "Trigger" ||
      itemReference.refType === "Command")
  );
};
