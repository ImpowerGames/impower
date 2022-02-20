import { Condition } from "../../../../../../../data";
import { TriggerData } from "../../../trigger/triggerData";

export interface CompareTriggerData
  extends TriggerData<"CompareTrigger">,
    Condition {}
