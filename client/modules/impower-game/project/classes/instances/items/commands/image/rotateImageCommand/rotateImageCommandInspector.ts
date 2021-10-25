import {
  TypeInfo,
  FileTypeId,
  createTransitionConfig,
  createDynamicData,
  StorageType,
} from "../../../../../../../data";
import { CommandInspector } from "../../../command/commandInspector";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { RotateToImageCommandData } from "./rotateImageCommandData";

export class RotateToImageCommandInspector extends CommandInspector<RotateToImageCommandData> {
  getTypeInfo(): TypeInfo {
    return {
      category: "Image",
      name: "Rotate Image",
      icon: "sync-alt",
      color: getProjectColor("pink", 5),
      description: "Rotate an image",
    };
  }

  getSummary(_data: RotateToImageCommandData): string {
    return `{image}`;
  }

  createData(
    data?: Partial<RotateToImageCommandData> &
      Pick<RotateToImageCommandData, "reference">
  ): RotateToImageCommandData {
    return {
      ...super.createData(data),
      image: createDynamicData({
        refType: StorageType.File,
        refTypeId: FileTypeId.ImageFile,
        refId: "",
      }),
      angle: createDynamicData(0),
      transition: createTransitionConfig(),
      additive: createDynamicData(false),
      ...data,
    };
  }

  isPropertyVisible(
    propertyPath: string,
    data: RotateToImageCommandData
  ): boolean {
    if (propertyPath === "waitUntilFinished") {
      return true;
    }
    return super.isPropertyVisible(propertyPath, data);
  }
}
