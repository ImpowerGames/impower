import { WaitCommandData } from "../../../../../../../data";
import { SparkGame } from "../../../../../../../game";
import { CommandContext, CommandRunner } from "../../../command/CommandRunner";

export class WaitCommandRunner extends CommandRunner<WaitCommandData> {
  override onExecute(
    game: SparkGame,
    data: WaitCommandData,
    context: CommandContext
  ): number[] {
    const { seconds } = data;
    if (!seconds) {
      return super.onExecute(game, data, context);
    }
    return super.onExecute(game, data, context);
  }

  override isFinished(
    game: SparkGame,
    data: WaitCommandData,
    context: CommandContext
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
