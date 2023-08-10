import { CommandData } from "../../../command/CommandData";
import { ConditionCommandParams } from "./ConditionCommandParams";

export interface ConditionCommandData
  extends CommandData<"ConditionCommand", ConditionCommandParams> {}
