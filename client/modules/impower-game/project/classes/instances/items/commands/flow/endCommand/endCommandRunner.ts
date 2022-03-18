import { CommandData } from "../../../../../../../data";
import { ImpowerGame } from "../../../../../../../game";
import { CommandContext, CommandRunner } from "../../../command/commandRunner";

export class EndCommandRunner extends CommandRunner<CommandData> {
  onExecute(
    data: CommandData,
    context: CommandContext,
    game: ImpowerGame
  ): number[] {
    game.end();
    return super.onExecute(data, context, game);
  }
}
