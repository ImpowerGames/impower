import {
  CommandData,
  DoCommandData,
  VariableData,
} from "../../../../../../../data";
import { ImpowerGame } from "../../../../../../../game";
import { getRuntimeValue } from "../../../../../../../runner/utils/getRuntimeValue";
import { CommandRunner } from "../../../command/commandRunner";

export class DoCommandRunner extends CommandRunner<DoCommandData> {
  onExecute(
    data: DoCommandData,
    variables: { [refId: string]: VariableData },
    game: ImpowerGame,
    index: number,
    blockCommands: {
      runner: CommandRunner;
      data: CommandData;
      level: number;
    }[]
  ): number[] {
    const blockReference = getRuntimeValue(data.block, variables, game);
    if (!blockReference || !blockReference.refId) {
      return super.onExecute(data, variables, game, index, blockCommands);
    }
    const { refId } = blockReference;
    const executedByBlockId = data.reference.parentContainerId;
    game.logic.executeBlock({ id: refId, executedByBlockId });
    return super.onExecute(data, variables, game, index, blockCommands);
  }

  isFinished(
    data: DoCommandData,
    variables: { [refId: string]: VariableData },
    game: ImpowerGame
  ): boolean {
    const blockReference = getRuntimeValue(data.block, variables, game);
    if (!blockReference || !blockReference.refId) {
      return true;
    }
    const blockState = game.logic.state.blockStates[blockReference.refId];
    if (!blockState.hasFinished) {
      return false;
    }
    return super.isFinished(data, variables, game);
  }
}
