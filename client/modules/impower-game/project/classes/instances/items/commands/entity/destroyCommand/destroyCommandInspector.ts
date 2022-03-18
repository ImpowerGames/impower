import { DestroyCommandData, TypeInfo } from "../../../../../../../data";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { CommandInspector } from "../../../command/commandInspector";

export class DestroyCommandInspector extends CommandInspector<DestroyCommandData> {
  getTypeInfo(): TypeInfo {
    return {
      category: "Entity",
      name: "Destroy",
      icon: "file-minus",
      color: getProjectColor("teal", 5),
      description: "Destroys a construct",
    };
  }

  getSummary(_data: DestroyCommandData): string {
    return "{construct}";
  }

  createData(
    data?: Partial<DestroyCommandData> & Pick<DestroyCommandData, "reference">
  ): DestroyCommandData {
    return {
      ...super.createData(data),
      entity: "",
      ...data,
    };
  }
}
