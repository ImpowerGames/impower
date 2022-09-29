import { SparkGame } from "../../../../../../../game";
import { CommandContext, CommandRunner } from "../../../command/CommandRunner";
import { MoveToImageCommandData } from "./MoveToImageCommandData";

export class MoveToImageCommandRunner extends CommandRunner<MoveToImageCommandData> {
  onExecute(
    data: MoveToImageCommandData,
    context: CommandContext,
    game: SparkGame
  ): number[] {
    const { image, x, y, duration, additive, ease } = data;
    const { ids } = context;

    const imageId = ids[image];
    if (!imageId) {
      return super.onExecute(data, context, game);
    }

    game.asset.moveImageFile({
      id: imageId,
      x,
      y,
      additive,
      duration,
      ease,
    });

    return super.onExecute(data, context, game);
  }

  isFinished(
    data: MoveToImageCommandData,
    context: CommandContext,
    game: SparkGame
  ): boolean | null {
    const { duration } = data;
    if (duration === undefined || duration === 0) {
      return super.isFinished(data, context, game);
    }
    const blockState =
      game.logic.state.blockStates[data.reference.parentContainerId];
    const timeSinceExecution = blockState.time - blockState.lastExecutedAt;
    if (duration < 0) {
      return false;
    }
    if (timeSinceExecution < duration * 1000) {
      return false;
    }

    return super.isFinished(data, context, game);
  }
}
