import { VariableData, TypeInfo, VariableTypeId } from "../../../../../../data";
import { VariableInspector } from "../../variable/variableInspector";
import { getProjectColor } from "../../../../../../inspector/utils/getProjectColor";

export class StringVariableInspector extends VariableInspector<
  VariableData<VariableTypeId.StringVariable, string>
> {
  getTypeInfo(
    data?: VariableData<VariableTypeId.StringVariable, string>
  ): TypeInfo {
    return {
      category: "Primitive",
      name: `${this.getTypePrefix(data)}String`,
      icon: "abc",
      color: getProjectColor("orange", 5),
      description: "Stores text",
    };
  }

  getPropertyDisplayValue(
    propertyPath: string,
    data: VariableData<VariableTypeId.StringVariable, string>,
    value: unknown
  ): string {
    if (propertyPath === "value") {
      return `"${value}"`;
    }
    return super.getPropertyDisplayValue(propertyPath, data, value);
  }
}
