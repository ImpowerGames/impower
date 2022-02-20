import { TriggerTypeId } from "../../../project/classes/instances/items/trigger/triggerTypeId";
import { isItemReference, ItemReference } from "./itemReference";

export interface TriggerReference<T extends TriggerTypeId = TriggerTypeId>
  extends ItemReference<"Trigger"> {
  parentContainerType: "Block";
  refType: "Trigger";
  refTypeId: T;
}

export const isTriggerReference = <T extends TriggerTypeId = TriggerTypeId>(
  obj: unknown
): obj is TriggerReference<T> => {
  if (!obj) {
    return false;
  }
  const itemReference = obj as TriggerReference<T>;
  return isItemReference(obj) && itemReference.refType === "Trigger";
};

export const createTriggerReference = <T extends TriggerTypeId = TriggerTypeId>(
  obj?: Partial<TriggerReference<T>> & Pick<TriggerReference<T>, "refTypeId">
): TriggerReference<T> => ({
  parentContainerType: "Block",
  parentContainerId: "",
  refType: "Trigger",
  refTypeId: "",
  refId: "",
  ...obj,
});
