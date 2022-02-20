import { CommandData, VariableData } from "../../../../../../../data";
import { LoadableFile } from "../../../../../../../data/interfaces/loadableFile";
import { ImpowerGame } from "../../../../../../../game";
import { getRuntimeValue } from "../../../../../../../runner/utils/getRuntimeValue";
import { CommandRunner } from "../../../command/commandRunner";
import { ShowImageCommandData } from "./showImageCommandData";

export class ShowImageCommandRunner
  extends CommandRunner<ShowImageCommandData>
  implements LoadableFile<ShowImageCommandData>
{
  getFileId(
    data: ShowImageCommandData,
    variables: { [refId: string]: VariableData },
    game: ImpowerGame
  ): string {
    return getRuntimeValue(data.image, variables, game).refId;
  }

  onExecute(
    data: ShowImageCommandData,
    variables: { [refId: string]: VariableData },
    game: ImpowerGame,
    index: number,
    blockCommands: {
      runner: CommandRunner;
      data: CommandData;
      level: number;
    }[]
  ): number[] {
    const fileReference = getRuntimeValue(data.image, variables, game);
    if (!fileReference || !fileReference.refId) {
      return super.onExecute(data, variables, game, index, blockCommands);
    }
    const { refId } = fileReference;
    const { position, size, transition } = data;

    game.asset.showImageFile({
      id: refId,
      x: getRuntimeValue(position.x, variables, game),
      y: getRuntimeValue(position.y, variables, game),
      width: getRuntimeValue(size.value.x, variables, game),
      height: getRuntimeValue(size.value.y, variables, game),
      duration: getRuntimeValue(transition.duration, variables, game),
    });

    return super.onExecute(data, variables, game, index, blockCommands);
  }

  isFinished(
    data: ShowImageCommandData,
    variables: { [refId: string]: VariableData },
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
