import { CommandData } from "../../../../game/modules/logic/types/CommandData";
import { WaitCommandParams } from "./WaitCommandParams";

export interface WaitCommandData
  extends CommandData<"WaitCommand", WaitCommandParams> {}
