import { CommandParams } from "../../../../game/logic/types/CommandParams";

export interface LogCommandParams extends CommandParams {
  severity: string;
  message: string;
}
