import { Ease } from "../../../../../../../data/enums/ease";
import { CommandData } from "../../../command/commandData";

export interface PauseAudioCommandData
  extends CommandData<"PauseAudioCommand"> {
  audio: string;
  duration: number;
  ease: Ease;
}
