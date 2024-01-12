import { CommandData } from "../../command/CommandData";
import { JumpCommandParams } from "./JumpCommandParams";

export interface JumpCommandData
  extends CommandData<"JumpCommand", JumpCommandParams> {}
