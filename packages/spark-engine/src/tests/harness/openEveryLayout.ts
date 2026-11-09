import type { Game } from "../../game/core/classes/Game";
import { holdsPresentedText } from "../../game/core/classes/presenters/textLayouts";

export function openEveryLayout(game: Game): void {
  const ui = game.module.ui as any;
  const construct = ui.constructLayoutsFromAst.bind(ui);
  ui.constructLayoutsFromAst = (...names: string[]) => {
    if (names.length > 0) {
      return construct(...names);
    }
    const layouts = Object.keys(game.program?.sparkle?.layouts ?? {});
    const mainHoldsText = holdsPresentedText(game, "main");
    return construct(
      ...layouts.filter(
        (name) =>
          name === "main" || !mainHoldsText || !holdsPresentedText(game, name),
      ),
    );
  };
}
