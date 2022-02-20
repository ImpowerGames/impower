import { ClickButton } from "../../../../../../../data/enums/clickButton";
import { InputCondition } from "../../../../../../../data/enums/inputCondition";
import { TriggerData } from "../../../trigger/triggerData";

export interface ClickTriggerData extends TriggerData<"ClickTrigger"> {
  action: InputCondition;
  button: ClickButton;
}
