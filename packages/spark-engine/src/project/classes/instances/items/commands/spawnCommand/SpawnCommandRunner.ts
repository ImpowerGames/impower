import { SpawnCommandData } from "../../../../../../data";
import { SparkGame } from "../../../../../../game";
import { CommandContext, CommandRunner } from "../../command/CommandRunner";

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

    if (!entity) {
      return super.onExecute(game, data, context);
    }

    game.world.spawnEntity(entity);

    return super.onExecute(game, data, context);
  }
}
