import { Ease } from "../../../../../../../data/enums/ease";
import { CommandData } from "../../../command/commandData";

export interface ResumeAudioCommandData
  extends CommandData<"ResumeAudioCommand"> {
  audio: string;
  duration: number;
  ease: Ease;
}
