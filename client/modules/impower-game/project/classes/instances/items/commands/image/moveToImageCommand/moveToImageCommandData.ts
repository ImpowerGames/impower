import { Ease } from "../../../../../../../data/enums/ease";
import { CommandData } from "../../../command/commandData";

export interface MoveToImageCommandData
  extends CommandData<"MoveToImageCommand"> {
  image: string;
  x: number;
  y: number;
  duration: number;
  ease: Ease;
  additive: boolean;
}
