import { CommandData } from "../../../command/commandData";

export interface EnterCommandData extends CommandData<"EnterCommand"> {
  name: string;
  values: string[];
  returnWhenFinished: boolean;
}
