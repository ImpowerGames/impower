import { evaluate } from "../../../../../../../../../spark-evaluate";
import { ReturnCommandData } from "../../../../../../../data";
import { SparkGame } from "../../../../../../../game";
import { CommandContext, CommandRunner } from "../../../command/CommandRunner";

export class ReturnCommandRunner extends CommandRunner<ReturnCommandData> {
  onExecute(
    data: ReturnCommandData,
    context: CommandContext,
    game: SparkGame
  ): number[] {
    const { value } = data;
    const { valueMap } = context;

    const returnValue =
      typeof value === "object" ? evaluate(value, valueMap) : value;

    const id = data.reference.parentContainerId;
    game.logic.returnFromBlock(id, returnValue);

    return super.onExecute(data, context, game);
  }
}
