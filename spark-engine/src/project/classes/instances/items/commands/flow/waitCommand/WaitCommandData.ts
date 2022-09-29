import { CommandData } from "../../../command/CommandData";

export interface WaitCommandData extends CommandData<"WaitCommand"> {
  seconds: number;
}
