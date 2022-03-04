import { CommandData, VariableValue } from "../../../../../../../data";
import { LoadableFile } from "../../../../../../../data/interfaces/loadableFile";
import { ImpowerGame } from "../../../../../../../game";
import { getRuntimeValue } from "../../../../../../../runner/utils/getRuntimeValue";
import { CommandRunner } from "../../../command/commandRunner";
import { PlayAudioCommandData } from "./playAudioCommandData";

export class PlayAudioCommandRunner
  extends CommandRunner<PlayAudioCommandData>
  implements LoadableFile<PlayAudioCommandData>
{
  getFileId(
    data: PlayAudioCommandData,
    variables: { [id: string]: VariableValue },
    game: ImpowerGame
  ): string {
    return getRuntimeValue(data.audio, variables, game).refId;
  }

  onExecute(
    data: PlayAudioCommandData,
    variables: { [id: string]: VariableValue },
    game: ImpowerGame,
    index: number,
    blockCommands: {
      runner: CommandRunner;
      data: CommandData;
      level: number;
    }[]
  ): number[] {
    const fileReference = getRuntimeValue(data.audio, variables, game);
    if (!fileReference || !fileReference.refId) {
      return super.onExecute(data, variables, game, index, blockCommands);
    }
    const { refId } = fileReference;
    const { volume, loop, transition } = data;

    game.asset.playAudioFile({
      id: refId,
      volume: getRuntimeValue(volume, variables, game),
      loop: getRuntimeValue(loop),
      duration: getRuntimeValue(transition.duration),
    });

    return super.onExecute(data, variables, game, index, blockCommands);
  }

  isFinished(
    data: PlayAudioCommandData,
    variables: { [id: string]: VariableValue },
    game: ImpowerGame
  ): boolean {
    const duration = getRuntimeValue(data.transition.duration, variables, game);

    if (duration === undefined || duration === 0) {
      return super.isFinished(data, variables, game);
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

    return super.isFinished(data, variables, game);
  }
}
