import { evaluate } from "../../../../../../../../impower-evaluate";
import { ConditionCommandData, InstanceData } from "../../../../../../../data";
import { ImpowerGame } from "../../../../../../../game";
import { getNextJumpIndex } from "../../../../../../../runner";
import { CommandContext, CommandRunner } from "../../../command/commandRunner";

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
    game: ImpowerGame
  ): number[] {
    const { check, value } = data;
    const { valueMap, index, commands } = context;
    if (check === "if") {
      const shouldExecute = evaluate(value, valueMap);
      if (!shouldExecute) {
        // Skip to the next "elif" condition or
        // skip to the command after the next "else" or "close" condition
        const nextCommandIndex = getNextJumpIndex(
          [
            { check: (c): boolean => c === "elif", offset: 0 },
            { check: (c): boolean => c === "else", offset: 1 },
            { check: (c): boolean => c === "close", offset: 1 },
          ],
          index,
          commands
        );
        return [nextCommandIndex];
      }
    } else if (check === "elif") {
      const shouldExecute = evaluate(value, valueMap);
      const blockState =
        game.logic.state.blockStates[data.reference.parentContainerId];
      const prevCheck = commands?.[blockState.previousIndex]?.data?.check;
      if (prevCheck === "if" || prevCheck === "elif") {
        if (!shouldExecute) {
          // Skip to the next "elif" condition or
          // skip to the condition after the next "else" or "close" condition
          const nextCommandIndex = getNextJumpIndex(
            [
              { check: (c): boolean => c === "elif", offset: 0 },
              { check: (c): boolean => c === "else", offset: 1 },
              { check: (c): boolean => c === "close", offset: 1 },
            ],
            index,
            commands
          );
          return [nextCommandIndex];
        }
      } else {
        // Skip to the command after the next "close" condition
        const nextCommandIndex = getNextJumpIndex(
          [{ check: (c): boolean => c === "close", offset: 1 }],
          index,
          commands
        );
        return [nextCommandIndex];
      }
    } else if (check === "else") {
      // Skip to the command after the next "close" condition
      const nextCommandIndex = getNextJumpIndex(
        [{ check: (c): boolean => c === "close", offset: 1 }],
        index,
        commands
      );
      return [nextCommandIndex];
    } else if (check === "close") {
      // Skip to the next command on the same or higher level that is not an else or elif
      const nextCommandIndex = getNextJumpIndex(
        [
          { check: (c): boolean => c === "close", offset: 1 },
          { check: (c): boolean => c !== "elif" && c !== "else", offset: 0 },
        ],
        index,
        commands
      );
      return [nextCommandIndex];
    }
    return super.onExecute(data, context, game);
  }
}
