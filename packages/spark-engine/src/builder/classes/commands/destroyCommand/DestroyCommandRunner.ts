import { Game } from "../../../../game/core/classes/Game";
import { CommandRunner } from "../CommandRunner";
import { DestroyCommandData } from "./DestroyCommandData";

export class DestroyCommandRunner<G extends Game> extends CommandRunner<
  G,
  DestroyCommandData
> {
  override onExecute(data: DestroyCommandData): number[] {
    const { entity } = data.params;

    if (!entity) {
      return super.onExecute(data);
    }

    this.game.world.destroyEntity(entity);

    return super.onExecute(data);
  }
}
