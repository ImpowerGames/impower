import { Severity } from "../../../../../../../data/enums/Severity";
import { CommandParams } from "../../../command/CommandParams";

export interface LogCommandParams extends CommandParams {
  severity: Severity;
  message: string;
}
