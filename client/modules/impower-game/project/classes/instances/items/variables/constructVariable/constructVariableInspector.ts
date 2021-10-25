import {
  VariableData,
  TypeInfo,
  ConstructReference,
  VariableTypeId,
} from "../../../../../../data";
import { getProjectColor } from "../../../../../../inspector/utils/getProjectColor";
import { VariableInspector } from "../../variable/variableInspector";

export class ConstructVariableInspector extends VariableInspector<
  VariableData<VariableTypeId.ConstructVariable, ConstructReference>
> {
  getTypeInfo(
    data?: VariableData<VariableTypeId.ConstructVariable, ConstructReference>
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
