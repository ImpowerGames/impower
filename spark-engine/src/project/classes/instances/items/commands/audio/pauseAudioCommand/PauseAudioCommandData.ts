import { Ease } from "../../../../../../../data/enums/Ease";
import { CommandData } from "../../../command/CommandData";

export interface PauseAudioCommandData
  extends CommandData<"PauseAudioCommand"> {
  audio: string;
  duration: number;
  ease: Ease;
}
