import { Color } from "../../../../../../../impower-core";
import { TypeInfo, VariableData } from "../../../../../../data";
import { getProjectColor } from "../../../../../../inspector/utils/getProjectColor";
import { VariableInspector } from "../../variable/variableInspector";

export class ColorVariableInspector extends VariableInspector<
  VariableData<"ColorVariable", Color>
> {
  getTypeInfo(data?: VariableData<"ColorVariable", Color>): TypeInfo {
    return {
      category: "Structure",
      name: `${this.getTypePrefix(data)}Color`,
      icon: "tint",
      color: getProjectColor("green", 5),
      description: "Stores a color",
    };
  }
}
