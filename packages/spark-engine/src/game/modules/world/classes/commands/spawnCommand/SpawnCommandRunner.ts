import { CommandRunner } from "../../../../../core/classes/CommandRunner";
import type { Game } from "../../../../../core/classes/Game";
import type { WorldModule } from "../../WorldModule";
import { SpawnCommandData } from "./SpawnCommandData";

export class SpawnCommandRunner<
  G extends Game<{ world: WorldModule }>
> extends CommandRunner<G, SpawnCommandData> {
  override onExecute(data: SpawnCommandData) {
    const { entity } = data.params;

    if (!entity) {
      return super.onExecute(data);
    }

    this.game.module.world.spawnEntity(entity);

    return super.onExecute(data);
  }
}
