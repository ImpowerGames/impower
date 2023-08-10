import { CommandData } from "../../../command/CommandData";
import { DestroyCommandParams } from "./DestroyCommandParams";

export interface DestroyCommandData
  extends CommandData<"DestroyCommand", DestroyCommandParams> {}
