import { CreateCommandData } from "../../../../../../../data";
import { ImpowerGame } from "../../../../../../../game";
import { CommandContext, CommandRunner } from "../../../command/commandRunner";

export class CreateCommandRunner extends CommandRunner<CreateCommandData> {
  onExecute(
    data: CreateCommandData,
    context: CommandContext,
    game: ImpowerGame
  ): number[] {
    const { entity } = data;
    const { ids } = context;

    const entityId = ids[entity];
    if (!entityId) {
      return super.onExecute(data, context, game);
    }

    game.entity.loadConstruct({ id: entityId });

    return super.onExecute(data, context, game);
  }
}
