import {
  TriggerData,
  TriggerTypeId,
  TypeInfo,
} from "../../../../../../../data";
import { TriggerInspector } from "../../../trigger/triggerInspector";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";

export class AnyTriggerInspector extends TriggerInspector<
  TriggerData<TriggerTypeId.AnyTrigger>
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

  getSummary(_data: TriggerData<TriggerTypeId.AnyTrigger>): string {
    return "{";
  }

  isPropertyVisible(
    propertyPath: string,
    data: TriggerData<TriggerTypeId.AnyTrigger>
  ): boolean {
    if (propertyPath === "repeatable") {
      return false;
    }
    return super.isPropertyVisible(propertyPath, data);
  }
}
