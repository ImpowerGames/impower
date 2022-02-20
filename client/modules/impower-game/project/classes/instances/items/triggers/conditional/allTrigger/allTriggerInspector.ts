import { TriggerData, TypeInfo } from "../../../../../../../data";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { TriggerInspector } from "../../../trigger/triggerInspector";

export class AllTriggerInspector extends TriggerInspector<
  TriggerData<"AllTrigger">
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

  getSummary(_data: TriggerData<"AllTrigger">): string {
    return "{";
  }

  isPropertyVisible(
    propertyPath: string,
    data: TriggerData<"AllTrigger">
  ): boolean {
    if (propertyPath === "repeatable") {
      return false;
    }
    return super.isPropertyVisible(propertyPath, data);
  }
}
