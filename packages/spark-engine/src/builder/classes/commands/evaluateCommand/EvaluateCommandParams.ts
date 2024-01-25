import { CommandParams } from "../../../../game/modules/logic/types/CommandParams";

export interface EvaluateCommandParams extends CommandParams {
  expression: string;
}
