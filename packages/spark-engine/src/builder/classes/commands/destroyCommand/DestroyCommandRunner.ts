import { WorldManager } from "../../../../game";
import { Game } from "../../../../game/core/classes/Game";
import { CommandRunner } from "../CommandRunner";
import { DestroyCommandData } from "./DestroyCommandData";

export class DestroyCommandRunner<
  G extends Game<{ world: WorldManager }>
> extends CommandRunner<G, DestroyCommandData> {
  override onExecute(data: DestroyCommandData) {
    const { entity } = data.params;

    if (!entity) {
      return super.onExecute(data);
    }

    this.game.module.world.destroyEntity(entity);

    return super.onExecute(data);
  }
}
