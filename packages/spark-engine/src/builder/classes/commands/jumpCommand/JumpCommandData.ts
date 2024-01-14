import { CommandData } from "../../../../game/logic/types/CommandData";
import { JumpCommandParams } from "./JumpCommandParams";

export interface JumpCommandData
  extends CommandData<"JumpCommand", JumpCommandParams> {}
