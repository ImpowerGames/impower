import type { CommandData } from "../../../types/CommandData";
import type { ClearCommandParams } from "./ClearCommandParams";

export interface ClearCommandData
  extends CommandData<"ClearCommand", ClearCommandParams> {}
