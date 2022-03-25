import { CommandData } from "../../../command/commandData";

export interface ConditionCommandData extends CommandData<"ConditionCommand"> {
  check: "if" | "elif" | "else" | "close";
  value: string;
}
