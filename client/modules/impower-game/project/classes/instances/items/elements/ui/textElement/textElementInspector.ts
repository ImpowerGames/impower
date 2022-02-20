import {
  ElementContentType,
  TypeInfo,
  UIElementData,
} from "../../../../../../../data";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { UIElementInspector } from "../../uiElement/uiElementInspector";

export class TextElementInspector extends UIElementInspector<"TextElement"> {
  getTypeInfo(): TypeInfo {
    return {
      category: "UI",
      name: "Text",
      icon: "text",
      color: getProjectColor("blue", 5),
      description: "Displays text on the canvas",
    };
  }

  createData(
    data?: Partial<UIElementData<"TextElement">> &
      Pick<UIElementData<"TextElement">, "reference">
  ): UIElementData<"TextElement"> {
    const defaultData = super.createData(data);
    return {
      ...defaultData,
      name: "NewTextElement",
      content: {
        ...defaultData.content,
        type: ElementContentType.Text,
      },
      text: {
        ...defaultData.text,
        active: true,
      },
      ...data,
    };
  }
}
