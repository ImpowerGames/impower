import { CommandData } from "../../../command/CommandData";

export interface ConditionCommandData extends CommandData<"ConditionCommand"> {
  check: "if" | "elseif" | "else" | "close";
  value: string;
}
