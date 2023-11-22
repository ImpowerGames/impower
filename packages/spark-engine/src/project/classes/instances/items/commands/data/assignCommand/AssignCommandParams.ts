import { CommandParams } from "../../../command/CommandParams";

export interface AssignCommandParams extends CommandParams {
  variable: string;
  operator: string;
  value: string;
}
