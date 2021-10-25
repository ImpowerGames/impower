import {
  TypeInfo,
  FileTypeId,
  createTransitionConfig,
  createDynamicData,
  StorageType,
} from "../../../../../../../data";
import { CommandInspector } from "../../../command/commandInspector";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { MoveToImageCommandData } from "./moveToImageCommandData";
import { createVectorConfig } from "../../../../../../../data/interfaces/configs/vectorConfig";

export class MoveToImageCommandInspector extends CommandInspector<MoveToImageCommandData> {
  getTypeInfo(): TypeInfo {
    return {
      category: "Image",
      name: "Move Image",
      icon: "arrows-alt",
      color: getProjectColor("pink", 5),
      description: "Move an image",
    };
  }

  getSummary(_data: MoveToImageCommandData): string {
    return `{image}`;
  }

  createData(
    data?: Partial<MoveToImageCommandData> &
      Pick<MoveToImageCommandData, "reference">
  ): MoveToImageCommandData {
    return {
      ...super.createData(data),
      image: createDynamicData({
        refType: StorageType.File,
        refTypeId: FileTypeId.ImageFile,
        refId: "",
      }),
      position: createVectorConfig(0, 0),
      transition: createTransitionConfig(),
      additive: createDynamicData(false),
      ...data,
    };
  }

  isPropertyVisible(
    propertyPath: string,
    data: MoveToImageCommandData
  ): boolean {
    if (propertyPath === "waitUntilFinished") {
      return true;
    }
    return super.isPropertyVisible(propertyPath, data);
  }
}
