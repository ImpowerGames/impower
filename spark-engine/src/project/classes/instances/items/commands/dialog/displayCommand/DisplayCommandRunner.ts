import { SparkGame } from "../../../../../../../game";
import { CommandContext, CommandRunner } from "../../../command/CommandRunner";
import { DisplayCommandData } from "./DisplayCommandData";
import { executeDisplayCommand } from "./executeDisplayCommand";

export class DisplayCommandRunner<G extends SparkGame> extends CommandRunner<
  G,
  DisplayCommandData
> {
  autoDelay = 0.5;

  fadeOutDuration = 0.025;

  down = false;

  wasPressed = false;

  wasTyped = false;

  timeTypedMS = -1;

  elapsedMS = 0;

  voiceState?: {
    lastCharacter?: string;
    pitchOffset?: Record<string, number>;
  } = {};

  onTick?: (timeMS: number) => void;

  override init(game: G): void {
    executeDisplayCommand(game);
  }

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
    this.onTick = executeDisplayCommand(
      game,
      data,
      context,
      this.voiceState,
      () => {
        this.wasTyped = true;
      }
    );
    return super.onExecute(game, data, context);
  }

  override onUpdate(_game: G, deltaMS: number): void {
    if (this.onTick) {
      this.onTick(deltaMS);
      this.elapsedMS += deltaMS;
    }
  }

  override isFinished(
    game: G,
    data: DisplayCommandData,
    context: CommandContext<G>
  ): boolean {
    const prevDown = this.down;
    this.down = game.input.state.pointer.down.includes(0);
    const blockState =
      game.logic.state.blockStates[data.reference.parentContainerId];
    if (!blockState) {
      return true;
    }
    if (this.wasTyped && this.timeTypedMS < 0) {
      this.timeTypedMS = this.elapsedMS;
    }
    const timeMSSinceTyped = this.elapsedMS - this.timeTypedMS;
    if (
      data.autoAdvance &&
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
      let stoppedAt = game.ticker.state.elapsedMS / 1000;
      this.onTick = (timeMS: number) => {
        // Wait until typing sound has had enough time to fade out
        // So that it doesn't crackle when cut short
        const elapsedSeconds = timeMS / 1000;
        const elapsed = elapsedSeconds - stoppedAt;
        if (elapsed > this.fadeOutDuration) {
          this.wasTyped = true;
        }
      };
      executeDisplayCommand(game, data, {
        ...context,
        instant: true,
        fadeOutDuration: this.fadeOutDuration,
      });
    }
    return false;
  }

  override onPreview(
    game: G,
    data: DisplayCommandData,
    context: {
      valueMap: Record<string, unknown>;
      objectMap: { [type: string]: Record<string, any> };
      instant?: boolean;
      debug?: boolean;
    }
  ): boolean {
    executeDisplayCommand(
      game,
      data,
      context,
      this.voiceState,
      undefined,
      true
    );
    return true;
  }
}
