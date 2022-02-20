import { FillType, TypeInfo, UIElementData } from "../../../../../../../data";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { UIElementInspector } from "../../uiElement/uiElementInspector";

export class ImageElementInspector extends UIElementInspector<"ImageElement"> {
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
    data?: Partial<UIElementData<"ImageElement">> &
      Pick<UIElementData<"ImageElement">, "reference">
  ): UIElementData<"ImageElement"> {
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
