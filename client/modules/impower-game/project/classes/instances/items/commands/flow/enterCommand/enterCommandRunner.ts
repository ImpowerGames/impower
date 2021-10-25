import { CommandData, VariableData } from "../../../../../../../data";
import { ImpowerGame } from "../../../../../../../game";
import { CommandRunner } from "../../../command/commandRunner";

export class EnterCommandRunner extends CommandRunner<CommandData> {
  onExecute(
    data: CommandData,
    variables: { [refId: string]: VariableData },
    game: ImpowerGame,
    index: number,
    blockCommands: {
      runner: CommandRunner;
      data: CommandData;
      level: number;
    }[]
  ): number[] {
    const id = data.reference.parentContainerId;
    game.logic.enterBlock({ id });
    return super.onExecute(data, variables, game, index, blockCommands);
  }

  isFinished(
    data: CommandData,
    variables: { [refId: string]: VariableData },
    game: ImpowerGame
  ): boolean {
    const { parentContainerId } = data.reference;
    const parentNode = game.logic.blockTree[parentContainerId];
    const hasChildren = parentNode.children.length > 0;
    if (!hasChildren) {
      return super.isFinished(data, variables, game);
    }
    const parentParentContainerId = parentNode?.parent;
    const blockState = game.logic.state.blockStates[parentParentContainerId];
    if (
      !blockState ||
      !blockState.hasReturned ||
      blockState.returnedFromBlockId !== data.reference.parentContainerId
    ) {
      return false;
    }
    return super.isFinished(data, variables, game);
  }
}
