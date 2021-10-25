import {
  UIElementData,
  ElementContentType,
  TypeInfo,
  ElementTypeId,
} from "../../../../../../../data";
import { UIElementInspector } from "../../uiElement/uiElementInspector";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";

export class ComponentElementInspector extends UIElementInspector<ElementTypeId.ComponentElement> {
  getTypeInfo(): TypeInfo {
    return {
      category: "UI",
      name: "Component",
      icon: "puzzle-piece",
      color: getProjectColor("grape", 5),
      description: "Displays a construct as a component on the canvas",
    };
  }

  createData(
    data?: Partial<UIElementData<ElementTypeId.ComponentElement>> &
      Pick<UIElementData<ElementTypeId.ComponentElement>, "reference">
  ): UIElementData<ElementTypeId.ComponentElement> {
    const defaultData = super.createData(data);
    return {
      ...defaultData,
      name: "NewComponentElement",
      content: {
        ...defaultData.content,
        type: ElementContentType.Component,
      },
      ...data,
    };
  }
}
