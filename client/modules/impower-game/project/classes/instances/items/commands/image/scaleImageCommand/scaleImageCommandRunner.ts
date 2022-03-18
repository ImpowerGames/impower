import { ImpowerGame } from "../../../../../../../game";
import { CommandContext, CommandRunner } from "../../../command/commandRunner";
import { ScaleToImageCommandData } from "./scaleImageCommandData";

export class ScaleToImageCommandRunner extends CommandRunner<ScaleToImageCommandData> {
  onExecute(
    data: ScaleToImageCommandData,
    context: CommandContext,
    game: ImpowerGame
  ): number[] {
    const { image, x, y, duration, additive, ease } = data;
    const { ids } = context;

    const imageId = ids[image];
    if (!imageId) {
      return super.onExecute(data, context, game);
    }

    game.asset.scaleImageFile({
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
    data: ScaleToImageCommandData,
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
