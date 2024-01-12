import { Game } from "../../../game/core/classes/Game";
import { CommandContext, CommandRunner } from "../../command/CommandRunner";
import { SpawnCommandData } from "./SpawnCommandData";

export class SpawnCommandRunner<G extends Game> extends CommandRunner<
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
