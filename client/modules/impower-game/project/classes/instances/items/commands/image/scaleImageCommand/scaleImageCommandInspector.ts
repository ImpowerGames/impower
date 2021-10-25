import {
  createDynamicData,
  createTransitionConfig,
  FileTypeId,
  StorageType,
  TypeInfo,
} from "../../../../../../../data";
import { createVectorConfig } from "../../../../../../../data/interfaces/configs/vectorConfig";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { CommandInspector } from "../../../command/commandInspector";
import { ScaleToImageCommandData } from "./scaleImageCommandData";

export class ScaleToImageCommandInspector extends CommandInspector<ScaleToImageCommandData> {
  getTypeInfo(): TypeInfo {
    return {
      category: "Image",
      name: "Scale Image",
      icon: "expand-arrows-alt",
      color: getProjectColor("pink", 5),
      description: "Scale an image",
    };
  }

  getSummary(_data: ScaleToImageCommandData): string {
    return `{image}`;
  }

  createData(
    data?: Partial<ScaleToImageCommandData> &
      Pick<ScaleToImageCommandData, "reference">
  ): ScaleToImageCommandData {
    return {
      ...super.createData(data),
      image: createDynamicData({
        refType: StorageType.File,
        refTypeId: FileTypeId.ImageFile,
        refId: "",
      }),
      scale: createVectorConfig(1, 1),
      transition: createTransitionConfig(),
      additive: createDynamicData(false),
      ...data,
    };
  }

  isPropertyVisible(
    propertyPath: string,
    data: ScaleToImageCommandData
  ): boolean {
    if (propertyPath === "waitUntilFinished") {
      return true;
    }
    return super.isPropertyVisible(propertyPath, data);
  }
}
