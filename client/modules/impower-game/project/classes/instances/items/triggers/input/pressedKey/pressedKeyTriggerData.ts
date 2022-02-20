import { InputCondition } from "../../../../../../../data/enums/inputCondition";
import { Key } from "../../../../../../../data/enums/key";
import { DynamicData } from "../../../../../../../data/interfaces/generics/dynamicData";
import { TriggerData } from "../../../trigger/triggerData";

export interface PressedKeyTriggerData
  extends TriggerData<"PressedKeyTrigger"> {
  action: InputCondition;
  key: DynamicData<Key>;
}
