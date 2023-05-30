import { evaluate } from "../../../../../../../../../spark-evaluate";
import { ConditionCommandData, InstanceData } from "../../../../../../../data";
import { Game } from "../../../../../../../game";
import { getNextJumpIndex } from "../../../../../../../runner";
import { CommandContext, CommandRunner } from "../../../command/CommandRunner";

export class ConditionCommandRunner<G extends Game> extends CommandRunner<
  G,
  ConditionCommandData
> {
  override closesGroup(
    data: ConditionCommandData,
    group?: InstanceData
  ): boolean {
    return super.closesGroup(data, group);
  }

  override opensGroup(): boolean {
    return true;
  }

  override onExecute(
    game: G,
    data: ConditionCommandData,
    context: CommandContext<G>
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
        if (blockState) {
          const prevCheck =
            commands?.[blockState.previousIndex]?.data?.["check"];
          if (prevCheck === "close") {
            const nextCommandIndex = getNextJumpIndex(index, commands, [
              { check: (c): boolean => c === "else", offset: 0 },
            ]);
            return [nextCommandIndex];
          }
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
    return super.onExecute(game, data, context);
  }
}