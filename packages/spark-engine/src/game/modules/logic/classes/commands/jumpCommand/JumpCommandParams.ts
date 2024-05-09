import type { CommandParams } from "../../../types/CommandParams";

export interface JumpCommandParams extends CommandParams {
  value: string;
  returnWhenFinished: boolean;
}
