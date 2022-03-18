import { ImpowerGame } from "../../../../../../../game";
import { CommandContext, CommandRunner } from "../../../command/commandRunner";
import { ShowImageCommandData } from "./showImageCommandData";

export class ShowImageCommandRunner extends CommandRunner<ShowImageCommandData> {
  onExecute(
    data: ShowImageCommandData,
    context: CommandContext,
    game: ImpowerGame
  ): number[] {
    const { image, x, y, duration, ease } = data;
    const { ids } = context;

    const imageId = ids[image];
    if (!imageId) {
      return super.onExecute(data, context, game);
    }

    game.asset.showImageFile({
      id: imageId,
      x,
      y,
      duration,
      ease,
    });

    return super.onExecute(data, context, game);
  }

  isFinished(
    data: ShowImageCommandData,
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
