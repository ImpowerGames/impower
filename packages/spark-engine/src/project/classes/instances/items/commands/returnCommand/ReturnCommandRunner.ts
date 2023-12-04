import { ReturnCommandData } from "../../../../../../data";
import { Game } from "../../../../../../game";
import { CommandContext, CommandRunner } from "../../command/CommandRunner";

export class ReturnCommandRunner<G extends Game> extends CommandRunner<
  G,
  ReturnCommandData
> {
  override onExecute(
    game: G,
    data: ReturnCommandData,
    context: CommandContext<G>
  ): number[] {
    const { value } = data.params;

    const returnValue = game.logic.evaluate(value);

    const id = data.reference.parentId;
    game.logic.returnFromBlock(id, returnValue);

    return super.onExecute(game, data, context);
  }
}