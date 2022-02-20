import { TypeInfo, UIElementData } from "../../../../../../../data";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { UIElementInspector } from "../../uiElement/uiElementInspector";

export class GroupElementInspector extends UIElementInspector<"GroupElement"> {
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
    data?: Partial<UIElementData<"GroupElement">> &
      Pick<UIElementData<"GroupElement">, "reference">
  ): UIElementData<"GroupElement"> {
    const defaultData = super.createData(data);
    return {
      ...defaultData,
      name: "NewGroupElement",
      group: true,
      ...data,
    };
  }
}
