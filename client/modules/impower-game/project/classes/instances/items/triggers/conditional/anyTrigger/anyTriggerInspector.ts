import { TriggerData, TypeInfo } from "../../../../../../../data";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { TriggerInspector } from "../../../trigger/triggerInspector";

export class AnyTriggerInspector extends TriggerInspector<
  TriggerData<"AnyTrigger">
> {
  getTypeInfo(): TypeInfo {
    return {
      category: "Conditional",
      name: "Any",
      icon: "code-branch",
      color: getProjectColor("yellow", 5),
      description: "Any child trigger is satisfied",
    };
  }

  getSummary(_data: TriggerData<"AnyTrigger">): string {
    return "{";
  }

  isPropertyVisible(
    propertyPath: string,
    data: TriggerData<"AnyTrigger">
  ): boolean {
    if (propertyPath === "repeatable") {
      return false;
    }
    return super.isPropertyVisible(propertyPath, data);
  }
}
