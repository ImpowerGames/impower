import { Ease } from "../../../../../../../data/enums/Ease";
import { CommandData } from "../../../command/CommandData";

export interface ShowImageCommandData extends CommandData<"ShowImageCommand"> {
  image: string;
  x: number;
  y: number;
  duration: number;
  ease: Ease;
}
