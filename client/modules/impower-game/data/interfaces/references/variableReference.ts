import { VariableTypeId } from "../../../project/classes/instances/items/variable/variableTypeId";
import { isItemReference, ItemReference } from "./itemReference";

export interface VariableReference<T extends VariableTypeId = VariableTypeId>
  extends ItemReference<"Variable"> {
  parentContainerType: "Construct" | "Block";
  refType: "Variable";
  refTypeId: T;
}

export const isVariableReference = <T extends VariableTypeId = VariableTypeId>(
  obj: unknown
): obj is VariableReference<T> => {
  if (!obj) {
    return false;
  }
  const itemReference = obj as VariableReference<T>;
  return isItemReference(obj) && itemReference.refType === "Variable";
};

export const createVariableReference = <
  T extends VariableTypeId = VariableTypeId
>(
  obj?: Partial<VariableReference<T>> & Pick<VariableReference<T>, "refTypeId">
): VariableReference => ({
  parentContainerType: "Block",
  parentContainerId: "",
  refType: "Variable",
  refTypeId: "",
  refId: "",
  ...obj,
});
