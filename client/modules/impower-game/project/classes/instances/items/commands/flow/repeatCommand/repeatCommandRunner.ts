import { CommandData } from "../../../../../../../data";
import { ImpowerGame } from "../../../../../../../game";
import { CommandContext, CommandRunner } from "../../../command/commandRunner";

export class RepeatCommandRunner extends CommandRunner<CommandData> {
  onExecute(
    data: CommandData,
    context: CommandContext,
    game: ImpowerGame
  ): number[] {
    const id = data.reference.parentContainerId;

    game.logic.executeBlock({ id, executedByBlockId: id });

    return super.onExecute(data, context, game);
  }
}
