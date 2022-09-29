import { Ease } from "../../../../../../../data/enums/Ease";
import { CommandData } from "../../../command/CommandData";

export interface ResumeAudioCommandData
  extends CommandData<"ResumeAudioCommand"> {
  audio: string;
  duration: number;
  ease: Ease;
}
