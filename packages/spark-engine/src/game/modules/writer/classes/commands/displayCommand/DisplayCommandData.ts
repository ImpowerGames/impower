import type { CommandData } from "../../../../logic/types/CommandData";
import type { DisplayCommandParams } from "./DisplayCommandParams";

export interface DisplayCommandData
  extends CommandData<"DisplayCommand", DisplayCommandParams> {}
