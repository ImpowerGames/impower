import { ElementTypeId } from "../../../project/classes/instances/items/element/elementTypeId";
import { ItemType, ContainerType } from "../../enums/data";
import { isItemReference, ItemReference } from "./itemReference";

export interface ElementReference<T extends ElementTypeId = ElementTypeId>
  extends ItemReference<ItemType.Element> {
  parentContainerType: ContainerType.Construct;
  refTypeId: T;
}

export const isElementReference = <T extends ElementTypeId = ElementTypeId>(
  obj: unknown
): obj is ElementReference<T> => {
  if (!obj) {
    return false;
  }
  const itemReference = obj as ElementReference<T>;
  return isItemReference(obj) && itemReference.refType === ItemType.Element;
};

export const createElementReference = <T extends ElementTypeId = ElementTypeId>(
  obj?: Partial<ElementReference<T>> & Pick<ElementReference<T>, "refTypeId">
): ElementReference<T> => ({
  parentContainerType: ContainerType.Construct,
  parentContainerId: "",
  refType: ItemType.Element,
  refTypeId: "",
  refId: "",
  ...obj,
});
