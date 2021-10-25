import {
  VariableData,
  TypeInfo,
  BlockReference,
  VariableTypeId,
} from "../../../../../../data";
import { getProjectColor } from "../../../../../../inspector/utils/getProjectColor";
import { VariableInspector } from "../../variable/variableInspector";

export class BlockVariableInspector extends VariableInspector<
  VariableData<VariableTypeId.BlockVariable, BlockReference>
> {
  getTypeInfo(
    data?: VariableData<VariableTypeId.BlockVariable, BlockReference>
  ): TypeInfo {
    return {
      category: "Reference",
      name: `${this.getTypePrefix(data)}Block`,
      icon: "square",
      color: getProjectColor("indigo", 5),
      description: "Stores a block",
    };
  }
}
