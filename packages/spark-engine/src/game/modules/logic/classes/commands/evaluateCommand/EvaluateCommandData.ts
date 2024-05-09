import type { CommandData } from "../../../types/CommandData";
import { EvaluateCommandParams } from "./EvaluateCommandParams";

export interface EvaluateCommandData
  extends CommandData<"EvaluateCommand", EvaluateCommandParams> {}
