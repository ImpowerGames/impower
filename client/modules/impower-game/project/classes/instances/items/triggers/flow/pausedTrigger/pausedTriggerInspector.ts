import { TriggerData, TypeInfo } from "../../../../../../../data";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { TriggerInspector } from "../../../trigger/triggerInspector";

export class PausedTriggerInspector extends TriggerInspector<
  TriggerData<"PausedTrigger">
> {
  getTypeInfo(): TypeInfo {
    return {
      category: "Flow",
      name: "Paused",
      icon: "pause-circle",
      color: getProjectColor("grape", 5),
      description: "Game is paused",
    };
  }
}
