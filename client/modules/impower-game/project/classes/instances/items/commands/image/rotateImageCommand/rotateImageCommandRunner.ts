import { ImpowerGame } from "../../../../../../../game";
import { CommandContext, CommandRunner } from "../../../command/commandRunner";
import { RotateToImageCommandData } from "./rotateImageCommandData";

export class RotateToImageCommandRunner extends CommandRunner<RotateToImageCommandData> {
  onExecute(
    data: RotateToImageCommandData,
    context: CommandContext,
    game: ImpowerGame
  ): number[] {
    const { image, angle, duration, additive, ease } = data;
    const { ids } = context;

    const imageId = ids[image];
    if (!imageId) {
      return super.onExecute(data, context, game);
    }

    game.asset.rotateImageFile({
      id: imageId,
      angle,
      additive,
      duration,
      ease,
    });

    return super.onExecute(data, context, game);
  }

  isFinished(
    data: RotateToImageCommandData,
    context: CommandContext,
    game: ImpowerGame
  ): boolean {
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
