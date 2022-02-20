import {
  createDynamicData,
  FileTypeId,
  TypeInfo,
} from "../../../../../../../data";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { TriggerInspector } from "../../../trigger/triggerInspector";
import { ImageDropTriggerData } from "./imageDropTriggerData";

export class ImageDropTriggerInspector extends TriggerInspector<ImageDropTriggerData> {
  getTypeInfo(): TypeInfo {
    return {
      category: "Input",
      name: "Image Drop",
      icon: "hand-pointer",
      color: getProjectColor("cyan", 5),
      description: "Trigger when dropping an image",
    };
  }

  getSummary(_data: ImageDropTriggerData): string {
    return "{action}";
  }

  createData(
    data?: Partial<ImageDropTriggerData> &
      Pick<ImageDropTriggerData, "reference">
  ): ImageDropTriggerData {
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
