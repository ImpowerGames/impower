import { CommandData } from "../../../../game/modules/logic/types/CommandData";
import { DisplayCommandParams } from "./DisplayCommandParams";

export interface DisplayCommandData
  extends CommandData<"DisplayCommand", DisplayCommandParams> {}
