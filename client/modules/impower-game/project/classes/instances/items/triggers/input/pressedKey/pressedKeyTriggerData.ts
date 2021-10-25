import { Key } from "../../../../../../../data/enums/key";
import { InputCondition } from "../../../../../../../data/enums/inputCondition";
import { DynamicData } from "../../../../../../../data/interfaces/generics/dynamicData";
import { TriggerData } from "../../../trigger/triggerData";
import { TriggerTypeId } from "../../../trigger/triggerTypeId";

export interface PressedKeyTriggerData
  extends TriggerData<TriggerTypeId.PressedKeyTrigger> {
  action: InputCondition;
  key: DynamicData<Key>;
}
