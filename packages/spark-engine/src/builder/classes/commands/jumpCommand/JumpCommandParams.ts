import { CommandParams } from "../../../../game/logic/types/CommandParams";

export interface JumpCommandParams extends CommandParams {
  value: string;
  returnWhenFinished: boolean;
}
