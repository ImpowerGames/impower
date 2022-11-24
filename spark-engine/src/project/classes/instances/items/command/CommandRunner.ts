import { CommandData } from "../../../../../data";
import { SparkGame } from "../../../../../game";
import { ItemRunner } from "../../item/ItemRunner";

export interface CommandContext {
  ids: Record<string, string>;
  valueMap: Record<string, unknown>;
  objectMap: { [type: string]: Record<string, unknown> };
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

  onExecute(_game: SparkGame, _data: T, _context: CommandContext): number[] {
    return [];
  }

  onUpdate(_game: SparkGame, _timeMS: number, _deltaMS: number): void {
    // NoOp
  }

  onFinished(_game: SparkGame, _data: T, _context: CommandContext): void {
    // NoOp
  }

  isFinished(
    _game: SparkGame,
    _data: T,
    _context: CommandContext
  ): boolean | null {
    return true;
  }
}
