import { TypeInfo, VariableData } from "../../../../../../data";
import { getProjectColor } from "../../../../../../inspector/utils/getProjectColor";
import { VariableInspector } from "../../variable/variableInspector";

export class StringVariableInspector extends VariableInspector<
  VariableData<"StringVariable", string>
> {
  getTypeInfo(data?: VariableData<"StringVariable", string>): TypeInfo {
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
    data: VariableData<"StringVariable", string>,
    value: unknown
  ): string {
    if (propertyPath === "value") {
      return `"${value}"`;
    }
    return super.getPropertyDisplayValue(propertyPath, data, value);
  }
}
