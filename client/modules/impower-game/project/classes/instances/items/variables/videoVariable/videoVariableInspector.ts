import {
  TypeInfo,
  VariableData,
  VideoFileReference,
} from "../../../../../../data";
import { getProjectColor } from "../../../../../../inspector/utils/getProjectColor";
import { VariableInspector } from "../../variable/variableInspector";

export class VideoVariableInspector extends VariableInspector<
  VariableData<"VideoVariable", VideoFileReference>
> {
  getTypeInfo(
    data?: VariableData<"VideoVariable", VideoFileReference>
  ): TypeInfo {
    return {
      category: "Reference",
      name: `${this.getTypePrefix(data)}Video`,
      icon: "file-video",
      color: getProjectColor("indigo", 5),
      description: "Stores a video file",
    };
  }
}
