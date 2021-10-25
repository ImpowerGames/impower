import { ItemType } from "../../../../../data/enums/data";
import { Disableable } from "../../../../../data/interfaces/disableable";
import {
  createTriggerReference,
  isTriggerReference,
  TriggerReference,
} from "../../../../../data/interfaces/references/triggerReference";
import { createItemData, ItemData } from "../../item/itemData";
import { TriggerTypeId } from "./triggerTypeId";

export interface TriggerData<T extends TriggerTypeId = TriggerTypeId>
  extends ItemData<ItemType.Trigger, TriggerReference<T>>,
    Disableable {
  repeatable: boolean;
}

export const isTriggerData = <T extends TriggerTypeId = TriggerTypeId>(
  obj: unknown
): obj is TriggerData<T> => {
  if (!obj) {
    return false;
  }
  const triggerData = obj as TriggerData;
  return isTriggerReference(triggerData.reference);
};

export const createTriggerData = <T extends TriggerTypeId = TriggerTypeId>(
  obj?: Partial<TriggerData<T>> & Pick<TriggerData<T>, "reference">
): TriggerData<T> => ({
  ...createItemData({
    reference: createTriggerReference(),
  }),
  repeatable: false,
  disabled: false,
  ...obj,
});
