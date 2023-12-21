import { WaitCommandData } from "../../../../../../data";
import { Game } from "../../../../../../game";
import { CommandContext, CommandRunner } from "../../command/CommandRunner";

export class WaitCommandRunner<G extends Game> extends CommandRunner<
  G,
  WaitCommandData
> {
  elapsedMS: number = 0;

  override onExecute(
    game: G,
    data: WaitCommandData,
    context: CommandContext<G>
  ): number[] {
    this.elapsedMS = 0;
    return super.onExecute(game, data, context);
  }

  override onUpdate(_game: G, deltaMS: number): void {
    this.elapsedMS += deltaMS;
  }

  override isFinished(
    game: G,
    data: WaitCommandData,
    context: CommandContext<G>
  ): boolean | null {
    const { seconds } = data.params;
    if (seconds === undefined || seconds === 0) {
      return super.isFinished(game, data, context);
    }
    const blockState = game.logic.state.blockStates[data.reference.parentId];
    const timeMS = this.elapsedMS;
    if (blockState) {
      if (seconds < 0) {
        return false;
      }
      if (timeMS / 1000 < seconds) {
        return false;
      }
    }
    return super.isFinished(game, data, context);
  }
}
