import { AudioFileReference, CommandTypeId } from "../../../../../../../data";
import { DynamicData } from "../../../../../../../data/interfaces/generics/dynamicData";
import { TransitionConfig } from "../../../../../../../data/interfaces/configs/transitionConfig";
import { CommandData } from "../../../command/commandData";

export interface StopAudioCommandData
  extends CommandData<CommandTypeId.StopAudioCommand> {
  audio: DynamicData<AudioFileReference>;
  transition: TransitionConfig;
}
