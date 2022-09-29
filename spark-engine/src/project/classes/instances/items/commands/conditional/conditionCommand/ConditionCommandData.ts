import { CommandData } from "../../../command/CommandData";

export interface ConditionCommandData extends CommandData<"ConditionCommand"> {
  check: "if" | "elif" | "else" | "close";
  value: string;
}
