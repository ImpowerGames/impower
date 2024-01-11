import { Command } from "./Command";

export interface CommandContext {
  index: number;
  commands: Command[];
}
