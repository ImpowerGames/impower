import { AudioFileReference } from "../../../../../../../data";
import { TransitionConfig } from "../../../../../../../data/interfaces/configs/transitionConfig";
import { DynamicData } from "../../../../../../../data/interfaces/generics/dynamicData";
import { CommandData } from "../../../command/commandData";

export interface StopAudioCommandData extends CommandData<"StopAudioCommand"> {
  audio: DynamicData<AudioFileReference>;
  transition: TransitionConfig;
}
