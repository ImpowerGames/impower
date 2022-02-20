import { List } from "../../../../../../../../impower-core";
import { Condition } from "../../../../../../../data/interfaces/condition";
import { CommandData } from "../../../command/commandData";

export interface IfCommandData
  extends CommandData<"IfCommand" | "ElseIfCommand"> {
  conditions: List<Condition>;
  checkAll: boolean;
}
