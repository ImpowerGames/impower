import { Ease } from "../../../../../../../data/enums/ease";
import { CommandData } from "../../../command/commandData";

export interface RotateToImageCommandData
  extends CommandData<"RotateToImageCommand"> {
  image: string;
  angle: number;
  duration: number;
  ease: Ease;
  additive: boolean;
}
