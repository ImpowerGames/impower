import { CommandData } from "../../command/CommandData";
import { WaitCommandParams } from "./WaitCommandParams";

export interface WaitCommandData
  extends CommandData<"WaitCommand", WaitCommandParams> {}
