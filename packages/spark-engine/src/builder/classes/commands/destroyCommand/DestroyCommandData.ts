import { CommandData } from "../../../../game/modules/logic/types/CommandData";
import { DestroyCommandParams } from "./DestroyCommandParams";

export interface DestroyCommandData
  extends CommandData<"DestroyCommand", DestroyCommandParams> {}
