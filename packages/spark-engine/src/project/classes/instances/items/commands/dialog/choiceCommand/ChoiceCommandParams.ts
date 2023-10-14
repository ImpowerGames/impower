import { CommandParams } from "../../../command/CommandParams";

export interface ChoiceCommandParams extends CommandParams {
  operator: "+" | "-" | "start" | "end";
  value: string;
  content: string;
  order: number;
}
