import { AudioFileReference, VariableData } from "../../../../../../data";
import { VariableRunner } from "../../variable/variableRunner";

export class AudioVariableRunner extends VariableRunner<
  VariableData<"AudioVariable", AudioFileReference>
> {}
