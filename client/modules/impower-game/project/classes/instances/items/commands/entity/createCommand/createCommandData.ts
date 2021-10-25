import { DynamicData } from "../../../../../../../data/interfaces/generics/dynamicData";
import { ConstructReference } from "../../../../../../../data/interfaces/references/constructReference";
import { CommandData } from "../../../command/commandData";
import { CommandTypeId } from "../../../command/commandTypeId";

export interface CreateCommandData
  extends CommandData<CommandTypeId.CreateCommand> {
  construct: DynamicData<ConstructReference>;
}
