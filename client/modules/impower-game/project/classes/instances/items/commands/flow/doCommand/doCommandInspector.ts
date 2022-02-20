import {
  Branchable,
  createDynamicData,
  DoCommandData,
  TypeInfo,
} from "../../../../../../../data";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { CommandInspector } from "../../../command/commandInspector";

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
        parentContainerType: "Block",
        parentContainerId: "",
        refType: "Block",
        refTypeId: "Block",
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
