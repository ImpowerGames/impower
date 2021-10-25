import { TriggerTypeId } from "../../../project/classes/instances/items/trigger/triggerTypeId";
import { ContainerType, ItemType } from "../../enums/data";
import { isItemReference, ItemReference } from "./itemReference";

export interface TriggerReference<T extends TriggerTypeId = TriggerTypeId>
  extends ItemReference<ItemType.Trigger> {
  parentContainerType: ContainerType.Block;
  refType: ItemType.Trigger;
  refTypeId: T;
}

export const isTriggerReference = <T extends TriggerTypeId = TriggerTypeId>(
  obj: unknown
): obj is TriggerReference<T> => {
  if (!obj) {
    return false;
  }
  const itemReference = obj as TriggerReference<T>;
  return isItemReference(obj) && itemReference.refType === ItemType.Trigger;
};

export const createTriggerReference = <T extends TriggerTypeId = TriggerTypeId>(
  obj?: Partial<TriggerReference<T>> & Pick<TriggerReference<T>, "refTypeId">
): TriggerReference<T> => ({
  parentContainerType: ContainerType.Block,
  parentContainerId: "",
  refType: ItemType.Trigger,
  refTypeId: "",
  refId: "",
  ...obj,
});
