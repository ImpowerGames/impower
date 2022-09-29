import { Ease } from "../../../../../../../data/enums/Ease";
import { CommandData } from "../../../command/CommandData";

export interface HideImageCommandData extends CommandData<"HideImageCommand"> {
  image: string;
  duration: number;
  ease: Ease;
}
