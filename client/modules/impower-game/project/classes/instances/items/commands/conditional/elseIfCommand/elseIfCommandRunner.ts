import {
  CommandData,
  IfCommandData,
  InstanceData,
  VariableValue,
} from "../../../../../../../data";
import { ImpowerGame } from "../../../../../../../game";
import { getNextJumpIndex } from "../../../../../../../runner/utils/getNextJumpIndex";
import { CommandRunner } from "../../../command/commandRunner";
import { IfCommandRunner } from "../ifCommand/ifCommandRunner";

export class ElseIfCommandRunner extends IfCommandRunner {
  closesGroup(_data: IfCommandData, _group?: InstanceData): boolean {
    return true;
  }

  onExecute(
    data: IfCommandData,
    variables: { [id: string]: VariableValue },
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
      blockCommands[blockState.previousIndex].data.reference.refTypeId;
    if (
      previousCommandTypeId === "IfCommand" ||
      previousCommandTypeId === "ElseIfCommand"
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
            { refTypeId: "ElseIfCommand", indexOffset: 0 },
            { refTypeId: "ElseCommand", indexOffset: 1 },
            { refTypeId: "CloseCommand", indexOffset: 1 },
          ],
          index,
          blockCommands
        );
        return [nextCommandIndex];
      }
    } else {
      // Skip to the command after the next "Close" command
      const nextCommandIndex = getNextJumpIndex(
        [{ refTypeId: "CloseCommand", indexOffset: 1 }],
        index,
        blockCommands
      );
      return [nextCommandIndex];
    }
    return super.onExecute(data, variables, game, index, blockCommands);
  }
}
