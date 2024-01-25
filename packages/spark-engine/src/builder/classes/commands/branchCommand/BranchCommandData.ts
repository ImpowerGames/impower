import { CommandData } from "../../../../game/modules/logic/types/CommandData";
import { BranchCommandParams } from "./BranchCommandParams";

export interface BranchCommandData
  extends CommandData<"BranchCommand", BranchCommandParams> {}
