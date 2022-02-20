import { Severity } from "../../../../../../../data/enums/severity";
import { DynamicData } from "../../../../../../../data/interfaces/generics/dynamicData";
import { CommandData } from "../../../command/commandData";

export interface LogCommandData extends CommandData<"LogCommand"> {
  severity: Severity;
  message: DynamicData<string>;
}
