import { BlockReference } from "../../../../../../../data/interfaces/references/blockReference";
import { DynamicData } from "../../../../../../../data/interfaces/generics/dynamicData";
import { CommandData } from "../../../command/commandData";
import { CommandTypeId } from "../../../command/commandTypeId";

export interface DoCommandData extends CommandData<CommandTypeId.DoCommand> {
  block: DynamicData<BlockReference>;
}
