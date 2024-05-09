import type { CommandData } from "../../../types/CommandData";
import { LogCommandParams } from "./LogCommandParams";

export interface LogCommandData
  extends CommandData<"LogCommand", LogCommandParams> {}
