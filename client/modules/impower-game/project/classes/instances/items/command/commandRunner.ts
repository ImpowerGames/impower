import { CommandData } from "../../../../../data";
import { ImpowerGame } from "../../../../../game";
import { ItemRunner } from "../../item/itemRunner";

export interface CommandContext {
  ids: Record<string, string>;
  valueMap: Record<string, unknown>;
  variables: Record<string, unknown>;
  assets: Record<string, string>;
  entities: Record<string, string>;
  tags: Record<string, string>;
  blocks: Record<string, number>;
  triggers: string[];
  parameters: string[];
  index: number;
  commands: {
    runner: CommandRunner;
    data: CommandData;
  }[];
}

export class CommandRunner<
  T extends CommandData = CommandData
> extends ItemRunner<T> {
  private static _instance: CommandRunner;

  public static get instance(): CommandRunner {
    if (!this._instance) {
      this._instance = new CommandRunner();
    }
    return this._instance;
  }

  init(_data: T, _context: CommandContext, _game: ImpowerGame): void {
    // NoOp
  }

  onExecute(_data: T, _context: CommandContext, _game: ImpowerGame): number[] {
    return [];
  }

  isFinished(_data: T, _context: CommandContext, _game: ImpowerGame): boolean {
    return true;
  }

  isPure(_data: T, _context: CommandContext, _game: ImpowerGame): boolean {
    return true;
  }

  getAssetIds(
    _data: T,
    _context: CommandContext,
    _game: ImpowerGame
  ): string[] {
    return [];
  }
}
