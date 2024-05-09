import type { CommandData } from "../../../types/CommandData";
import { WaitCommandParams } from "./WaitCommandParams";

export interface WaitCommandData
  extends CommandData<"WaitCommand", WaitCommandParams> {}
