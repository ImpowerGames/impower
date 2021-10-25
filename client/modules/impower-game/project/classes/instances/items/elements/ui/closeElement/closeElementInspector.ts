import {
  ElementData,
  ElementTypeId,
  TypeInfo,
} from "../../../../../../../data";
import { ElementInspector } from "../../../element/elementInspector";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";

export class CloseElementInspector extends ElementInspector<
  ElementData<ElementTypeId.CloseElement>
> {
  getTypeInfo(): TypeInfo {
    return {
      category: "UI",
      name: "}",
      icon: "code-branch",
      color: getProjectColor("yellow", 5),
      description: "Closes a group",
    };
  }
}
