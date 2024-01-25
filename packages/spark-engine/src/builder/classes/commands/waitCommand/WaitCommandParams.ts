import { CommandParams } from "../../../../game/modules/logic/types/CommandParams";

export interface WaitCommandParams extends CommandParams {
  seconds: number;
}
