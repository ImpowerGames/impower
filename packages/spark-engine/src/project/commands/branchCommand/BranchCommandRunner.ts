import { Game } from "../../../game/core/classes/Game";
import { CommandRunner } from "../../command/CommandRunner";
import { BranchCommandData } from "./BranchCommandData";
import { getNextJumpIndex } from "./utils/getNextJumpIndex";

export class BranchCommandRunner<G extends Game> extends CommandRunner<
  G,
  BranchCommandData
> {
  override onExecute(data: BranchCommandData): number[] {
    const { check, condition } = data.params;
    const index = data.index;
    const blockId = data.reference.parentId;

    const commands = this.game.logic.config.blockMap[blockId]?.commands;

    if (!commands) {
      return super.onExecute(data);
    }

    if (check === "if") {
      const shouldExecute = this.game.logic.evaluate(condition);
      if (!shouldExecute) {
        const nextCommandIndex = getNextJumpIndex(index, commands, [
          { check: (c): boolean => c === "elseif", offset: 0 },
          { check: (c): boolean => c === "else", offset: 1 },
        ]);
        return [nextCommandIndex];
      }
    } else if (check === "elseif") {
      const shouldExecute = this.game.logic.evaluate(condition);
      if (!shouldExecute) {
        const blockState =
          this.game.logic.state.blockStates[data.reference.parentId];
        if (blockState) {
          const prevCheck =
            commands?.[blockState.previousIndex]?.params?.["check"];
          if (prevCheck === "end") {
            const nextCommandIndex = getNextJumpIndex(index, commands, [
              { check: (c): boolean => c === "else", offset: 0 },
            ]);
            return [nextCommandIndex];
          }
        }
        const nextCommandIndex = getNextJumpIndex(index, commands, [
          { check: (c): boolean => c === "elseif", offset: 0 },
          { check: (c): boolean => c === "else", offset: 1 },
        ]);
        return [nextCommandIndex];
      }
    } else if (check === "else") {
      // Fell through to else from prev scope, so skip over else scope
      const nextCommandIndex = getNextJumpIndex(index, commands);
      return [nextCommandIndex];
    }
    return super.onExecute(data);
  }
}
