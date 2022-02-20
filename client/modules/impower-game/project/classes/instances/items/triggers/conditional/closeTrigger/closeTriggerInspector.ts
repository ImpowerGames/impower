import { TriggerData, TypeInfo } from "../../../../../../../data";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { TriggerInspector } from "../../../trigger/triggerInspector";

export class CloseTriggerInspector extends TriggerInspector<
  TriggerData<"CloseTrigger">
> {
  getTypeInfo(): TypeInfo {
    return {
      category: "Conditional",
      name: "}",
      icon: "code-branch",
      color: getProjectColor("yellow", 5),
      description: "Closes a conditional group",
    };
  }

  isPropertyVisible(
    propertyPath: string,
    data: TriggerData<"CloseTrigger">
  ): boolean {
    if (propertyPath === "repeatable") {
      return false;
    }
    return super.isPropertyVisible(propertyPath, data);
  }
}
