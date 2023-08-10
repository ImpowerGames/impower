import { SetOperator } from "../../../../../../../data/enums/SetOperator";
import { CommandParams } from "../../../command/CommandParams";

export interface AssignCommandParams extends CommandParams {
  variable: string;
  operator: SetOperator;
  value: string;
}
