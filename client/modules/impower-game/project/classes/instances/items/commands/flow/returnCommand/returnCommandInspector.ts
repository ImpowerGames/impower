import { ReturnCommandData, TypeInfo } from "../../../../../../../data";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { CommandInspector } from "../../../command/commandInspector";

export class ReturnCommandInspector extends CommandInspector<ReturnCommandData> {
  getTypeInfo(): TypeInfo {
    return {
      category: "Flow",
      name: "Return",
      icon: "sign-out",
      color: getProjectColor("red", 5),
      description: "Returns flow back to caller",
    };
  }

  getSummary(_data: ReturnCommandData): string {
    return "";
  }

  createData(
    data?: Partial<ReturnCommandData> & Pick<ReturnCommandData, "reference">
  ): ReturnCommandData {
    return {
      ...super.createData(data),
      value: "",
      ...data,
    };
  }
}
