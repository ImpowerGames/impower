import { ElementTypeId } from "../../../project/classes/instances/items/element/elementTypeId";
import { isItemReference, ItemReference } from "./itemReference";

export interface ElementReference<T extends ElementTypeId = ElementTypeId>
  extends ItemReference<"Element"> {
  parentContainerType: "Construct";
  refTypeId: T;
}

export const isElementReference = <T extends ElementTypeId = ElementTypeId>(
  obj: unknown
): obj is ElementReference<T> => {
  if (!obj) {
    return false;
  }
  const itemReference = obj as ElementReference<T>;
  return isItemReference(obj) && itemReference.refType === "Element";
};

export const createElementReference = <T extends ElementTypeId = ElementTypeId>(
  obj?: Partial<ElementReference<T>> & Pick<ElementReference<T>, "refTypeId">
): ElementReference<T> => ({
  parentContainerType: "Construct",
  parentContainerId: "",
  refType: "Element",
  refTypeId: "",
  refId: "",
  ...obj,
});
