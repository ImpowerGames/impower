import {
  DoCommandData,
  ContainerType,
  Branchable,
  TypeInfo,
  createDynamicData,
} from "../../../../../../../data";
import { CommandInspector } from "../../../command/commandInspector";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";

export class DoCommandInspector
  extends CommandInspector<DoCommandData>
  implements Branchable<DoCommandData>
{
  getTypeInfo(): TypeInfo {
    return {
      category: "Flow",
      name: "Do",
      icon: "arrow-right",
      color: getProjectColor("red", 5),
      description: "Executes another block",
    };
  }

  getSummary(_data: DoCommandData): string {
    return "{block}";
  }

  isPropertyVisible(propertyPath: string, data: DoCommandData): boolean {
    if (propertyPath === "waitUntilFinished") {
      return true;
    }
    return super.isPropertyVisible(propertyPath, data);
  }

  createData(
    data?: Partial<DoCommandData> & Pick<DoCommandData, "reference">
  ): DoCommandData {
    return {
      ...super.createData(data),
      block: createDynamicData({
        parentContainerType: ContainerType.Block,
        parentContainerId: "",
        refType: ContainerType.Block,
        refTypeId: ContainerType.Block,
        refId: "",
      }),
      ...data,
    };
  }

  getContainerTargetIds(data: DoCommandData): string[] {
    if (data.block && !data.block.dynamic) {
      return [data.block.constant.refId];
    }
    return [];
  }
}
