import { AudioFileReference } from "../../../../../../../data";
import { TransitionConfig } from "../../../../../../../data/interfaces/configs/transitionConfig";
import { DynamicData } from "../../../../../../../data/interfaces/generics/dynamicData";
import { CommandData } from "../../../command/commandData";

export interface PlayAudioCommandData extends CommandData<"PlayAudioCommand"> {
  audio: DynamicData<AudioFileReference>;
  volume: DynamicData<number>;
  loop: DynamicData<boolean>;
  transition: TransitionConfig;
}
