import type { Game } from "../../game/core/classes/Game";
import { skippedInitialLayouts } from "../../game/core/classes/presenters/textLayouts";

export function openEveryLayout(game: Game): void {
  const ui = game.module.ui as any;
  const construct = ui.constructLayoutsFromAst.bind(ui);
  ui.constructLayoutsFromAst = (...names: string[]) => {
    if (names.length > 0) {
      return construct(...names);
    }
    const skipped = skippedInitialLayouts(game);
    return construct(
      ...Object.keys(game.program?.sparkle?.layouts ?? {}).filter(
        (name) => !skipped.includes(name),
      ),
    );
  };
}
