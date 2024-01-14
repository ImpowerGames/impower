import { CommandParams } from "../../../../game/logic/types/CommandParams";

export interface BranchCommandParams extends CommandParams {
  check: "if" | "elseif" | "else" | "end";
  condition: string;
}
