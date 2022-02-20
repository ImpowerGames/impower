import { CompareOperator, TypeInfo } from "../../../../../../../data";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { TriggerInspector } from "../../../trigger/triggerInspector";
import { CompareTriggerData } from "./compareTriggerData";

export class CompareTriggerInspector extends TriggerInspector<CompareTriggerData> {
  getTypeInfo(data?: CompareTriggerData): TypeInfo {
    const operator = data?.operator;
    return {
      category: "Conditional",
      name: "Compare",
      icon:
        operator === CompareOperator.NotEquals
          ? "not-equal"
          : operator === CompareOperator.GreaterThan
          ? "greater-than"
          : operator === CompareOperator.LessThan
          ? "less-than"
          : operator === CompareOperator.GreaterThanOrEquals
          ? "greater-than-equal"
          : operator === CompareOperator.LessThanOrEquals
          ? "less-than-equal"
          : "equals",
      color: getProjectColor("yellow", 5),
      description: "Condition was met",
    };
  }
}
