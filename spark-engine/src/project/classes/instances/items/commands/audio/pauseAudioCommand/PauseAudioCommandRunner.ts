import { SparkGame } from "../../../../../../../game";
import { CommandContext, CommandRunner } from "../../../command/CommandRunner";
import { PauseAudioCommandData } from "./PauseAudioCommandData";

export class PauseAudioCommandRunner extends CommandRunner<PauseAudioCommandData> {
  onExecute(
    data: PauseAudioCommandData,
    context: CommandContext,
    game: SparkGame
  ): number[] {
    const { audio, duration } = data;
    const { ids } = context;

    const audioId = ids[audio];
    if (!audioId) {
      return super.onExecute(data, context, game);
    }

    game.asset.pauseAudioFile({
      id: audioId,
      duration,
    });

    return super.onExecute(data, context, game);
  }

  isFinished(
    data: PauseAudioCommandData,
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

  getAssetIds(data: PauseAudioCommandData, context: CommandContext): string[] {
    const { audio } = data;
    const { ids } = context;
    const audioId = ids[audio];
    return [audioId];
  }
}
