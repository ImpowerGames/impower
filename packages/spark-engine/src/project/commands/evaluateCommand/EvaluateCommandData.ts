import { CommandData } from "../../command/CommandData";
import { EvaluateCommandParams } from "./EvaluateCommandParams";

export interface EvaluateCommandData
  extends CommandData<"EvaluateCommand", EvaluateCommandParams> {}
