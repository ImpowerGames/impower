import { CommandData } from "../../../../game/logic/types/CommandData";
import { LogCommandParams } from "./LogCommandParams";

export interface LogCommandData
  extends CommandData<"LogCommand", LogCommandParams> {}
