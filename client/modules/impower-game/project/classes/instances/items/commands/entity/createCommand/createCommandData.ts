import { DynamicData } from "../../../../../../../data/interfaces/generics/dynamicData";
import { ConstructReference } from "../../../../../../../data/interfaces/references/constructReference";
import { CommandData } from "../../../command/commandData";

export interface CreateCommandData extends CommandData<"CreateCommand"> {
  construct: DynamicData<ConstructReference>;
}
