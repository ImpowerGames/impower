import {
  UIElementData,
  FillType,
  TypeInfo,
  ElementTypeId,
} from "../../../../../../../data";
import { UIElementInspector } from "../../uiElement/uiElementInspector";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";

export class ImageElementInspector extends UIElementInspector<ElementTypeId.ImageElement> {
  getTypeInfo(): TypeInfo {
    return {
      category: "UI",
      name: "Image",
      icon: "image",
      color: getProjectColor("pink", 5),
      description: "Displays an image on the canvas",
    };
  }

  createData(
    data?: Partial<UIElementData<ElementTypeId.ImageElement>> &
      Pick<UIElementData<ElementTypeId.ImageElement>, "reference">
  ): UIElementData<ElementTypeId.ImageElement> {
    const defaultData = super.createData(data);
    return {
      ...defaultData,
      name: "NewImageElement",
      fill: {
        ...defaultData.fill,
        active: true,
        value: {
          ...defaultData.fill.value,
          type: FillType.Image,
        },
      },
      ...data,
    };
  }
}
