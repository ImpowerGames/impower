import type { CommandParams } from "../../../types/CommandParams";

export interface WaitCommandParams extends CommandParams {
  seconds: number;
}
