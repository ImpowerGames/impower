import { Ease } from "../../../../../../../data/enums/ease";
import { CommandData } from "../../../command/commandData";

export interface HideImageCommandData extends CommandData<"HideImageCommand"> {
  image: string;
  duration: number;
  ease: Ease;
}
