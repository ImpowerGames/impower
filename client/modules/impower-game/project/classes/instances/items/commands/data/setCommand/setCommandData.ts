import { SetOperator } from "../../../../../../../data/enums/setOperator";
import { DynamicData } from "../../../../../../../data/interfaces/generics/dynamicData";
import { VariableReference } from "../../../../../../../data/interfaces/references/variableReference";
import { CommandData } from "../../../command/commandData";
import { CommandTypeId } from "../../../command/commandTypeId";

export interface SetCommandData extends CommandData<CommandTypeId.SetCommand> {
  variable: VariableReference;
  operator: SetOperator;
  value: DynamicData;
}
