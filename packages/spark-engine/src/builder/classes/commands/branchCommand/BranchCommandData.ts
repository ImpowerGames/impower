import { CommandData } from "../../../../game/logic/types/CommandData";
import { BranchCommandParams } from "./BranchCommandParams";

export interface BranchCommandData
  extends CommandData<"BranchCommand", BranchCommandParams> {}
