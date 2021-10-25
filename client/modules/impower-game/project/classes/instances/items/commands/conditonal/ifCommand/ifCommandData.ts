import { List } from "../../../../../../../../impower-core";
import { CommandTypeId } from "../../../../../../../data";
import { Condition } from "../../../../../../../data/interfaces/condition";
import { CommandData } from "../../../command/commandData";

export interface IfCommandData
  extends CommandData<CommandTypeId.IfCommand | CommandTypeId.ElseIfCommand> {
  conditions: List<Condition>;
  checkAll: boolean;
}
