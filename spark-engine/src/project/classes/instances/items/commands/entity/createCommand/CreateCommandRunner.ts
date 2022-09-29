import { CreateCommandData } from "../../../../../../../data";
import { SparkGame } from "../../../../../../../game";
import { CommandContext, CommandRunner } from "../../../command/CommandRunner";

export class CreateCommandRunner extends CommandRunner<CreateCommandData> {
  onExecute(
    data: CreateCommandData,
    context: CommandContext,
    game: SparkGame
  ): number[] {
    const { entity } = data;
    const { ids } = context;

    const entityId = ids[entity];
    if (!entityId) {
      return super.onExecute(data, context, game);
    }

    game.entity.loadEntity({ id: entityId });

    return super.onExecute(data, context, game);
  }
}
