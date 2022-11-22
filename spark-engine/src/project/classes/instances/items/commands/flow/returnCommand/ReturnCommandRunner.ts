import { evaluate } from "../../../../../../../../../spark-evaluate";
import { ReturnCommandData } from "../../../../../../../data";
import { SparkGame } from "../../../../../../../game";
import { CommandContext, CommandRunner } from "../../../command/CommandRunner";

export class ReturnCommandRunner extends CommandRunner<ReturnCommandData> {
  override onExecute(
    game: SparkGame,
    data: ReturnCommandData,
    context: CommandContext
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
