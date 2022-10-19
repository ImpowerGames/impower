import { DestroyCommandData } from "../../../../../../../data";
import { SparkGame } from "../../../../../../../game";
import { CommandContext, CommandRunner } from "../../../command/CommandRunner";

export class DestroyCommandRunner extends CommandRunner<DestroyCommandData> {
  override onExecute(
    data: DestroyCommandData,
    context: CommandContext,
    game: SparkGame
  ): number[] {
    const { entity } = data;
    const { ids } = context;

    const entityId = ids[entity];
    if (!entityId) {
      return super.onExecute(data, context, game);
    }

    game.world.destroyEntity(entityId);

    return super.onExecute(data, context, game);
  }
}
