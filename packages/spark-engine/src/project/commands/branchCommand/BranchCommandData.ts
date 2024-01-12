import { CommandData } from "../../command/CommandData";
import { BranchCommandParams } from "./BranchCommandParams";

export interface BranchCommandData
  extends CommandData<"BranchCommand", BranchCommandParams> {}
