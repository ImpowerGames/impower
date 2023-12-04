import { DestroyCommandData } from "../../../../../../data";
import { SparkGame } from "../../../../../../game";
import { CommandContext, CommandRunner } from "../../command/CommandRunner";

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

    if (!entity) {
      return super.onExecute(game, data, context);
    }

    game.world.destroyEntity(entity);

    return super.onExecute(game, data, context);
  }
}
