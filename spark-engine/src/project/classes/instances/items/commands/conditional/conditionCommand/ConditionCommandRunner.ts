import { evaluate } from "../../../../../../../../../spark-evaluate";
import { ConditionCommandData, InstanceData } from "../../../../../../../data";
import { SparkGame } from "../../../../../../../game";
import { getNextJumpIndex } from "../../../../../../../runner";
import { CommandContext, CommandRunner } from "../../../command/CommandRunner";

export class ConditionCommandRunner extends CommandRunner<ConditionCommandData> {
  closesGroup(data: ConditionCommandData, group?: InstanceData): boolean {
    return super.closesGroup(data, group);
  }

  opensGroup(): boolean {
    return true;
  }

  onExecute(
    data: ConditionCommandData,
    context: CommandContext,
    game: SparkGame
  ): number[] {
    const { check, value } = data;
    const { valueMap, index, commands } = context;

    if (check === "if") {
      const shouldExecute = evaluate(value, valueMap);
      if (!shouldExecute) {
        const nextCommandIndex = getNextJumpIndex(index, commands, [
          { check: (c): boolean => c === "elif", offset: 0 },
          { check: (c): boolean => c === "else", offset: 1 },
        ]);
        return [nextCommandIndex];
      }
    } else if (check === "elif") {
      const shouldExecute = evaluate(value, valueMap);
      if (!shouldExecute) {
        const blockState =
          game.logic.state.blockStates[data.reference.parentContainerId];
        const prevCheck = commands?.[blockState.previousIndex]?.data?.check;
        if (prevCheck === "close") {
          const nextCommandIndex = getNextJumpIndex(index, commands, [
            { check: (c): boolean => c === "else", offset: 0 },
          ]);
          return [nextCommandIndex];
        }
        const nextCommandIndex = getNextJumpIndex(index, commands, [
          { check: (c): boolean => c === "elif", offset: 0 },
          { check: (c): boolean => c === "else", offset: 1 },
        ]);
        return [nextCommandIndex];
      }
    } else if (check === "else") {
      // Fell through to else from prev scope, so skip over else scope
      const nextCommandIndex = getNextJumpIndex(index, commands);
      return [nextCommandIndex];
    }
    return super.onExecute(data, context, game);
  }
}
