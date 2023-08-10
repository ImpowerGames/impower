import { SpawnCommandData } from "../../../../../../../data";
import { SparkGame } from "../../../../../../../game";
import { CommandContext, CommandRunner } from "../../../command/CommandRunner";

export class SpawnCommandRunner<G extends SparkGame> extends CommandRunner<
  G,
  SpawnCommandData
> {
  override onExecute(
    game: G,
    data: SpawnCommandData,
    context: CommandContext<G>
  ): number[] {
    const { entity } = data.params;
    const { ids } = context;

    const entityId = ids[entity];
    if (!entityId) {
      return super.onExecute(game, data, context);
    }

    game.world.spawnEntity(entityId);

    return super.onExecute(game, data, context);
  }
}
