import {
  ImageFileReference,
  TypeInfo,
  VariableData,
  VariableTypeId,
} from "../../../../../../data";
import { getProjectColor } from "../../../../../../inspector/utils/getProjectColor";
import { VariableInspector } from "../../variable/variableInspector";

export class ImageVariableInspector extends VariableInspector<
  VariableData<VariableTypeId.ImageVariable, ImageFileReference>
> {
  getTypeInfo(
    data?: VariableData<VariableTypeId.ImageVariable, ImageFileReference>
  ): TypeInfo {
    return {
      category: "Reference",
      name: `${this.getTypePrefix(data)}Image`,
      icon: "file-image",
      color: getProjectColor("indigo", 5),
      description: "Stores an image file",
    };
  }
}
