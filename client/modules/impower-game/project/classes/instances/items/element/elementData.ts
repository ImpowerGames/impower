import { ElementTypeId } from "../../../../../data";
import { Disableable } from "../../../../../data/interfaces/disableable";
import {
  createElementReference,
  ElementReference,
  isElementReference,
} from "../../../../../data/interfaces/references/elementReference";
import { createItemData, ItemData } from "../../item/itemData";

export interface ElementData<T extends ElementTypeId = ElementTypeId>
  extends ItemData<"Element", ElementReference<T>>,
    Disableable {}

export const createElementData = (obj?: Partial<ElementData>): ElementData => ({
  ...createItemData({
    reference: createElementReference(),
  }),
  disabled: false,
  ...obj,
});

export const isElementData = (obj: unknown): obj is ElementData => {
  if (!obj) {
    return false;
  }
  const elementData = obj as ElementData;
  return isElementReference(elementData.reference);
};
