import {
  CommandData,
  VariableValue,
  WaitCommandData,
} from "../../../../../../../data";
import { ImpowerGame } from "../../../../../../../game";
import { getRuntimeValue } from "../../../../../../../runner/utils/getRuntimeValue";
import { CommandRunner } from "../../../command/commandRunner";

export class WaitCommandRunner extends CommandRunner<WaitCommandData> {
  onExecute(
    data: WaitCommandData,
    variables: { [id: string]: VariableValue },
    game: ImpowerGame,
    index: number,
    blockCommands: {
      runner: CommandRunner;
      data: CommandData;
      level: number;
    }[]
  ): number[] {
    const seconds = getRuntimeValue(data.seconds, variables, game);
    if (!seconds) {
      return super.onExecute(data, variables, game, index, blockCommands);
    }
    return super.onExecute(data, variables, game, index, blockCommands);
  }

  isFinished(
    data: WaitCommandData,
    variables: { [id: string]: VariableValue },
    game: ImpowerGame
  ): boolean {
    const seconds = getRuntimeValue(data.seconds, variables, game);
    if (seconds === undefined || seconds === 0) {
      return super.isFinished(data, variables, game);
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
    return super.isFinished(data, variables, game);
  }
}
