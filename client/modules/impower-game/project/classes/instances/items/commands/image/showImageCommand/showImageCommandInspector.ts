import {
  createDynamicData,
  createTransitionConfig,
  FileTypeId,
  TypeInfo,
} from "../../../../../../../data";
import { createVectorConfig } from "../../../../../../../data/interfaces/configs/vectorConfig";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { CommandInspector } from "../../../command/commandInspector";
import { ShowImageCommandData } from "./showImageCommandData";

export class ShowImageCommandInspector extends CommandInspector<ShowImageCommandData> {
  getTypeInfo(): TypeInfo {
    return {
      category: "Image",
      name: "Show Image",
      icon: "image",
      color: getProjectColor("pink", 5),
      description: "Show an image from file",
    };
  }

  getSummary(_data: ShowImageCommandData): string {
    return `{image}`;
  }

  createData(
    data?: Partial<ShowImageCommandData> &
      Pick<ShowImageCommandData, "reference">
  ): ShowImageCommandData {
    return {
      ...super.createData(data),
      image: createDynamicData({
        refType: "File",
        refTypeId: FileTypeId.ImageFile,
        refId: "",
      }),
      transition: createTransitionConfig(),
      position: createVectorConfig(0, 0),
      size: {
        useDefault: true,
        value: createVectorConfig(100, 100),
      },
      ...data,
    };
  }

  getPropertyLabel(propertyPath: string, data: ShowImageCommandData): string {
    if (propertyPath === "size.value.x") {
      return "Width";
    }
    if (propertyPath === "size.value.y") {
      return "Height";
    }
    return super.getPropertyLabel(propertyPath, data);
  }

  getPropertyBounds(
    propertyPath: string,
    _data: ShowImageCommandData
  ): {
    min?: number;
    max?: number;
    step?: number | null;
    marks?: { value: number; label: string }[];
    force?: boolean;
  } {
    if (propertyPath === "transition.duration.constant") {
      return {
        min: 0,
        force: true,
      };
    }
    return undefined;
  }

  isPropertyVisible(propertyPath: string, data: ShowImageCommandData): boolean {
    if (propertyPath === "waitUntilFinished") {
      return true;
    }
    return super.isPropertyVisible(propertyPath, data);
  }
}
