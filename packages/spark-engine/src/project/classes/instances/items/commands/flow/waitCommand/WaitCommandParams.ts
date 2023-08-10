import { CommandParams } from "../../../command/CommandParams";

export interface WaitCommandParams extends CommandParams {
  seconds: number;
}
