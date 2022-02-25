import { CommandData, VariableData } from "../../../../../data";
import { ImpowerGame } from "../../../../../game";
import { ItemRunner } from "../../item/itemRunner";

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

  init(
    _data: T,
    _variables: { [refId: string]: VariableData },
    _game: ImpowerGame
  ): void {
    // NoOp
  }

  onExecute(
    _data: T,
    _variables: { [refId: string]: VariableData },
    _game: ImpowerGame,
    _index: number,
    _blockCommands: {
      runner: CommandRunner;
      data: CommandData;
      level: number;
    }[]
  ): number[] {
    return [];
  }

  isFinished(
    _data: T,
    _variables: { [refId: string]: VariableData },
    _game: ImpowerGame
  ): boolean {
    return true;
  }

  isPure(
    _data: T,
    _variables: { [refId: string]: VariableData },
    _game: ImpowerGame
  ): boolean {
    return true;
  }
}
