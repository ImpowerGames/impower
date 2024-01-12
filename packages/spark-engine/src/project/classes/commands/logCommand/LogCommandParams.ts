import { CommandParams } from "../../command/CommandParams";

export interface LogCommandParams extends CommandParams {
  severity: string;
  message: string;
}
