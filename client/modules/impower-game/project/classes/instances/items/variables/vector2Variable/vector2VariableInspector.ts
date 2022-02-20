import { Vector2 } from "../../../../../../../impower-core";
import { TypeInfo, VariableData } from "../../../../../../data";
import { getProjectColor } from "../../../../../../inspector/utils/getProjectColor";
import { VariableInspector } from "../../variable/variableInspector";

export class Vector2VariableInspector extends VariableInspector<
  VariableData<"Vector2Variable", Vector2>
> {
  getTypeInfo(data?: VariableData<"Vector2Variable", Vector2>): TypeInfo {
    return {
      category: "Structure",
      name: `${this.getTypePrefix(data)}Vector2`,
      icon: "chart-line",
      color: getProjectColor("green", 5),
      description: "Stores a vector",
    };
  }

  getPropertyDisplayValue(
    propertyPath: string,
    data: VariableData<"Vector2Variable", Vector2>,
    value: Vector2
  ): string {
    if (propertyPath === "value") {
      return `<x: ${value.x}, y: ${value.y}>`;
    }
    return super.getPropertyDisplayValue(propertyPath, data, value);
  }
}
