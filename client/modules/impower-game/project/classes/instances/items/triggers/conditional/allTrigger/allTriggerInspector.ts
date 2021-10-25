import {
  TriggerData,
  TriggerTypeId,
  TypeInfo,
} from "../../../../../../../data";
import { TriggerInspector } from "../../../trigger/triggerInspector";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";

export class AllTriggerInspector extends TriggerInspector<
  TriggerData<TriggerTypeId.AllTrigger>
> {
  getTypeInfo(): TypeInfo {
    return {
      category: "Conditional",
      name: "All",
      icon: "code-branch",
      color: getProjectColor("yellow", 5),
      description: "All child triggers are satisfied",
    };
  }

  getSummary(_data: TriggerData<TriggerTypeId.AllTrigger>): string {
    return "{";
  }

  isPropertyVisible(
    propertyPath: string,
    data: TriggerData<TriggerTypeId.AllTrigger>
  ): boolean {
    if (propertyPath === "repeatable") {
      return false;
    }
    return super.isPropertyVisible(propertyPath, data);
  }
}
