import { CommandData } from "../../command/CommandData";
import { LogCommandParams } from "./LogCommandParams";

export interface LogCommandData
  extends CommandData<"LogCommand", LogCommandParams> {}
