import { List } from "../../../../../../../../impower-core";
import {
  CommandTypeId,
  Condition,
  CompareOperator,
  VariableData,
  InstanceData,
  IfCommandData,
  CommandData,
} from "../../../../../../../data";
import { ImpowerGame } from "../../../../../../../game";
import { CommandRunner } from "../../../command/commandRunner";
import { getNextJumpIndex } from "../../../../../../../runner/utils/getNextJumpIndex";
import { getRuntimeValue } from "../../../../../../../runner/utils/getRuntimeValue";

export class IfCommandRunner extends CommandRunner<IfCommandData> {
  closesGroup(data: IfCommandData, group?: InstanceData): boolean {
    if (group && group.reference.refTypeId === CommandTypeId.SelectCommand) {
      // Don't allow nesting If commands inside Select commands
      return true;
    }
    return super.closesGroup(data, group);
  }

  opensGroup(): boolean {
    return true;
  }

  isConditionSatisfied(
    condition: Condition,
    variables: { [refId: string]: VariableData },
    game: ImpowerGame
  ): boolean {
    const lhs = getRuntimeValue(condition.variable, variables, game);
    if (lhs === undefined) {
      return false;
    }
    const rhs = getRuntimeValue(condition.value, variables, game);
    const { operator } = condition;
    switch (operator) {
      case CompareOperator.Equals:
        return JSON.stringify(lhs) === JSON.stringify(rhs);
      case CompareOperator.NotEquals:
        return JSON.stringify(lhs) !== JSON.stringify(rhs);
      case CompareOperator.GreaterThan:
        return typeof lhs === "number" && typeof rhs === "number" && lhs > rhs;
      case CompareOperator.LessThan:
        return typeof lhs === "number" && typeof rhs === "number" && lhs < rhs;
      case CompareOperator.GreaterThanOrEquals:
        return typeof lhs === "number" && typeof rhs === "number" && lhs >= rhs;
      case CompareOperator.LessThanOrEquals:
        return typeof lhs === "number" && typeof rhs === "number" && lhs <= rhs;
      default:
        return false;
    }
  }

  areConditionsSatisfied(
    checkAll: boolean,
    conditions: List<Condition>,
    variables: { [refId: string]: VariableData },
    game: ImpowerGame
  ): boolean {
    return checkAll
      ? conditions.order.every((x) =>
          this.isConditionSatisfied(conditions.data[x], variables, game)
        )
      : conditions.order.some((x) =>
          this.isConditionSatisfied(conditions.data[x], variables, game)
        );
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
          { refTypeId: CommandTypeId.ElseIfCommand, indexOffset: 0 },
          { refTypeId: CommandTypeId.ElseCommand, indexOffset: 1 },
          { refTypeId: CommandTypeId.CloseCommand, indexOffset: 1 },
        ],
        index,
        blockCommands
      );
      return [nextCommandIndex];
    }
    return super.onExecute(data, variables, game, index, blockCommands);
  }
}
