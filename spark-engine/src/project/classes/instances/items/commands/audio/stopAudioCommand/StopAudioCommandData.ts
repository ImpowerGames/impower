import { Ease } from "../../../../../../../data/enums/Ease";
import { CommandData } from "../../../command/CommandData";

export interface StopAudioCommandData extends CommandData<"StopAudioCommand"> {
  audio: string;
  duration: number;
  ease: Ease;
}
