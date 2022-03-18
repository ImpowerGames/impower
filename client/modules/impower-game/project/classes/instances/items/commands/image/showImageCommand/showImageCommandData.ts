import { Ease } from "../../../../../../../data/enums/ease";
import { CommandData } from "../../../command/commandData";

export interface ShowImageCommandData extends CommandData<"ShowImageCommand"> {
  image: string;
  x: number;
  y: number;
  duration: number;
  ease: Ease;
}
