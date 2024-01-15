import { Game } from "../../../../game/core/classes/Game";
import { CommandRunner } from "../CommandRunner";
import { WaitCommandData } from "./WaitCommandData";

export class WaitCommandRunner<G extends Game> extends CommandRunner<
  G,
  WaitCommandData
> {
  protected _elapsedMS: number = 0;

  override onExecute(data: WaitCommandData) {
    this._elapsedMS = 0;
    return super.onExecute(data);
  }

  override onUpdate(deltaMS: number) {
    this._elapsedMS += deltaMS;
  }

  override isFinished(data: WaitCommandData) {
    const simulating = this.game.context?.game?.simulating;
    if (simulating) {
      return true;
    }
    const { seconds } = data.params;
    if (seconds === undefined || seconds === 0) {
      return super.isFinished(data);
    }
    const blockState = this.game.logic.state.blocks?.[data.parent];
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
