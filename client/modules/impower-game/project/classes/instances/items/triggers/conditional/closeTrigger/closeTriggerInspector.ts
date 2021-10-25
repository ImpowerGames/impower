import {
  TriggerData,
  TriggerTypeId,
  TypeInfo,
} from "../../../../../../../data";
import { TriggerInspector } from "../../../trigger/triggerInspector";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";

export class CloseTriggerInspector extends TriggerInspector<
  TriggerData<TriggerTypeId.CloseTrigger>
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
    data: TriggerData<TriggerTypeId.CloseTrigger>
  ): boolean {
    if (propertyPath === "repeatable") {
      return false;
    }
    return super.isPropertyVisible(propertyPath, data);
  }
}
