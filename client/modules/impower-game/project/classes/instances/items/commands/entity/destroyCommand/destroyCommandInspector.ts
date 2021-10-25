import {
  DestroyCommandData,
  ContainerType,
  TypeInfo,
  createDynamicData,
} from "../../../../../../../data";
import { CommandInspector } from "../../../command/commandInspector";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";

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
