import { evaluate } from "../../../../../../../../impower-evaluate";
import { ReturnCommandData } from "../../../../../../../data";
import { ImpowerGame } from "../../../../../../../game";
import { CommandContext, CommandRunner } from "../../../command/commandRunner";

export class ReturnCommandRunner extends CommandRunner<ReturnCommandData> {
  onExecute(
    data: ReturnCommandData,
    context: CommandContext,
    game: ImpowerGame
  ): number[] {
    const { value } = data;
    const { valueMap } = context;

    const returnValue =
      typeof value === "object" ? evaluate(valueMap, value) : value;

    const id = data.reference.parentContainerId;
    game.logic.returnFromBlock({
      id,
      value: returnValue,
    });

    return super.onExecute(data, context, game);
  }
}
