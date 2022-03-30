import { ImpowerGame } from "../../../../../../../game";
import { CommandContext, CommandRunner } from "../../../command/commandRunner";
import { DisplayCommandData } from "./displayCommandData";
import { executeDisplayCommand } from "./executeDisplayCommand";

export class DisplayCommandRunner extends CommandRunner<DisplayCommandData> {
  delay: number;

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
    this.delay = executeDisplayCommand(data, context);
    return super.onExecute(data, context, game);
  }

  isFinished(
    data: DisplayCommandData,
    context: CommandContext,
    game: ImpowerGame
  ): boolean {
    const prevDown = this.down;
    this.down = game.input.state.pointer.down.includes(0);
    const blockId = data.reference.parentContainerId;
    const blockState = game.logic.state.blockStates[blockId];
    const timeSinceExecution = blockState.time - blockState.lastExecutedAt;
    const secondsSinceExecution = timeSinceExecution / 1000;
    if (this.delay != null) {
      if (secondsSinceExecution > this.delay) {
        this.wasTyped = true;
      }
      if (this.wasTyped && this.autoAdvance === true) {
        return true;
      }
      if (!prevDown && this.down) {
        this.wasPressed = true;
      }
      if (this.wasPressed) {
        this.wasPressed = false;
        if (this.wasTyped) {
          this.delay = null;
          this.wasPressed = false;
          this.wasTyped = false;
          return true;
        }
        executeDisplayCommand(data, {
          ...context,
          instant: true,
        });
        this.wasTyped = true;
      }
    }
    return false;
  }
}
