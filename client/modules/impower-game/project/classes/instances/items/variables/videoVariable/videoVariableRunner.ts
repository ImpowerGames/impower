import {
  VideoFileReference,
  VariableData,
  VariableTypeId,
} from "../../../../../../data";
import { VariableRunner } from "../../variable/variableRunner";

export class VideoVariableRunner extends VariableRunner<
  VariableData<VariableTypeId.VideoVariable, VideoFileReference>
> {}
