import { format } from "../../../../../../../../../spark-evaluate/src";
import getRelativeSectionName from "../../../../../../../../../sparkdown/src/utils/getRelativeSectionName";
import { EnterCommandData } from "../../../../../../../data";
import { Game } from "../../../../../../../game";
import { CommandContext, CommandRunner } from "../../../command/CommandRunner";

export class EnterCommandRunner<G extends Game> extends CommandRunner<
  G,
  EnterCommandData
> {
  targetId?: string | null;

  override onExecute(
    game: G,
    data: EnterCommandData,
    context: CommandContext<G>
  ): number[] {
    const { value, returnWhenFinished } = data.params;
    const { ids, valueMap } = context;
    const blockId = data.reference.parentId;

    if (!value) {
      return super.onExecute(game, data, context);
    }

    const [selectedBlock] = format(value, valueMap);
    const blocks = game.logic.config.blockMap;
    const blockName = getRelativeSectionName(blockId, blocks, selectedBlock);
    const id = ids?.[blockName];

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
    data: EnterCommandData,
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
