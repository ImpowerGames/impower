import { TriggerData, VariableData } from "../../../../../data";
import { ImpowerGame } from "../../../../../game";
import { ItemRunner } from "../../item/itemRunner";

export class TriggerRunner<
  T extends TriggerData = TriggerData
> extends ItemRunner<T> {
  private static _instance: TriggerRunner;

  public static get instance(): TriggerRunner {
    if (!this._instance) {
      this._instance = new TriggerRunner();
    }
    return this._instance;
  }

  init(
    _data: T,
    _variables: { [refId: string]: VariableData },
    _game: ImpowerGame
  ): void {
    // Must be overwritten
  }

  shouldCheckAllChildren(_data: T): boolean {
    return false;
  }

  shouldExecute(
    _data: T,
    _variables: { [refId: string]: VariableData },
    _game: ImpowerGame
  ): boolean {
    return false;
  }

  canExecute(
    data: T,
    _variables: { [refId: string]: VariableData },
    game: ImpowerGame
  ): boolean {
    const blockState =
      game.logic.state.blockStates[data.reference.parentContainerId];
    return data.repeatable || !blockState.hasFinished;
  }
}
