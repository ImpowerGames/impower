import { CommandParams } from "../../../command/CommandParams";

export interface EnterCommandParams extends CommandParams {
  value: string;
  calls: Record<string, { name: string; values: string[] }>;
  returnWhenFinished: boolean;
}
