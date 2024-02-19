import { WorldManager } from "../../../../game";
import { Game } from "../../../../game/core/classes/Game";
import { CommandRunner } from "../CommandRunner";
import { SpawnCommandData } from "./SpawnCommandData";

export class SpawnCommandRunner<
  G extends Game<{ world: WorldManager }>
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
