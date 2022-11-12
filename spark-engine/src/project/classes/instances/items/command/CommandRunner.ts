import { CommandData } from "../../../../../data";
import { SparkGame } from "../../../../../game";
import { ItemRunner } from "../../item/ItemRunner";

export interface CommandContext {
  ids: Record<string, string>;
  valueMap: Record<string, unknown>;
  objectMap: Record<string, Record<string, unknown>>;
  triggers: string[];
  parameters: string[];
  index: number;
  commands: {
    runner: CommandRunner;
    data: CommandData;
  }[];
  instant?: boolean;
  debug?: boolean;
}

export class CommandRunner<
  T extends CommandData = CommandData
> extends ItemRunner<T> {
  init(_game: SparkGame): void {
    // NoOp
  }

  onExecute(_data: T, _context: CommandContext, _game: SparkGame): number[] {
    return [];
  }

  onUpdate(timeMS: number, deltaMS: number, _game: SparkGame): void {
    // NoOp
  }

  onFinished(_data: T, _context: CommandContext, _game: SparkGame): void {
    // NoOp
  }

  isFinished(
    _data: T,
    _context: CommandContext,
    _game: SparkGame
  ): boolean | null {
    return true;
  }
}
