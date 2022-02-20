import { TriggerData, TypeInfo } from "../../../../../../../data";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { TriggerInspector } from "../../../trigger/triggerInspector";

export class ReturnedTriggerInspector extends TriggerInspector<
  TriggerData<"ReturnedTrigger">
> {
  getTypeInfo(): TypeInfo {
    return {
      category: "Flow",
      name: "Returned",
      icon: "level-up",
      color: getProjectColor("grape", 5),
      description: "Parent block was returned to from a child",
    };
  }
}
