import {
  AssignCommandData,
  SetOperator,
  TypeInfo,
} from "../../../../../../../data";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { CommandInspector } from "../../../command/commandInspector";

export class AssignCommandInspector extends CommandInspector<AssignCommandData> {
  getTypeInfo(): TypeInfo {
    return {
      category: "Data",
      name: "Set",
      icon: "{x}",
      color: getProjectColor("orange", 5),
      description: "Sets a variable's current value",
    };
  }

  getSummary(_data: AssignCommandData): string {
    return `{variable} {operator} {value}`;
  }

  createData(
    data?: Partial<AssignCommandData> & Pick<AssignCommandData, "reference">
  ): AssignCommandData {
    return {
      ...super.createData(data),
      variable: "",
      operator: SetOperator.Assign,
      value: "",
      ...data,
    };
  }
}
