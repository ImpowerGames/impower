import { DynamicData } from "../../../../../../../data/interfaces/generics/dynamicData";
import { CommandData } from "../../../command/commandData";
import { CommandTypeId } from "../../../command/commandTypeId";

export interface WaitCommandData
  extends CommandData<CommandTypeId.WaitCommand> {
  seconds: DynamicData<number>;
}
