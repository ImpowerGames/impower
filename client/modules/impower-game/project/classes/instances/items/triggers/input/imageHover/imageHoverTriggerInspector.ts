import {
  createDynamicData,
  FileTypeId,
  StorageType,
  TypeInfo,
} from "../../../../../../../data";
import { TriggerInspector } from "../../../trigger/triggerInspector";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { ImageHoverTriggerData } from "./imageHoverTriggerData";

export class ImageHoverTriggerInspector extends TriggerInspector<ImageHoverTriggerData> {
  getTypeInfo(): TypeInfo {
    return {
      category: "Input",
      name: "Image Hover",
      icon: "hand-pointer",
      color: getProjectColor("cyan", 5),
      description: "Trigger when hovering over an image",
    };
  }

  getSummary(_data: ImageHoverTriggerData): string {
    return "{action}";
  }

  createData(
    data?: Partial<ImageHoverTriggerData> &
      Pick<ImageHoverTriggerData, "reference">
  ): ImageHoverTriggerData {
    return {
      image: createDynamicData({
        refType: StorageType.File,
        refTypeId: FileTypeId.ImageFile,
        refId: "",
      }),
      ...super.createData(data),
      repeatable: true,
      ...data,
    };
  }
}
