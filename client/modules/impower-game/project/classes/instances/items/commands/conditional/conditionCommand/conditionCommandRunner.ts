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
        const nextCommandIndex = getNextJumpIndex(
          [
            { check: (c): boolean => c === "elif", offset: 0 },
            { check: (c): boolean => c === "else", offset: 1 },
          ],
          index,
          commands
        );
        return [nextCommandIndex];
      }
    } else if (check === "elif") {
      const shouldExecute = evaluate(value, valueMap);
      if (!shouldExecute) {
        const blockState =
          game.logic.state.blockStates[data.reference.parentContainerId];
        const prevCheck = commands?.[blockState.previousIndex]?.data?.check;
        if (prevCheck === "close") {
          const nextCommandIndex = getNextJumpIndex(
            [{ check: (c): boolean => c === "close", offset: 1 }],
            index,
            commands
          );
          return [nextCommandIndex];
        }
        const nextCommandIndex = getNextJumpIndex(
          [
            { check: (c): boolean => c === "elif", offset: 0 },
            { check: (c): boolean => c === "else", offset: 1 },
          ],
          index,
          commands
        );
        return [nextCommandIndex];
      }
    } else if (check === "else") {
      const nextCommandIndex = getNextJumpIndex(
        [{ check: (c): boolean => c === "close", offset: 1 }],
        index,
        commands
      );
      return [nextCommandIndex];
    }
    return super.onExecute(data, context, game);
  }
}
