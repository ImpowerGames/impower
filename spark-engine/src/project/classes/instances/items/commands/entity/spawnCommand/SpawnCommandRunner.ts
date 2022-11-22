import { SpawnCommandData } from "../../../../../../../data";
import { SparkGame } from "../../../../../../../game";
import { CommandContext, CommandRunner } from "../../../command/CommandRunner";

export class SpawnCommandRunner extends CommandRunner<SpawnCommandData> {
  override onExecute(
    game: SparkGame,
    data: SpawnCommandData,
    context: CommandContext
  ): number[] {
    const { entity } = data;
    const { ids } = context;

    const entityId = ids[entity];
    if (!entityId) {
      return super.onExecute(game, data, context);
    }

    game.world.spawnEntity(entityId);

    return super.onExecute(game, data, context);
  }
}
