import type { CommandData } from "../../../types/CommandData";
import { JumpCommandParams } from "./JumpCommandParams";

export interface JumpCommandData
  extends CommandData<"JumpCommand", JumpCommandParams> {}
