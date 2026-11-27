import type { Game } from "../../src/game/core/classes/Game";
import {
  holdsPresentedText,
  MENU_LAYOUT,
  TEXTBOX_SCREEN,
} from "../../src/game/core/classes/presenters/textLayouts";

export function openEveryLayout(game: Game): void {
  const ui = game.module.ui as any;
  const construct = ui.constructLayoutsFromAst.bind(ui);
  ui.constructLayoutsFromAst = (...names: string[]) => {
    if (names.length > 0) {
      return construct(...names);
    }
    const layouts = game.program?.sparkle?.layouts ?? {};
    const ownText =
      holdsPresentedText(game, "main") || Boolean(layouts[TEXTBOX_SCREEN]);
    const ownMenu = game.module.ui.layoutHolds("main", ["choice"]);
    return construct(
      ...Object.keys(layouts).filter(
        (name) =>
          !(ownText && layouts[name]?.screen === TEXTBOX_SCREEN) &&
          !(ownMenu && name === MENU_LAYOUT),
      ),
    );
  };
}
