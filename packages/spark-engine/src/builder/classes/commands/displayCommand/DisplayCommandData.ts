import { CommandData } from "../../../../game/logic/types/CommandData";
import { DisplayCommandParams } from "./DisplayCommandParams";

export interface DisplayCommandData
  extends CommandData<"DisplayCommand", DisplayCommandParams> {}
