import { CommandParams } from "../../../../game/modules/logic/types/CommandParams";

export interface LogCommandParams extends CommandParams {
  severity: string;
  message: string;
}
