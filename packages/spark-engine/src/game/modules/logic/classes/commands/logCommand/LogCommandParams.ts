import type { CommandParams } from "../../../types/CommandParams";

export interface LogCommandParams extends CommandParams {
  severity: string;
  message: string;
}