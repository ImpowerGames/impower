import { AudioFileReference } from "../../../../../../../data";
import { TransitionConfig } from "../../../../../../../data/interfaces/configs/transitionConfig";
import { DynamicData } from "../../../../../../../data/interfaces/generics/dynamicData";
import { CommandData } from "../../../command/commandData";

export interface ResumeAudioCommandData
  extends CommandData<"ResumeAudioCommand"> {
  audio: DynamicData<AudioFileReference>;
  transition: TransitionConfig;
}
