import { EvaluateCommandData } from "../../../../../../data";
import { Game } from "../../../../../../game";
import { CommandContext, CommandRunner } from "../../command/CommandRunner";

export class EvaluateCommandRunner<G extends Game> extends CommandRunner<
  G,
  EvaluateCommandData
> {
  override onExecute(
    game: G,
    data: EvaluateCommandData,
    context: CommandContext<G>
  ): number[] {
    const { expression } = data.params;

    if (!expression) {
      return super.onExecute(game, data, context);
    }

    game.logic.evaluate(expression);

    return super.onExecute(game, data, context);
  }
}
