import { CommandData } from "../../../../game/logic/types/CommandData";
import { WaitCommandParams } from "./WaitCommandParams";

export interface WaitCommandData
  extends CommandData<"WaitCommand", WaitCommandParams> {}
