import { CommandData } from "../../../command/commandData";

export interface WaitCommandData extends CommandData<"WaitCommand"> {
  seconds: number;
}
