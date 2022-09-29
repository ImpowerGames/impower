import { SetOperator } from "../../../../../../../data/enums/SetOperator";
import { CommandData } from "../../../command/CommandData";

export interface AssignCommandData extends CommandData<"AssignCommand"> {
  variable: string;
  operator: SetOperator;
  value: string;
}
