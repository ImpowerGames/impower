import { CommandData } from "../../../../../../../data";
import { Game } from "../../../../../../../game";
import { CommandContext, CommandRunner } from "../../../command/CommandRunner";

export class RepeatCommandRunner<G extends Game> extends CommandRunner<
  G,
  CommandData
> {
  override onExecute(
    game: G,
    data: CommandData,
    context: CommandContext<G>
  ): number[] {
    const id = data.reference.parentId;

    game.logic.executeBlock(id, id);

    return super.onExecute(game, data, context);
  }
}
