import {
  AudioFileReference,
  TypeInfo,
  VariableData,
  VariableTypeId,
} from "../../../../../../data";
import { getProjectColor } from "../../../../../../inspector/utils/getProjectColor";
import { VariableInspector } from "../../variable/variableInspector";

export class AudioVariableInspector extends VariableInspector<
  VariableData<VariableTypeId.AudioVariable, AudioFileReference>
> {
  getTypeInfo(
    data?: VariableData<VariableTypeId.AudioVariable, AudioFileReference>
  ): TypeInfo {
    return {
      category: "Reference",
      name: `${this.getTypePrefix(data)}Audio`,
      icon: "file-audio",
      color: getProjectColor("indigo", 5),
      description: "Stores an audio file",
    };
  }
}
