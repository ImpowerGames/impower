import { CommandData } from "../../../../game/logic/types/CommandData";
import { DestroyCommandParams } from "./DestroyCommandParams";

export interface DestroyCommandData
  extends CommandData<"DestroyCommand", DestroyCommandParams> {}
