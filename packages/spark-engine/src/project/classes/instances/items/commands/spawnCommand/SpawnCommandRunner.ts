import { SpawnCommandData } from "../../../../../../data";
import { SparkGame } from "../../../../../../game";
import { CommandContext, CommandRunner } from "../../command/CommandRunner";

export class SpawnCommandRunner<G extends SparkGame> extends CommandRunner<
  G,
  SpawnCommandData
> {
  override onExecute(
    data: SpawnCommandData,
    context: CommandContext
  ): number[] {
    const { entity } = data.params;

    if (!entity) {
      return super.onExecute(data, context);
    }

    this.game.world.spawnEntity(entity);

    return super.onExecute(data, context);
  }
}
