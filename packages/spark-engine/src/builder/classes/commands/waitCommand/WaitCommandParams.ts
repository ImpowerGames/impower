import { CommandParams } from "../../../../game/logic/types/CommandParams";

export interface WaitCommandParams extends CommandParams {
  seconds: number;
}
