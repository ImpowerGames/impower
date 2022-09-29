import { Ease } from "../../../../../../../data/enums/Ease";
import { CommandData } from "../../../command/CommandData";

export interface ScaleToImageCommandData
  extends CommandData<"ScaleToImageCommand"> {
  image: string;
  duration: number;
  x: number;
  y: number;
  ease: Ease;
  additive: boolean;
}
