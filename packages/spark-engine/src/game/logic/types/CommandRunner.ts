import { Command } from "./Command";
import { CommandContext } from "./CommandContext";

export interface CommandRunner {
  onExecute: (command: Command, context: CommandContext) => number[];
  isFinished: (command: Command, context: CommandContext) => boolean | null;
  onFinished: (command: Command, context: CommandContext) => void;
}
