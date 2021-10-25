import { VariableTypeId } from "../../../project/classes/instances/items/variable/variableTypeId";
import { ContainerType, ItemType } from "../../enums/data";
import { isItemReference, ItemReference } from "./itemReference";

export interface VariableReference<T extends VariableTypeId = VariableTypeId>
  extends ItemReference<ItemType.Variable> {
  parentContainerType: ContainerType.Construct | ContainerType.Block;
  refType: ItemType.Variable;
  refTypeId: T;
}

export const isVariableReference = <T extends VariableTypeId = VariableTypeId>(
  obj: unknown
): obj is VariableReference<T> => {
  if (!obj) {
    return false;
  }
  const itemReference = obj as VariableReference<T>;
  return isItemReference(obj) && itemReference.refType === ItemType.Variable;
};

export const createVariableReference = <
  T extends VariableTypeId = VariableTypeId
>(
  obj?: Partial<VariableReference<T>> & Pick<VariableReference<T>, "refTypeId">
): VariableReference => ({
  parentContainerType: ContainerType.Block,
  parentContainerId: "",
  refType: ItemType.Variable,
  refTypeId: "",
  refId: "",
  ...obj,
});
