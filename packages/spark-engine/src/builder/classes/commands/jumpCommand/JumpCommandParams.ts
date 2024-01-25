import { CommandParams } from "../../../../game/modules/logic/types/CommandParams";

export interface JumpCommandParams extends CommandParams {
  value: string;
  returnWhenFinished: boolean;
}
