import { Game } from "../../../game/core/classes/Game";
import { CommandData } from "../../../game/modules/logic/types/CommandData";
import { ICommandRunner } from "../../../game/modules/logic/types/ICommandRunner";

export class CommandRunner<G extends Game, D extends CommandData = CommandData>
  implements ICommandRunner<D>
{
  private _game: G;
  get game() {
    return this._game;
  }

  constructor(game: G) {
    this._game = game;
  }

  onInit(): void {
    // NoOp
  }

  isChoicepoint(_data: D): boolean {
    return false;
  }

  isSavepoint(_data: D): boolean {
    return false;
  }

  onExecute(_data: D): number[] {
    return [];
  }

  onUpdate(_deltaMS: number): void {
    // NoOp
  }

  onFinished(_data: D): void {
    // NoOp
  }

  isFinished(_data: D): boolean | string {
    return true;
  }

  onDestroy(): void {
    // NoOp
  }

  onPreview(_data: D): boolean {
    // NoOp
    return false;
  }
}
