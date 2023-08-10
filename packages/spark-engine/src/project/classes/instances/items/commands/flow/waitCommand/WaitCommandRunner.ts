import { WaitCommandData } from "../../../../../../../data";
import { Game } from "../../../../../../../game";
import { CommandContext, CommandRunner } from "../../../command/CommandRunner";

export class WaitCommandRunner<G extends Game> extends CommandRunner<
  G,
  WaitCommandData
> {
  msTimers: Map<string, number> = new Map();

  override onExecute(
    game: G,
    data: WaitCommandData,
    context: CommandContext<G>
  ): number[] {
    const { seconds } = data;
    this.msTimers.set(data.reference.id, 0);
    if (!seconds) {
      return super.onExecute(game, data, context);
    }
    return super.onExecute(game, data, context);
  }

  override onUpdate(_game: G, deltaMS: number): void {
    this.msTimers.forEach((_, key) => {
      this.msTimers.set(key, this.msTimers.get(key) ?? 0 + deltaMS);
    });
  }

  override isFinished(
    game: G,
    data: WaitCommandData,
    context: CommandContext<G>
  ): boolean | null {
    const { seconds } = data.params;
    if (seconds === undefined || seconds === 0) {
      return super.isFinished(game, data, context);
    }
    const blockState = game.logic.state.blockStates[data.reference.parentId];
    const timeMS = this.msTimers.get(data.reference.id) ?? 0;
    if (blockState) {
      if (seconds < 0) {
        return false;
      }
      if (timeMS / 1000 < seconds) {
        return false;
      }
    }
    return super.isFinished(game, data, context);
  }
}
