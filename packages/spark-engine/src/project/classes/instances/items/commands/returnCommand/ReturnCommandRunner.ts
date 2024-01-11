import { ReturnCommandData } from "../../../../../../data";
import { Game } from "../../../../../../game";
import { CommandContext, CommandRunner } from "../../command/CommandRunner";

export class ReturnCommandRunner<G extends Game> extends CommandRunner<
  G,
  ReturnCommandData
> {
  override onExecute(
    data: ReturnCommandData,
    context: CommandContext
  ): number[] {
    const { value } = data.params;

    const returnValue = this.game.logic.evaluate(value);

    const id = data.reference.parentId;
    this.game.logic.returnFromBlock(id, returnValue);

    return super.onExecute(data, context);
  }
}
