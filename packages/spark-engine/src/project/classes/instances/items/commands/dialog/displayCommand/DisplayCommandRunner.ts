import { SparkGame } from "../../../../../../../game";
import { CommandContext, CommandRunner } from "../../../command/CommandRunner";
import { DisplayCommandData } from "./DisplayCommandData";
import { executeDisplayCommand } from "./executeDisplayCommand";

export class DisplayCommandRunner<G extends SparkGame> extends CommandRunner<
  G,
  DisplayCommandData
> {
  autoDelay = 0.5;

  down = false;

  wasPressed = false;

  wasTyped = false;

  timeTypedMS = -1;

  elapsedMS = 0;

  onTick?: (deltaMS: number) => void;

  override onExecute(
    game: G,
    data: DisplayCommandData,
    context: CommandContext<G>
  ): number[] {
    this.wasPressed = false;
    this.wasTyped = false;
    this.timeTypedMS = -1;
    this.elapsedMS = 0;
    this.down = game.input.state.pointer.down.includes(0);
    this.onTick = executeDisplayCommand(game, data, context, () => {
      this.wasTyped = true;
    });
    return super.onExecute(game, data, context);
  }

  override onUpdate(_game: G, deltaMS: number): void {
    if (this.onTick) {
      this.onTick(deltaMS);
      this.elapsedMS += deltaMS;
    }
  }

  override onDestroy(_game: G): void {
    this.onTick = undefined;
  }

  override isFinished(
    game: G,
    data: DisplayCommandData,
    context: CommandContext<G>
  ): boolean {
    const { type, autoAdvance } = data.params;
    const prevDown = this.down;
    this.down = game.input.state.pointer.down.includes(0);
    const blockState = game.logic.state.blockStates[data.reference.parentId];
    if (!blockState) {
      return false;
    }
    if (this.wasTyped && this.timeTypedMS < 0) {
      this.timeTypedMS = this.elapsedMS;
    }
    const timeMSSinceTyped = this.elapsedMS - this.timeTypedMS;
    if (
      autoAdvance &&
      this.wasTyped &&
      timeMSSinceTyped / 1000 >= this.autoDelay
    ) {
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
      let msAfterStopped = 0;
      this.onTick = (deltaMS: number) => {
        // Wait until typing sound has had enough time to fade out
        // So that it doesn't crackle when cut short
        msAfterStopped += deltaMS;
        const elapsed = msAfterStopped / 1000;
        if (elapsed > 0.03) {
          this.wasTyped = true;
        }
      };
      executeDisplayCommand(game, data, {
        ...context,
        instant: true,
      });
    }
    return false;
  }

  override onPreview(
    game: G,
    data: DisplayCommandData,
    context: {
      valueMap: Record<string, unknown>;
      typeMap: { [type: string]: Record<string, any> };
      instant?: boolean;
      debug?: boolean;
    }
  ): boolean {
    executeDisplayCommand(game, data, context, undefined, undefined, true);
    return true;
  }
}
