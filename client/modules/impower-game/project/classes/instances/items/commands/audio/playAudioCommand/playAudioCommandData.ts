import { AudioFileReference, CommandTypeId } from "../../../../../../../data";
import { DynamicData } from "../../../../../../../data/interfaces/generics/dynamicData";
import { TransitionConfig } from "../../../../../../../data/interfaces/configs/transitionConfig";
import { CommandData } from "../../../command/commandData";

export interface PlayAudioCommandData
  extends CommandData<CommandTypeId.PlayAudioCommand> {
  audio: DynamicData<AudioFileReference>;
  volume: DynamicData<number>;
  loop: DynamicData<boolean>;
  transition: TransitionConfig;
}
