import type { CommandData } from "../../../types/CommandData";
import { ReturnCommandParams } from "./ReturnCommandParams";

export interface ReturnCommandData
  extends CommandData<"ReturnCommand", ReturnCommandParams> {}
