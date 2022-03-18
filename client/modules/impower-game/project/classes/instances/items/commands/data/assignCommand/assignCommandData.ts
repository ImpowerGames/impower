import { SetOperator } from "../../../../../../../data/enums/setOperator";
import { CommandData } from "../../../command/commandData";

export interface AssignCommandData extends CommandData<"AssignCommand"> {
  variable: string;
  operator: SetOperator;
  value: string;
}
