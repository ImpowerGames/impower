import {
  CommandData,
  CommandTypeId,
  VariableData,
  IfCommandData,
  InstanceData,
} from "../../../../../../../data";
import { ImpowerGame } from "../../../../../../../game";
import { CommandRunner } from "../../../command/commandRunner";
import { IfCommandRunner } from "../ifCommand/ifCommandRunner";
import { getNextJumpIndex } from "../../../../../../../runner/utils/getNextJumpIndex";

export class ElseIfCommandRunner extends IfCommandRunner {
  closesGroup(_data: IfCommandData, _group?: InstanceData): boolean {
    return true;
  }

  onExecute(
    data: IfCommandData,
    variables: { [refId: string]: VariableData },
    game: ImpowerGame,
    index: number,
    blockCommands: {
      runner: CommandRunner;
      data: CommandData;
      level: number;
    }[]
  ): number[] {
    const blockState =
      game.logic.state.blockStates[data.reference.parentContainerId];
    const previousCommandTypeId =
      blockCommands[blockState.previousCommandIndex].data.reference.refTypeId;
    if (
      previousCommandTypeId === CommandTypeId.IfCommand ||
      previousCommandTypeId === CommandTypeId.ElseIfCommand
    ) {
      const executeChildren = this.areConditionsSatisfied(
        data.checkAll,
        data.conditions,
        variables,
        game
      );
      if (!executeChildren) {
        // Skip to the next "If" or "ElseIf" command or
        // skip to the command after the next "Else" or "Close" command
        const nextCommandIndex = getNextJumpIndex(
          [
            { refTypeId: CommandTypeId.ElseIfCommand, indexOffset: 0 },
            { refTypeId: CommandTypeId.ElseCommand, indexOffset: 1 },
            { refTypeId: CommandTypeId.CloseCommand, indexOffset: 1 },
          ],
          index,
          blockCommands
        );
        return [nextCommandIndex];
      }
    } else {
      // Skip to the command after the next "Close" command
      const nextCommandIndex = getNextJumpIndex(
        [{ refTypeId: CommandTypeId.CloseCommand, indexOffset: 1 }],
        index,
        blockCommands
      );
      return [nextCommandIndex];
    }
    return super.onExecute(data, variables, game, index, blockCommands);
  }
}
