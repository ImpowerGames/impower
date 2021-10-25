import { DynamicData } from "../../../../../../../data/interfaces/generics/dynamicData";
import { CommandData } from "../../../command/commandData";
import { ConstructReference } from "../../../../../../../data/interfaces/references/constructReference";
import { CommandTypeId } from "../../../command/commandTypeId";

export interface DestroyCommandData
  extends CommandData<CommandTypeId.DestroyCommand> {
  construct: DynamicData<ConstructReference>;
}
