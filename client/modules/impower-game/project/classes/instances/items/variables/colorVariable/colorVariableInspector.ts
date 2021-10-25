import { Color } from "../../../../../../../impower-core";
import { VariableData, TypeInfo, VariableTypeId } from "../../../../../../data";
import { VariableInspector } from "../../variable/variableInspector";
import { getProjectColor } from "../../../../../../inspector/utils/getProjectColor";

export class ColorVariableInspector extends VariableInspector<
  VariableData<VariableTypeId.ColorVariable, Color>
> {
  getTypeInfo(
    data?: VariableData<VariableTypeId.ColorVariable, Color>
  ): TypeInfo {
    return {
      category: "Structure",
      name: `${this.getTypePrefix(data)}Color`,
      icon: "tint",
      color: getProjectColor("green", 5),
      description: "Stores a color",
    };
  }
}
