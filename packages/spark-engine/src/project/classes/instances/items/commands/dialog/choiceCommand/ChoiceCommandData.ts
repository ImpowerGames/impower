import { CommandData } from "../../../command/CommandData";
import { ChoiceCommandParams } from "./ChoiceCommandParams";

export interface ChoiceCommandData
  extends CommandData<"ChoiceCommand", ChoiceCommandParams> {}
