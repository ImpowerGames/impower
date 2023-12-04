import { CommandData } from "../../command/CommandData";
import { DisplayCommandParams } from "./DisplayCommandParams";

export interface DisplayCommandData
  extends CommandData<"DisplayCommand", DisplayCommandParams> {}
