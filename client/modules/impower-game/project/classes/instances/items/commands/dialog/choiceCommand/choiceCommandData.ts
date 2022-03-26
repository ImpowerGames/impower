import { CommandData } from "../../../command/commandData";

export interface ChoiceCommandData extends CommandData<"ChoiceCommand"> {
  value: string;
  calls: Record<string, { name: string; values: string[] }>;
  content: string;
  index: number;
  count: number;
  ui?: string;
}
