import { CommandParams } from "../../command/CommandParams";

export interface JumpCommandParams extends CommandParams {
  value: string;
  returnWhenFinished: boolean;
}
