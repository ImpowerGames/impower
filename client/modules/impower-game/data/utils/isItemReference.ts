import { ItemType } from "../enums/data";
import { ItemReference } from "../interfaces/references/itemReference";
import { isReference } from "./isReference";

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
    itemReference.refType === "Command"
  );
};
