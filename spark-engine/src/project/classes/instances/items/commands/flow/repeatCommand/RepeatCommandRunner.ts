import { CommandData } from "../../../../../../../data";
import { SparkGame } from "../../../../../../../game";
import { CommandContext, CommandRunner } from "../../../command/CommandRunner";

export class RepeatCommandRunner extends CommandRunner<CommandData> {
  override onExecute(
    game: SparkGame,
    data: CommandData,
    context: CommandContext
  ): number[] {
    const id = data.reference.parentContainerId;

    game.logic.executeBlock(id, id);

    return super.onExecute(game, data, context);
  }
}
