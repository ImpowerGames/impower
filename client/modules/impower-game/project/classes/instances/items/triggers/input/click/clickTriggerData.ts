import { InputCondition } from "../../../../../../../data/enums/inputCondition";
import { ClickButton } from "../../../../../../../data/enums/clickButton";
import { TriggerData } from "../../../trigger/triggerData";
import { TriggerTypeId } from "../../../trigger/triggerTypeId";

export interface ClickTriggerData
  extends TriggerData<TriggerTypeId.ClickTrigger> {
  action: InputCondition;
  button: ClickButton;
}
