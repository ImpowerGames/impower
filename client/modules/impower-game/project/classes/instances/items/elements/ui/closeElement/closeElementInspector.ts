import { ElementData, TypeInfo } from "../../../../../../../data";
import { getProjectColor } from "../../../../../../../inspector/utils/getProjectColor";
import { ElementInspector } from "../../../element/elementInspector";

export class CloseElementInspector extends ElementInspector<
  ElementData<"CloseElement">
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
