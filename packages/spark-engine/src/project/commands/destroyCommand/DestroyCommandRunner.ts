import { Game } from "../../../game/core/classes/Game";
import { CommandContext, CommandRunner } from "../../command/CommandRunner";
import { DestroyCommandData } from "./DestroyCommandData";

export class DestroyCommandRunner<G extends Game> extends CommandRunner<
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
