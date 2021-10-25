import {
  AudioFileReference,
  VariableData,
  VariableTypeId,
} from "../../../../../../data";
import { VariableRunner } from "../../variable/variableRunner";

export class AudioVariableRunner extends VariableRunner<
  VariableData<VariableTypeId.AudioVariable, AudioFileReference>
> {}
