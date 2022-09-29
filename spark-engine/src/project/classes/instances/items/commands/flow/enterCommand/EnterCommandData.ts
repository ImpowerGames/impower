import { CommandData } from "../../../command/CommandData";

export interface EnterCommandData extends CommandData<"EnterCommand"> {
  value: string;
  calls: Record<string, { name: string; values: string[] }>;
  returnWhenFinished: boolean;
}
