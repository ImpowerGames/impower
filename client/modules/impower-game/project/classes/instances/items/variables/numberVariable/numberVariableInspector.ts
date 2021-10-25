import { VariableData, TypeInfo, VariableTypeId } from "../../../../../../data";
import { VariableInspector } from "../../variable/variableInspector";
import { getProjectColor } from "../../../../../../inspector/utils/getProjectColor";

export class NumberVariableInspector extends VariableInspector<
  VariableData<VariableTypeId.NumberVariable, number>
> {
  getTypeInfo(
    data?: VariableData<VariableTypeId.NumberVariable, number>
  ): TypeInfo {
    return {
      category: "Primitive",
      name: `${this.getTypePrefix(data)}Number`,
      icon: "123",
      color: getProjectColor("orange", 5),
      description: "Stores a number",
    };
  }
}
