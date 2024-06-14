import type { CommandData } from "../../../../../core/types/CommandData";
import type { DisplayCommandParams } from "./DisplayCommandParams";

export interface DisplayCommandData
  extends CommandData<"DisplayCommand", DisplayCommandParams> {}
