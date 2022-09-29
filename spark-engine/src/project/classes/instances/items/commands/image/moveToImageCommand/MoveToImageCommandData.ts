import { Ease } from "../../../../../../../data/enums/Ease";
import { CommandData } from "../../../command/CommandData";

export interface MoveToImageCommandData
  extends CommandData<"MoveToImageCommand"> {
  image: string;
  x: number;
  y: number;
  duration: number;
  ease: Ease;
  additive: boolean;
}
