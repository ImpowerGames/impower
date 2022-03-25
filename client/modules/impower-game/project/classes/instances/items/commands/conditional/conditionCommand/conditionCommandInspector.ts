import { ConditionCommandData, TypeInfo } from "../../../../../../../data";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { CommandInspector } from "../../../command/commandInspector";

export class ConditionCommandInspector extends CommandInspector<ConditionCommandData> {
  getTypeInfo(): TypeInfo {
    return {
      category: "Conditional",
      name: "Condition",
      icon: "code-branch",
      color: getProjectColor("yellow", 5),
      description: "Executes child commands if the conditions are true",
    };
  }

  getSummary(data: ConditionCommandData): string {
    const { value: expression } = data;
    return `(${expression}) {`;
  }

  createData(
    data?: Partial<ConditionCommandData> &
      Pick<ConditionCommandData, "reference">
  ): ConditionCommandData {
    return {
      ...super.createData(data),
      check: "if",
      value: "",
      skipToIndex: 0,
      ...data,
    };
  }
}
