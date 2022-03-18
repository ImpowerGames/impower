import { Ease } from "../../../../../../../data/enums/ease";
import { CommandData } from "../../../command/commandData";

export interface PlayAudioCommandData extends CommandData<"PlayAudioCommand"> {
  audio: string;
  volume: number;
  loop: boolean;
  duration: number;
  ease: Ease;
}
