import {
  CreateCommandData,
  ContainerType,
  TypeInfo,
  createDynamicData,
} from "../../../../../../../data";
import { CommandInspector } from "../../../command/commandInspector";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";

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
        parentContainerType: ContainerType.Construct,
        parentContainerId: "",
        refType: ContainerType.Construct,
        refTypeId: ContainerType.Construct,
        refId: "",
      }),
      ...data,
    };
  }
}
