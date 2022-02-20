import { TypeInfo, UIElementData } from "../../../../../../../data";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { UIElementInspector } from "../../uiElement/uiElementInspector";

export class ShapeElementInspector extends UIElementInspector<"ShapeElement"> {
  getTypeInfo(): TypeInfo {
    return {
      category: "UI",
      name: "Shape",
      icon: "square",
      color: getProjectColor("teal", 5),
      description: "Displays a shape on the canvas",
    };
  }

  createData(
    data?: Partial<UIElementData<"ShapeElement">> &
      Pick<UIElementData<"ShapeElement">, "reference">
  ): UIElementData<"ShapeElement"> {
    const defaultData = super.createData(data);
    return {
      ...defaultData,
      name: "NewShapeElement",
      fill: {
        ...defaultData.fill,
        active: true,
      },
      ...data,
    };
  }
}
