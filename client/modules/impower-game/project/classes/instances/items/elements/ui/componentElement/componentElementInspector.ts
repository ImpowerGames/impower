import {
  ElementContentType,
  TypeInfo,
  UIElementData,
} from "../../../../../../../data";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { UIElementInspector } from "../../uiElement/uiElementInspector";

export class ComponentElementInspector extends UIElementInspector<"ComponentElement"> {
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
    data?: Partial<UIElementData<"ComponentElement">> &
      Pick<UIElementData<"ComponentElement">, "reference">
  ): UIElementData<"ComponentElement"> {
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
