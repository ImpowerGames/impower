import { CommandParams } from "../../command/CommandParams";

export interface BranchCommandParams extends CommandParams {
  check: "if" | "elseif" | "else" | "end";
  condition: string;
}
