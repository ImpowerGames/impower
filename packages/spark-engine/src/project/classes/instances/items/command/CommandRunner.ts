import { CommandData } from "../../../../../data";
import { Game } from "../../../../../game";
import { ItemRunner } from "../../item/ItemRunner";

export interface CommandContext<G extends Game = Game> {
  index: number;
  commands: {
    runner: CommandRunner<G>;
    data: CommandData;
  }[];
  instant?: boolean;
  debug?: boolean;
  preview?: boolean;
}

export class CommandRunner<
  G extends Game,
  T extends CommandData = CommandData
> extends ItemRunner<T> {
  init(_game: G): void {
    // NoOp
  }

  onExecute(_game: G, _data: T, _context: CommandContext<G>): number[] {
    return [];
  }

  onUpdate(_game: G, _deltaMS: number): void {
    // NoOp
  }

  onFinished(_game: G, _data: T, _context: CommandContext<G>): void {
    // NoOp
  }

  isFinished(_game: G, _data: T, _context: CommandContext<G>): boolean | null {
    return true;
  }

  onDestroy(_game: G): void {
    // NoOp
  }

  onPreview(
    _game: G,
    _data: T,
    _context: Omit<CommandContext<G>, "index" | "commands">
  ): boolean {
    // NoOp
    return false;
  }
}
