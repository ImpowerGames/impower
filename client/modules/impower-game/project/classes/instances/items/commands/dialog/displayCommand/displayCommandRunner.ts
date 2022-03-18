import { ImpowerGame } from "../../../../../../../game";
import { CommandContext, CommandRunner } from "../../../command/commandRunner";
import { DisplayCommandData } from "./displayCommandData";
import { executeDisplayCommand } from "./executeDisplayCommand";

export class DisplayCommandRunner extends CommandRunner<DisplayCommandData> {
  down = false;

  onExecute(
    data: DisplayCommandData,
    context: CommandContext,
    game: ImpowerGame
  ): number[] {
    this.down = game.input.state.pointer.down.includes(0);
    executeDisplayCommand(data, context);
    return super.onExecute(data, context, game);
  }

  isFinished(
    data: DisplayCommandData,
    context: CommandContext,
    game: ImpowerGame
  ): boolean {
    const prevDown = this.down;
    this.down = game.input.state.pointer.down.includes(0);
    if (!prevDown && this.down) {
      return true;
    }
    return false;
  }
}
