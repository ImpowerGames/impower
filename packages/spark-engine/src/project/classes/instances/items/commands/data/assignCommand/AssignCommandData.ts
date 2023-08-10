import { CommandData } from "../../../command/CommandData";
import { AssignCommandParams } from "./AssignCommandParams";

export interface AssignCommandData
  extends CommandData<"AssignCommand", AssignCommandParams> {}
