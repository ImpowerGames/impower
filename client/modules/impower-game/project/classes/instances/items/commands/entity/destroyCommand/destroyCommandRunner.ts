import { DestroyCommandData } from "../../../../../../../data";
import { ImpowerGame } from "../../../../../../../game";
import { CommandContext, CommandRunner } from "../../../command/commandRunner";

export class DestroyCommandRunner extends CommandRunner<DestroyCommandData> {
  onExecute(
    data: DestroyCommandData,
    context: CommandContext,
    game: ImpowerGame
  ): number[] {
    const { entity } = data;
    const { ids } = context;

    const entityId = ids[entity];
    if (!entityId) {
      return super.onExecute(data, context, game);
    }

    game.entity.unloadConstruct({ id: entityId });

    return super.onExecute(data, context, game);
  }
}
