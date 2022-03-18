import { Ease } from "../../../../../../../data/enums/ease";
import { CommandData } from "../../../command/commandData";

export interface ScaleToImageCommandData
  extends CommandData<"ScaleToImageCommand"> {
  image: string;
  duration: number;
  x: number;
  y: number;
  ease: Ease;
  additive: boolean;
}
