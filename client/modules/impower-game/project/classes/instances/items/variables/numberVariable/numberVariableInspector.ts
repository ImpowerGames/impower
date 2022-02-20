import { TypeInfo, VariableData } from "../../../../../../data";
import { getProjectColor } from "../../../../../../inspector/utils/getProjectColor";
import { VariableInspector } from "../../variable/variableInspector";

export class NumberVariableInspector extends VariableInspector<
  VariableData<"NumberVariable", number>
> {
  getTypeInfo(data?: VariableData<"NumberVariable", number>): TypeInfo {
    return {
      category: "Primitive",
      name: `${this.getTypePrefix(data)}Number`,
      icon: "123",
      color: getProjectColor("orange", 5),
      description: "Stores a number",
    };
  }
}
