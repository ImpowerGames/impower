import type { CommandData } from "../../../types/CommandData";
import type { BranchCommandParams } from "./BranchCommandParams";

export interface BranchCommandData
  extends CommandData<"BranchCommand", BranchCommandParams> {}
