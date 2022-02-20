import {
  createDynamicData,
  FileTypeId,
  TypeInfo,
} from "../../../../../../../data";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { TriggerInspector } from "../../../trigger/triggerInspector";
import { ImageDragTriggerData } from "./imageDragTriggerData";

export class ImageDragTriggerInspector extends TriggerInspector<ImageDragTriggerData> {
  getTypeInfo(): TypeInfo {
    return {
      category: "Input",
      name: "Image Drag",
      icon: "hand-pointer",
      color: getProjectColor("cyan", 5),
      description: "Trigger when dragging an image",
    };
  }

  getSummary(_data: ImageDragTriggerData): string {
    return "{action}";
  }

  createData(
    data?: Partial<ImageDragTriggerData> &
      Pick<ImageDragTriggerData, "reference">
  ): ImageDragTriggerData {
    return {
      image: createDynamicData({
        refType: "File",
        refTypeId: FileTypeId.ImageFile,
        refId: "",
      }),
      ...super.createData(data),
      repeatable: true,
      ...data,
    };
  }
}
