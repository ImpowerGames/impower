import { CommandData } from "../../../command/CommandData";
import { EnterCommandParams } from "./EnterCommandParams";

export interface EnterCommandData
  extends CommandData<"EnterCommand", EnterCommandParams> {}
