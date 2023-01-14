import { WaitCommandData } from "../../../../../../../data";
import { Game } from "../../../../../../../game";
import { CommandContext, CommandRunner } from "../../../command/CommandRunner";

export class WaitCommandRunner<G extends Game> extends CommandRunner<
  G,
  WaitCommandData
> {
  override onExecute(
    game: G,
    data: WaitCommandData,
    context: CommandContext<G>
  ): number[] {
    const { seconds } = data;
    if (!seconds) {
      return super.onExecute(game, data, context);
    }
    return super.onExecute(game, data, context);
  }

  override isFinished(
    game: G,
    data: WaitCommandData,
    context: CommandContext<G>
  ): boolean | null {
    const { seconds } = data;
    if (seconds === undefined || seconds === 0) {
      return super.isFinished(game, data, context);
    }
    const blockState =
      game.logic.state.blockStates[data.reference.parentContainerId];
    if (blockState) {
      const timeSinceExecution = blockState.time - blockState.lastExecutedAt;
      if (seconds < 0) {
        return false;
      }
      if (timeSinceExecution / 1000 < seconds) {
        return false;
      }
    }
    return super.isFinished(game, data, context);
  }
}
