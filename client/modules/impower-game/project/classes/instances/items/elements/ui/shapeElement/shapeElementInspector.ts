import {
  UIElementData,
  TypeInfo,
  ElementTypeId,
} from "../../../../../../../data";
import { UIElementInspector } from "../../uiElement/uiElementInspector";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";

export class ShapeElementInspector extends UIElementInspector<ElementTypeId.ShapeElement> {
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
    data?: Partial<UIElementData<ElementTypeId.ShapeElement>> &
      Pick<UIElementData<ElementTypeId.ShapeElement>, "reference">
  ): UIElementData<ElementTypeId.ShapeElement> {
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
