import { CommandData } from "../../../../game/modules/logic/types/CommandData";
import { ClearCommandParams } from "./ClearCommandParams";

export interface ClearCommandData
  extends CommandData<"ClearCommand", ClearCommandParams> {}
