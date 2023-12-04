import { CommandParams } from "../../command/CommandParams";

export interface EvaluateCommandParams extends CommandParams {
  expression: string;
}
