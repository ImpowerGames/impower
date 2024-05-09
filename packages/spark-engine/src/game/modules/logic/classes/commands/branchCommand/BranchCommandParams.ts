import type { CommandParams } from "../../../types/CommandParams";

export interface BranchCommandParams extends CommandParams {
  check: "if" | "elseif" | "else" | "end";
  condition: string;
}
