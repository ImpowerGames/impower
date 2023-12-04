import getRelativeSectionName from "../../../../../../../../sparkdown/src/utils/getRelativeSectionName";
import { JumpCommandData } from "../../../../../../data";
import { Game } from "../../../../../../game";
import { CommandContext, CommandRunner } from "../../command/CommandRunner";

export class JumpCommandRunner<G extends Game> extends CommandRunner<
  G,
  JumpCommandData
> {
  targetId?: string | null;

  override onExecute(
    game: G,
    data: JumpCommandData,
    context: CommandContext<G>
  ): number[] {
    const { value, returnWhenFinished } = data.params;
    const blockId = data.reference.parentId;

    if (!value) {
      return super.onExecute(game, data, context);
    }

    const selectedBlock = game.logic.format(value);
    const blocks = game.logic.config.blockMap;
    const id = getRelativeSectionName(blockId, blocks, selectedBlock);

    this.targetId = id;

    if (!id) {
      return super.onExecute(game, data, context);
    }

    game.logic.stopBlock(blockId);
    game.logic.enterBlock(id, returnWhenFinished, blockId);

    return super.onExecute(game, data, context);
  }

  override isFinished(
    game: G,
    data: JumpCommandData,
    context: CommandContext<G>
  ): boolean | null {
    const { returnWhenFinished } = data;
    if (this.targetId != null && returnWhenFinished) {
      const blockState = game.logic.state.blockStates[this.targetId];
      if (blockState && !blockState.hasFinished) {
        return false;
      }
      this.targetId = null;
      return super.isFinished(game, data, context);
    }
    return false;
  }
}
