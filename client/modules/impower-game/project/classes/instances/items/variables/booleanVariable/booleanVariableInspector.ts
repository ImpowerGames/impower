import { TypeInfo, VariableData } from "../../../../../../data";
import { getProjectColor } from "../../../../../../inspector/utils/getProjectColor";
import { VariableInspector } from "../../variable/variableInspector";

export class BooleanVariableInspector extends VariableInspector<
  VariableData<"BooleanVariable", boolean>
> {
  getTypeInfo(data?: VariableData<"BooleanVariable", boolean>): TypeInfo {
    return {
      category: "Primitive",
      name: `${this.getTypePrefix(data)}Boolean`,
      icon: "check-square",
      color: getProjectColor("orange", 5),
      description: "Stores true or false",
    };
  }
}
