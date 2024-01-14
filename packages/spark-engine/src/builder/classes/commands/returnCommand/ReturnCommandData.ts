import { CommandData } from "../../../../game/logic/types/CommandData";
import { ReturnCommandParams } from "./ReturnCommandParams";

export interface ReturnCommandData
  extends CommandData<"ReturnCommand", ReturnCommandParams> {}
