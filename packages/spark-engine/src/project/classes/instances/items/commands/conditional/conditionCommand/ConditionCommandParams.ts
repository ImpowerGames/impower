import { CommandParams } from "../../../command/CommandParams";

export interface ConditionCommandParams extends CommandParams {
  check: "if" | "elseif" | "else" | "close";
  value: string;
}
