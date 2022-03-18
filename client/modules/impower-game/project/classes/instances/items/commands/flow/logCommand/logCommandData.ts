import { Severity } from "../../../../../../../data/enums/severity";
import { CommandData } from "../../../command/commandData";

export interface LogCommandData extends CommandData<"LogCommand"> {
  severity: Severity;
  message: string;
}
