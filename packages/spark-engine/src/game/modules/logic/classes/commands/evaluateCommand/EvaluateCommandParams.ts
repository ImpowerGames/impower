import type { CommandParams } from "../../../types/CommandParams";

export interface EvaluateCommandParams extends CommandParams {
  expression: string;
}
