import { Command } from "./Command";

export interface CommandRunner {
  onExecute: (command: Command) => number[];
  isFinished: (command: Command) => boolean | null;
  onFinished: (command: Command) => void;
}
