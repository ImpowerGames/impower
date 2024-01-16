import { CommandData } from "../../../../game/logic/types/CommandData";
import { ClearCommandParams } from "./ClearCommandParams";

export interface ClearCommandData
  extends CommandData<"ClearCommand", ClearCommandParams> {}
