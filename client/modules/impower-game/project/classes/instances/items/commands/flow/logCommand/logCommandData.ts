import { Severity } from "../../../../../../../data/enums/severity";
import { DynamicData } from "../../../../../../../data/interfaces/generics/dynamicData";
import { CommandData } from "../../../command/commandData";
import { CommandTypeId } from "../../../command/commandTypeId";

export interface LogCommandData extends CommandData<CommandTypeId.LogCommand> {
  severity: Severity;
  message: DynamicData<string>;
}
