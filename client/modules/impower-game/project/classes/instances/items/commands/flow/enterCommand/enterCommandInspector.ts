import {
  Branchable,
  EnterCommandData,
  TypeInfo,
} from "../../../../../../../data";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { CommandInspector } from "../../../command/commandInspector";

export class EnterCommandInspector
  extends CommandInspector<EnterCommandData>
  implements Branchable<EnterCommandData>
{
  getTypeInfo(): TypeInfo {
    return {
      category: "Flow",
      name: "Go",
      icon: "arrow-right",
      color: getProjectColor("red", 5),
      description: "Executes another block",
    };
  }

  getSummary(_data: EnterCommandData): string {
    return "{name}";
  }

  isPropertyVisible(propertyPath: string, data: EnterCommandData): boolean {
    if (propertyPath === "waitUntilFinished") {
      return true;
    }
    return super.isPropertyVisible(propertyPath, data);
  }

  createData(
    data?: Partial<EnterCommandData> & Pick<EnterCommandData, "reference">
  ): EnterCommandData {
    return {
      ...super.createData(data),
      name: "",
      values: [],
      ...data,
    };
  }

  getContainerTargetNames(data: EnterCommandData): string[] {
    if (data.name) {
      return [data.name];
    }
    return [];
  }
}
