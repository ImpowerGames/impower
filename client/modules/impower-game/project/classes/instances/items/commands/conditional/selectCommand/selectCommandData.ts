import { IterationMode } from "../../../../../../../data/enums/iterationMode";
import { CommandData } from "../../../command/commandData";

export interface SelectCommandData extends CommandData<"SelectCommand"> {
  mode: IterationMode;
  randomized: boolean;
}
