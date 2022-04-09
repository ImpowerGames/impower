import { ImpowerGame } from "../../../../../../../game";
import { CommandContext, CommandRunner } from "../../../command/commandRunner";
import { DisplayCommandData } from "./displayCommandData";
import { executeDisplayCommand } from "./executeDisplayCommand";

export class DisplayCommandRunner extends CommandRunner<DisplayCommandData> {
  down = false;

  wasPressed = false;

  wasTyped = false;

  autoAdvance = false;

  init(): void {
    executeDisplayCommand();
  }

  onExecute(
    data: DisplayCommandData,
    context: CommandContext,
    game: ImpowerGame
  ): number[] {
    this.wasPressed = false;
    this.wasTyped = false;
    this.autoAdvance = data?.autoAdvance;
    this.down = game.input.state.pointer.down.includes(0);
    executeDisplayCommand(data, context, game, undefined, () => {
      this.wasTyped = true;
    });
    return super.onExecute(data, context, game);
  }

  isFinished(
    data: DisplayCommandData,
    context: CommandContext,
    game: ImpowerGame
  ): boolean {
    const prevDown = this.down;
    this.down = game.input.state.pointer.down.includes(0);
    if (this.wasTyped && this.autoAdvance === true) {
      return true;
    }
    if (!prevDown && this.down) {
      this.wasPressed = true;
    }
    if (this.wasPressed) {
      this.wasPressed = false;
      if (this.wasTyped) {
        this.wasPressed = false;
        this.wasTyped = false;
        return true;
      }
      executeDisplayCommand(
        data,
        {
          ...context,
          instant: true,
        },
        game
      );
      this.wasTyped = true;
    }
    return false;
  }
}
