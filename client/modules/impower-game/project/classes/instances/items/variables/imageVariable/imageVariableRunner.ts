import {
  ImageFileReference,
  VariableData,
  VariableTypeId,
} from "../../../../../../data";
import { VariableRunner } from "../../variable/variableRunner";

export class ImageVariableRunner extends VariableRunner<
  VariableData<VariableTypeId.ImageVariable, ImageFileReference>
> {}
