import {
  ConstructReference,
  TypeInfo,
  VariableData,
} from "../../../../../../data";
import { getProjectColor } from "../../../../../../inspector/utils/getProjectColor";
import { VariableInspector } from "../../variable/variableInspector";

export class ConstructVariableInspector extends VariableInspector<
  VariableData<"ConstructVariable", ConstructReference>
> {
  getTypeInfo(
    data?: VariableData<"ConstructVariable", ConstructReference>
  ): TypeInfo {
    return {
      category: "Reference",
      name: `${this.getTypePrefix(data)}Construct`,
      icon: "cube",
      color: getProjectColor("indigo", 5),
      description: "Stores a construct",
    };
  }
}
