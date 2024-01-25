import { CommandData } from "../../../../game/modules/logic/types/CommandData";
import { JumpCommandParams } from "./JumpCommandParams";

export interface JumpCommandData
  extends CommandData<"JumpCommand", JumpCommandParams> {}
