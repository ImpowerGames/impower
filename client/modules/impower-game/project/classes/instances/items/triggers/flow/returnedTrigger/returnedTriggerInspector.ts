import {
  TriggerData,
  TriggerTypeId,
  TypeInfo,
} from "../../../../../../../data";
import { TriggerInspector } from "../../../trigger/triggerInspector";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";

export class ReturnedTriggerInspector extends TriggerInspector<
  TriggerData<TriggerTypeId.ReturnedTrigger>
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
