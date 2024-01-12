import { SparkGame } from "../../../game/SparkGame";
import { CommandContext, CommandRunner } from "../../command/CommandRunner";
import { DestroyCommandData } from "./DestroyCommandData";

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
