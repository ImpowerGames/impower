import {
  TriggerData,
  TriggerTypeId,
  TypeInfo,
} from "../../../../../../../data";
import { TriggerInspector } from "../../../trigger/triggerInspector";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";

export class EnteredTriggerInspector extends TriggerInspector<
  TriggerData<TriggerTypeId.EnteredTrigger>
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
