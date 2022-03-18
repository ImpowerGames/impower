import { isItemReference } from "../../../../data/utils/isItemReference";
import { ItemData } from "./itemData";

export const isItemData = (obj: unknown): obj is ItemData => {
  if (!obj) {
    return false;
  }
  const itemData = obj as ItemData;
  return isItemReference(itemData.reference);
};
