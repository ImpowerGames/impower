import {
  TriggerData,
  TriggerTypeId,
  TypeInfo,
} from "../../../../../../../data";
import { TriggerInspector } from "../../../trigger/triggerInspector";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";

export class PausedTriggerInspector extends TriggerInspector<
  TriggerData<TriggerTypeId.PausedTrigger>
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
