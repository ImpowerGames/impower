import type { CommandData } from "../../../../logic/types/CommandData";
import type { DestroyCommandParams } from "./DestroyCommandParams";

export interface DestroyCommandData
  extends CommandData<"DestroyCommand", DestroyCommandParams> {}
