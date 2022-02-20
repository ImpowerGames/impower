import { DynamicData } from "../../../../../../../data/interfaces/generics/dynamicData";
import { BlockReference } from "../../../../../../../data/interfaces/references/blockReference";
import { CommandData } from "../../../command/commandData";

export interface DoCommandData extends CommandData<"DoCommand"> {
  block: DynamicData<BlockReference>;
}
