import {
  createDynamicData,
  FileTypeId,
  InputCondition,
  StorageType,
  TypeInfo,
} from "../../../../../../../data";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { TriggerInspector } from "../../../trigger/triggerInspector";
import { ImageClickTriggerData } from "./imageClickTriggerData";

export class ImageClickTriggerInspector extends TriggerInspector<ImageClickTriggerData> {
  getTypeInfo(): TypeInfo {
    return {
      category: "Input",
      name: "Image Click",
      icon: "hand-pointer",
      color: getProjectColor("cyan", 5),
      description: "Trigger when clicking an image",
    };
  }

  getSummary(_data: ImageClickTriggerData): string {
    return "{action}";
  }

  getPropertyDisplayValue(
    propertyPath: string,
    data: ImageClickTriggerData,
    value: unknown
  ): string {
    if (propertyPath === "action") {
      if (value === InputCondition.Started) {
        return "Down";
      }
      if (value === InputCondition.Stopped) {
        return "Up";
      }
      return "Held";
    }
    return super.getPropertyDisplayValue(propertyPath, data, value);
  }

  getPropertyOptions(
    propertyPath: string,
    _data?: ImageClickTriggerData
  ): unknown[] {
    if (propertyPath === "action") {
      return Object.values(InputCondition);
    }
    return undefined;
  }

  createData(
    data?: Partial<ImageClickTriggerData> &
      Pick<ImageClickTriggerData, "reference">
  ): ImageClickTriggerData {
    return {
      image: createDynamicData({
        refType: StorageType.File,
        refTypeId: FileTypeId.ImageFile,
        refId: "",
      }),
      action: InputCondition.Started,
      ...super.createData(data),
      repeatable: true,
      ...data,
    };
  }
}
