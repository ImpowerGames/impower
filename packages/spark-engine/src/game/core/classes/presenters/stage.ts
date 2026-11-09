import type { Instructions } from "../../types/Instructions";
import type { Game } from "../Game";

export function clearStage(
  game: Game,
  instructions: Instructions,
  transientLayers: string[],
): void {
  if (!instructions.extended) {
    game.module.ui.image.clearAll(
      transientLayers.filter((layer) => !instructions.image?.[layer]),
    );
  }
  game.module.ui.image.restoreCleared(instructions);
}

export function writeStage(
  game: Game,
  instructions: Instructions,
  instant?: boolean,
  time?: number,
): void {
  if (instructions.image) {
    Object.entries(instructions.image).forEach(([target, events]) =>
      game.module.ui.image.write(target, events, instant, time),
    );
  }

  if (instructions.layout) {
    const settle = !!instant || Boolean(game.context.system.simulating);
    Object.values(instructions.layout).forEach((events) =>
      game.module.ui.composeWait(
        game.module.ui.applyLayoutInstructions(events, settle),
      ),
    );
  }

  game.module.ui.refreshLayouts();
}
