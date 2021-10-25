import {
  TextFileReference,
  TypeInfo,
  VariableData,
  VariableTypeId,
} from "../../../../../../data";
import { getProjectColor } from "../../../../../../inspector/utils/getProjectColor";
import { VariableInspector } from "../../variable/variableInspector";

export class TextVariableInspector extends VariableInspector<
  VariableData<VariableTypeId.TextVariable, TextFileReference>
> {
  getTypeInfo(
    data?: VariableData<VariableTypeId.TextVariable, TextFileReference>
  ): TypeInfo {
    return {
      category: "Reference",
      name: `${this.getTypePrefix(data)}Text`,
      icon: "file-alt",
      color: getProjectColor("indigo", 5),
      description: "Stores a text file",
    };
  }
}
