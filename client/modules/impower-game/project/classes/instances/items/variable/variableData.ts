import { Nameable } from "../../../../../../impower-core";
import { Permission } from "../../../../../data/enums/permission";
import { Scope } from "../../../../../data/enums/scope";
import { VariableLifetime } from "../../../../../data/enums/variableLifetime";
import {
  createVariableReference,
  isVariableReference,
  VariableReference,
} from "../../../../../data/interfaces/references/variableReference";
import { Scopable } from "../../../../../data/interfaces/scopable";
import { createItemData, ItemData } from "../../item/itemData";
import { VariableTypeId } from "./variableTypeId";

export interface VariableData<
  T extends VariableTypeId = VariableTypeId,
  V = unknown
> extends ItemData<"Variable", VariableReference<T>>,
    Nameable,
    Scopable {
  lifetime: VariableLifetime;
  value: V;
}

export const isVariableData = <
  T extends VariableTypeId = VariableTypeId,
  V = unknown
>(
  obj: unknown
): obj is VariableData<T, V> => {
  if (!obj) {
    return false;
  }
  const variableData = obj as VariableData<T, V>;
  return isVariableReference(variableData.reference);
};

export const createVariableData = <
  T extends VariableTypeId = VariableTypeId,
  V = unknown
>(
  obj?: Partial<VariableData<T, V>> &
    Pick<VariableData<T, V>, "reference" | "value">
): VariableData<T, V> => ({
  ...createItemData({
    reference: createVariableReference(),
  }),
  name: "NewVariable",
  scope: Scope.Self,
  permission:
    obj?.reference?.parentContainerType === "Construct"
      ? Permission.Inherit
      : Permission.Access,
  overrideParentContainerId: obj?.reference?.parentContainerId,
  lifetime: VariableLifetime.Temporary,
  ...obj,
});
