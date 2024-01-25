import { CommandData } from "../../../../game/modules/logic/types/CommandData";
import { LogCommandParams } from "./LogCommandParams";

export interface LogCommandData
  extends CommandData<"LogCommand", LogCommandParams> {}
