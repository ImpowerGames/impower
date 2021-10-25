import {
  UIElementData,
  ElementContentType,
  TypeInfo,
  ElementTypeId,
} from "../../../../../../../data";
import { UIElementInspector } from "../../uiElement/uiElementInspector";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";

export class TextElementInspector extends UIElementInspector<ElementTypeId.TextElement> {
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
    data?: Partial<UIElementData<ElementTypeId.TextElement>> &
      Pick<UIElementData<ElementTypeId.TextElement>, "reference">
  ): UIElementData<ElementTypeId.TextElement> {
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
