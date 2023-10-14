import { CommandParams } from "../../../command/CommandParams";

export interface EnterCommandParams extends CommandParams {
  value: string;
  returnWhenFinished: boolean;
}
