import { CommandData } from "../../../../../../../data";
import { SparkGame } from "../../../../../../../game";
import { CommandContext, CommandRunner } from "../../../command/CommandRunner";

export class RepeatCommandRunner extends CommandRunner<CommandData> {
  onExecute(
    data: CommandData,
    context: CommandContext,
    game: SparkGame
  ): number[] {
    const id = data.reference.parentContainerId;

    game.logic.executeBlock({ id, executedByBlockId: id });

    return super.onExecute(data, context, game);
  }
}
