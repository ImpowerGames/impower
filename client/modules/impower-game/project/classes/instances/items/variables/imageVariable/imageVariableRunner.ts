import { ImageFileReference, VariableData } from "../../../../../../data";
import { VariableRunner } from "../../variable/variableRunner";

export class ImageVariableRunner extends VariableRunner<
  VariableData<"ImageVariable", ImageFileReference>
> {}
