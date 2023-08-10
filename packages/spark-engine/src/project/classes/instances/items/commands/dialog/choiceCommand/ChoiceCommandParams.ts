import { CommandParams } from "../../../command/CommandParams";

export interface ChoiceCommandParams extends CommandParams {
  operator: "+" | "-" | "start" | "end";
  value: string;
  calls: Record<string, { name: string; values: string[] }>;
  content: string;
  order: number;
}
