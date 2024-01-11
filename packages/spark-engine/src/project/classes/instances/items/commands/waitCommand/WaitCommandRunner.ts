import { WaitCommandData } from "../../../../../../data";
import { Game } from "../../../../../../game";
import { CommandContext, CommandRunner } from "../../command/CommandRunner";

export class WaitCommandRunner<G extends Game> extends CommandRunner<
  G,
  WaitCommandData
> {
  protected _elapsedMS: number = 0;

  override onExecute(data: WaitCommandData, context: CommandContext): number[] {
    this._elapsedMS = 0;
    return super.onExecute(data, context);
  }

  override onUpdate(deltaMS: number): void {
    this._elapsedMS += deltaMS;
  }

  override isFinished(
    data: WaitCommandData,
    context: CommandContext
  ): boolean | null {
    const { seconds } = data.params;
    if (seconds === undefined || seconds === 0) {
      return super.isFinished(data, context);
    }
    const blockState =
      this.game.logic.state.blockStates[data.reference.parentId];
    const timeMS = this._elapsedMS;
    if (blockState) {
      if (seconds < 0) {
        return false;
      }
      if (timeMS / 1000 < seconds) {
        return false;
      }
    }
    return super.isFinished(data, context);
  }
}
