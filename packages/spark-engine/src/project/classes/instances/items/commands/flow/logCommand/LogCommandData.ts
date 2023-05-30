import { Severity } from "../../../../../../../data/enums/Severity";
import { CommandData } from "../../../command/CommandData";

export interface LogCommandData extends CommandData<"LogCommand"> {
  severity: Severity;
  message: string;
}
