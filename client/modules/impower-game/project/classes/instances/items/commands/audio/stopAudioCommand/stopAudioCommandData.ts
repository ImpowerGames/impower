import { Ease } from "../../../../../../../data/enums/ease";
import { CommandData } from "../../../command/commandData";

export interface StopAudioCommandData extends CommandData<"StopAudioCommand"> {
  audio: string;
  duration: number;
  ease: Ease;
}
