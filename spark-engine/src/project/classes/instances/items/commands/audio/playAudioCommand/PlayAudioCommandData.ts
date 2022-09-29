import { Ease } from "../../../../../../../data/enums/Ease";
import { CommandData } from "../../../command/CommandData";

export interface PlayAudioCommandData extends CommandData<"PlayAudioCommand"> {
  audio: string;
  volume: number;
  loop: boolean;
  duration: number;
  ease: Ease;
}
