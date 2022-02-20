import {
  TextFileReference,
  TypeInfo,
  VariableData,
} from "../../../../../../data";
import { getProjectColor } from "../../../../../../inspector/utils/getProjectColor";
import { VariableInspector } from "../../variable/variableInspector";

export class TextVariableInspector extends VariableInspector<
  VariableData<"TextVariable", TextFileReference>
> {
  getTypeInfo(
    data?: VariableData<"TextVariable", TextFileReference>
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
