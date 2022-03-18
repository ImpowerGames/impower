import { ImpowerGame } from "../../../../../../../game";
import { CommandContext, CommandRunner } from "../../../command/commandRunner";
import { PauseAudioCommandData } from "./pauseAudioCommandData";

export class PauseAudioCommandRunner extends CommandRunner<PauseAudioCommandData> {
  onExecute(
    data: PauseAudioCommandData,
    context: CommandContext,
    game: ImpowerGame
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

  getAssetIds(data: PauseAudioCommandData, context: CommandContext): string[] {
    const { audio } = data;
    const { ids } = context;
    const audioId = ids[audio];
    return [audioId];
  }
}
