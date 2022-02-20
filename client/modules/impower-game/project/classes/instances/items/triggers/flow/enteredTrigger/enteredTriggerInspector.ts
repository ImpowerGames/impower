import { TriggerData, TypeInfo } from "../../../../../../../data";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { TriggerInspector } from "../../../trigger/triggerInspector";

export class EnteredTriggerInspector extends TriggerInspector<
  TriggerData<"EnteredTrigger">
> {
  getTypeInfo(): TypeInfo {
    return {
      category: "Flow",
      name: "Entered",
      icon: "level-down",
      color: getProjectColor("grape", 5),
      description: "Parent block was entered from its parent",
    };
  }
}
