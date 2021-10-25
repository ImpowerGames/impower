import { VariableData, TypeInfo, VariableTypeId } from "../../../../../../data";
import { VariableInspector } from "../../variable/variableInspector";
import { getProjectColor } from "../../../../../../inspector/utils/getProjectColor";

export class BooleanVariableInspector extends VariableInspector<
  VariableData<VariableTypeId.BooleanVariable, boolean>
> {
  getTypeInfo(
    data?: VariableData<VariableTypeId.BooleanVariable, boolean>
  ): TypeInfo {
    return {
      category: "Primitive",
      name: `${this.getTypePrefix(data)}Boolean`,
      icon: "check-square",
      color: getProjectColor("orange", 5),
      description: "Stores true or false",
    };
  }
}
