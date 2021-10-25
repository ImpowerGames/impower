import { DynamicData } from "../../../../../../../data";
import { IterationMode } from "../../../../../../../data/enums/iterationMode";
import { CommandData } from "../../../command/commandData";
import { CommandTypeId } from "../../../command/commandTypeId";

export interface SelectCommandData
  extends CommandData<CommandTypeId.SelectCommand> {
  mode: IterationMode;
  randomized: DynamicData<boolean>;
}
