import { Game } from "../../game/core/classes/Game";
import { CommandData } from "./CommandData";

export interface CommandContext {
  index: number;
  commands: CommandData[];
}

export class CommandRunner<
  G extends Game,
  T extends CommandData = CommandData
> {
  private _game: G;
  get game() {
    return this._game;
  }

  constructor(game: G) {
    this._game = game;
  }

  init(): void {
    // NoOp
  }

  onExecute(_data: T, _context: CommandContext): number[] {
    return [];
  }

  onUpdate(_deltaMS: number): void {
    // NoOp
  }

  onFinished(_data: T, _context: CommandContext): void {
    // NoOp
  }

  isFinished(_data: T, _context: CommandContext): boolean | null {
    return true;
  }

  onDestroy(): void {
    // NoOp
  }

  onPreview(
    _data: T,
    _context: Omit<CommandContext, "index" | "commands">
  ): boolean {
    // NoOp
    return false;
  }
}
