import { CommandData } from "../../../command/commandData";

export interface ChoiceCommandData extends CommandData<"ChoiceCommand"> {
  operator: "+" | "-";
  value: string;
  calls: Record<string, { name: string; values: string[] }>;
  content: string;
  index: number;
  count: number;
}
