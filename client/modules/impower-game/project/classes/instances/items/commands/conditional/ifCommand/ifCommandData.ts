import { CommandData } from "../../../command/commandData";

export interface IfCommandData
  extends CommandData<"IfCommand" | "ElseIfCommand"> {
  value: string;
}
