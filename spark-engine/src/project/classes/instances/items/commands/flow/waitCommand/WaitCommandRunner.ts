import { WaitCommandData } from "../../../../../../../data";
import { SparkGame } from "../../../../../../../game";
import { CommandContext, CommandRunner } from "../../../command/CommandRunner";

export class WaitCommandRunner extends CommandRunner<WaitCommandData> {
  onExecute(
    data: WaitCommandData,
    context: CommandContext,
    game: SparkGame
  ): number[] {
    const { seconds } = data;
    if (!seconds) {
      return super.onExecute(data, context, game);
    }
    return super.onExecute(data, context, game);
  }

  isFinished(
    data: WaitCommandData,
    context: CommandContext,
    game: SparkGame
  ): boolean | null {
    const { seconds } = data;
    if (seconds === undefined || seconds === 0) {
      return super.isFinished(data, context, game);
    }
    const blockState =
      game.logic.state.blockStates[data.reference.parentContainerId];
    const timeSinceExecution = blockState.time - blockState.lastExecutedAt;
    if (seconds < 0) {
      return false;
    }
    if (timeSinceExecution / 1000 < seconds) {
      return false;
    }
    return super.isFinished(data, context, game);
  }
}
