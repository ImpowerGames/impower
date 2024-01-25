import { CommandData } from "../../../../game/modules/logic/types/CommandData";
import { ReturnCommandParams } from "./ReturnCommandParams";

export interface ReturnCommandData
  extends CommandData<"ReturnCommand", ReturnCommandParams> {}
