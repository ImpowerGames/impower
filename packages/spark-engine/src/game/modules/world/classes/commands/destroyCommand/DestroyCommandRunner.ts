import type { Game } from "../../../../../core/classes/Game";
import { CommandRunner } from "../../../../logic/classes/commands/CommandRunner";
import type { WorldModule } from "../../WorldModule";
import { DestroyCommandData } from "./DestroyCommandData";

export class DestroyCommandRunner<
  G extends Game<{ world: WorldModule }>
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
