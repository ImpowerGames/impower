import { Game } from "../../../../game/core/classes/Game";
import { CommandRunner } from "../CommandRunner";
import { WaitCommandData } from "./WaitCommandData";

export class WaitCommandRunner<G extends Game> extends CommandRunner<
  G,
  WaitCommandData
> {
  protected _elapsedMS: number = 0;

  override onExecute(data: WaitCommandData): number[] {
    this._elapsedMS = 0;
    return super.onExecute(data);
  }

  override onUpdate(deltaMS: number): void {
    this._elapsedMS += deltaMS;
  }

  override isFinished(data: WaitCommandData): boolean | null {
    const { seconds } = data.params;
    if (seconds === undefined || seconds === 0) {
      return super.isFinished(data);
    }
    const blockState = this.game.logic.state.blocks[data.parent];
    const timeMS = this._elapsedMS;
    if (blockState) {
      if (seconds < 0) {
        return false;
      }
      if (timeMS / 1000 < seconds) {
        return false;
      }
    }
    return super.isFinished(data);
  }
}
