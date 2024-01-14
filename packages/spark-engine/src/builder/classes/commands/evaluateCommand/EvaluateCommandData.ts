import { CommandData } from "../../../../game/logic/types/CommandData";
import { EvaluateCommandParams } from "./EvaluateCommandParams";

export interface EvaluateCommandData
  extends CommandData<"EvaluateCommand", EvaluateCommandParams> {}
