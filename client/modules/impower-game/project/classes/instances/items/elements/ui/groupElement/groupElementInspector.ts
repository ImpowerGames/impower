import {
  UIElementData,
  TypeInfo,
  ElementTypeId,
} from "../../../../../../../data";
import { UIElementInspector } from "../../uiElement/uiElementInspector";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";

export class GroupElementInspector extends UIElementInspector<ElementTypeId.GroupElement> {
  getTypeInfo(): TypeInfo {
    return {
      category: "UI",
      name: "Group",
      icon: "layer-group",
      color: getProjectColor("yellow", 5),
      description: "Displays group of elements on the canvas",
    };
  }

  createData(
    data?: Partial<UIElementData<ElementTypeId.GroupElement>> &
      Pick<UIElementData<ElementTypeId.GroupElement>, "reference">
  ): UIElementData<ElementTypeId.GroupElement> {
    const defaultData = super.createData(data);
    return {
      ...defaultData,
      name: "NewGroupElement",
      group: true,
      ...data,
    };
  }
}
