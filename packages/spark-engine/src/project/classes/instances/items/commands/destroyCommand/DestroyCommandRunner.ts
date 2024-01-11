import { DestroyCommandData } from "../../../../../../data";
import { SparkGame } from "../../../../../../game";
import { CommandContext, CommandRunner } from "../../command/CommandRunner";

export class DestroyCommandRunner<G extends SparkGame> extends CommandRunner<
  G,
  DestroyCommandData
> {
  override onExecute(
    data: DestroyCommandData,
    context: CommandContext
  ): number[] {
    const { entity } = data.params;

    if (!entity) {
      return super.onExecute(data, context);
    }

    this.game.world.destroyEntity(entity);

    return super.onExecute(data, context);
  }
}
