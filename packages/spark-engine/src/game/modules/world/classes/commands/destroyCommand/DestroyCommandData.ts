import type { CommandData } from "../../../../../core/types/CommandData";
import type { DestroyCommandParams } from "./DestroyCommandParams";

export interface DestroyCommandData
  extends CommandData<"DestroyCommand", DestroyCommandParams> {}
