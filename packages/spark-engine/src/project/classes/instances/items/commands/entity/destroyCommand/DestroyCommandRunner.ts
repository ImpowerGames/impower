import { DestroyCommandData } from "../../../../../../../data";
import { SparkGame } from "../../../../../../../game";
import { CommandContext, CommandRunner } from "../../../command/CommandRunner";

export class DestroyCommandRunner<G extends SparkGame> extends CommandRunner<
  G,
  DestroyCommandData
> {
  override onExecute(
    game: G,
    data: DestroyCommandData,
    context: CommandContext<G>
  ): number[] {
    const { entity } = data.params;
    const { ids } = context;

    const entityId = ids[entity];
    if (!entityId) {
      return super.onExecute(game, data, context);
    }

    game.world.destroyEntity(entityId);

    return super.onExecute(game, data, context);
  }
}
