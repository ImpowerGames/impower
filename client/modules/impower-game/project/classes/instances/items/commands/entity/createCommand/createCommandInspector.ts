import {
  CreateCommandData,
  createDynamicData,
  TypeInfo,
} from "../../../../../../../data";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { CommandInspector } from "../../../command/commandInspector";

export class CreateCommandInspector extends CommandInspector<CreateCommandData> {
  getTypeInfo(): TypeInfo {
    return {
      category: "Entity",
      name: "Create",
      icon: "file-plus",
      color: getProjectColor("teal", 5),
      description: "Creates a construct",
    };
  }

  getSummary(_data: CreateCommandData): string {
    return "{construct}";
  }

  createData(
    data?: Partial<CreateCommandData> & Pick<CreateCommandData, "reference">
  ): CreateCommandData {
    return {
      ...super.createData(data),
      construct: createDynamicData({
        parentContainerType: "Construct",
        parentContainerId: "",
        refType: "Construct",
        refTypeId: "Construct",
        refId: "",
      }),
      ...data,
    };
  }
}
