import { Ease } from "../../../../../../../data/enums/Ease";
import { CommandData } from "../../../command/CommandData";

export interface RotateToImageCommandData
  extends CommandData<"RotateToImageCommand"> {
  image: string;
  angle: number;
  duration: number;
  ease: Ease;
  additive: boolean;
}
