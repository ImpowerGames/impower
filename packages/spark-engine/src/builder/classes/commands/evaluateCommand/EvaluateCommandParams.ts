import { CommandParams } from "../../../../game/logic/types/CommandParams";

export interface EvaluateCommandParams extends CommandParams {
  expression: string;
}
