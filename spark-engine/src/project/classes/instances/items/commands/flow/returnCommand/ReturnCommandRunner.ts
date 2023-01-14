import { evaluate } from "../../../../../../../../../spark-evaluate";
import { ReturnCommandData } from "../../../../../../../data";
import { Game } from "../../../../../../../game";
import { CommandContext, CommandRunner } from "../../../command/CommandRunner";

export class ReturnCommandRunner<G extends Game> extends CommandRunner<
  G,
  ReturnCommandData
> {
  override onExecute(
    game: G,
    data: ReturnCommandData,
    context: CommandContext<G>
  ): number[] {
    const { value } = data;
    const { valueMap } = context;

    const returnValue =
      typeof value === "object" ? evaluate(value, valueMap) : value;

    const id = data.reference.parentContainerId;
    game.logic.returnFromBlock(id, returnValue);

    return super.onExecute(game, data, context);
  }
}
