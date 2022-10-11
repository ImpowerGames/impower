import { SpawnCommandData } from "../../../../../../../data";
import { SparkGame } from "../../../../../../../game";
import { CommandContext, CommandRunner } from "../../../command/CommandRunner";

export class SpawnCommandRunner extends CommandRunner<SpawnCommandData> {
  onExecute(
    data: SpawnCommandData,
    context: CommandContext,
    game: SparkGame
  ): number[] {
    const { entity } = data;
    const { ids } = context;

    const entityId = ids[entity];
    if (!entityId) {
      return super.onExecute(data, context, game);
    }

    game.entity.spawnEntity({ id: entityId });

    return super.onExecute(data, context, game);
  }
}
