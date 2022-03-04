import { List } from "../../../../../../../../impower-core";
import {
  CommandData,
  Condition,
  IfCommandData,
  InstanceData,
  VariableValue,
} from "../../../../../../../data";
import { ImpowerGame } from "../../../../../../../game";
import { getNextJumpIndex } from "../../../../../../../runner/utils/getNextJumpIndex";
import { isConditionSatisfied } from "../../../../../../../runner/utils/isConditionSatisfied";
import { CommandRunner } from "../../../command/commandRunner";

export class IfCommandRunner extends CommandRunner<IfCommandData> {
  closesGroup(data: IfCommandData, group?: InstanceData): boolean {
    if (group && group.reference.refTypeId === "SelectCommand") {
      // Don't allow nesting If commands inside Select commands
      return true;
    }
    return super.closesGroup(data, group);
  }

  opensGroup(): boolean {
    return true;
  }

  areConditionsSatisfied(
    checkAll: boolean,
    conditions: List<Condition>,
    variables: { [id: string]: VariableValue },
    game: ImpowerGame
  ): boolean {
    return checkAll
      ? conditions.order.every((x) =>
          isConditionSatisfied(conditions.data[x], variables, game)
        )
      : conditions.order.some((x) =>
          isConditionSatisfied(conditions.data[x], variables, game)
        );
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
    const executeChildren = this.areConditionsSatisfied(
      data.checkAll,
      data.conditions,
      variables,
      game
    );
    if (!executeChildren) {
      // Skip to the next "ElseIf" command or
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
    return super.onExecute(data, variables, game, index, blockCommands);
  }
}
