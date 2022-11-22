import { DestroyCommandData } from "../../../../../../../data";
import { SparkGame } from "../../../../../../../game";
import { CommandContext, CommandRunner } from "../../../command/CommandRunner";

export class DestroyCommandRunner extends CommandRunner<DestroyCommandData> {
  override onExecute(
    game: SparkGame,
    data: DestroyCommandData,
    context: CommandContext
  ): number[] {
    const { entity } = data;
    const { ids } = context;

    const entityId = ids[entity];
    if (!entityId) {
      return super.onExecute(game, data, context);
    }

    game.world.destroyEntity(entityId);

    return super.onExecute(game, data, context);
  }
}
