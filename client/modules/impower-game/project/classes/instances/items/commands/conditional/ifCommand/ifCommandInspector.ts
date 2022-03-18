import { IfCommandData, TypeInfo } from "../../../../../../../data";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { CommandInspector } from "../../../command/commandInspector";

export class IfCommandInspector extends CommandInspector<IfCommandData> {
  getTypeInfo(): TypeInfo {
    return {
      category: "Conditional",
      name: "If",
      icon: "code-branch",
      color: getProjectColor("yellow", 5),
      description: "Executes child commands if the conditions are true",
    };
  }

  getSummary(data: IfCommandData): string {
    const { value: expression } = data;
    return `(${expression}) {`;
  }

  createData(
    data?: Partial<IfCommandData> & Pick<IfCommandData, "reference">
  ): IfCommandData {
    return {
      ...super.createData(data),
      value: "",
      ...data,
    };
  }
}
