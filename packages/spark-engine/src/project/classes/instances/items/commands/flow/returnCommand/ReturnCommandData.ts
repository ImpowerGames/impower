import { CommandData } from "../../../command/CommandData";
import { ReturnCommandParams } from "./ReturnCommandParams";

export interface ReturnCommandData
  extends CommandData<"ReturnCommand", ReturnCommandParams> {}
