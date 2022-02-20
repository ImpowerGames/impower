import { VariableData, VideoFileReference } from "../../../../../../data";
import { VariableRunner } from "../../variable/variableRunner";

export class VideoVariableRunner extends VariableRunner<
  VariableData<"VideoVariable", VideoFileReference>
> {}
