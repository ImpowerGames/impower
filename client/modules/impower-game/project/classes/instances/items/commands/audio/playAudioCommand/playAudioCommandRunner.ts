import { ImpowerGame } from "../../../../../../../game";
import { CommandContext, CommandRunner } from "../../../command/commandRunner";
import { PlayAudioCommandData } from "./playAudioCommandData";

export class PlayAudioCommandRunner extends CommandRunner<PlayAudioCommandData> {
  onExecute(
    data: PlayAudioCommandData,
    context: CommandContext,
    game: ImpowerGame
  ): number[] {
    const { audio, volume, loop, duration } = data;
    const { ids } = context;

    const audioId = ids[audio];
    if (!audioId) {
      return super.onExecute(data, context, game);
    }

    game.asset.playAudioFile({
      id: audioId,
      volume,
      loop,
      duration,
    });

    return super.onExecute(data, context, game);
  }

  isFinished(
    data: PlayAudioCommandData,
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
