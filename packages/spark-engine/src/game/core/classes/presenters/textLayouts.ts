import type { Instructions } from "../../types/Instructions";
import type { Game } from "../Game";

export const PRESENTED_TEXT_ELEMENTS: readonly string[] = [
  "textbox",
  "character_name",
  "character_parenthetical",
  "title",
  "heading",
  "transitional",
  "dialogue",
  "action",
  "continue_indicator",
  "choices",
  "choice",
];

export const UNSHOWN_TEXT_MESSAGE =
  "No open layout shows this text. Open textbox or textstream.";

type LayoutReader = Pick<Game["module"]["ui"], "layoutHolds">;

export function holdsPresentedText(
  game: Game,
  layoutName: string,
  ui: LayoutReader = game.module.ui,
): boolean {
  return ui.layoutHolds(layoutName, PRESENTED_TEXT_ELEMENTS);
}

function configuredInitialLayouts(game: Game): unknown[] {
  const configured = game.context.config?.["ui"]?.layouts_initial;
  return Array.isArray(configured)
    ? configured
    : configured && typeof configured === "object"
      ? Object.values(configured)
      : [];
}

export function skippedInitialLayouts(
  game: Game,
  ui: LayoutReader = game.module.ui,
): string[] {
  const opened = initialLayouts(game, ui);
  return configuredInitialLayouts(game).filter(
    (name): name is string =>
      typeof name === "string" && !!name && !opened.includes(name),
  );
}

export function initialLayouts(
  game: Game,
  ui: LayoutReader = game.module.ui,
): string[] {
  const opened = ["main"];
  for (const name of configuredInitialLayouts(game)) {
    if (typeof name !== "string" || !name || opened.includes(name)) {
      continue;
    }
    if (
      holdsPresentedText(game, name, ui) &&
      opened.some((open) => holdsPresentedText(game, open, ui))
    ) {
      continue;
    }
    opened.push(name);
  }
  return opened;
}

export function openInitialLayouts(game: Game, settle: boolean): void {
  const ui = game.module.ui;
  if (ui.initialLayoutsOpened) {
    return;
  }
  ui.openInitialLayouts(initialLayouts(game), settle);
}

export function presentsText(instructions: Instructions): boolean {
  return (
    Object.keys(instructions.text ?? {}).length > 0 ||
    (instructions.choices?.length ?? 0) > 0
  );
}

export function textLayoutOpenAfter(
  game: Game,
  instructions: Instructions,
): boolean {
  const open = new Set(game.module.ui.openedLayouts());
  for (const events of Object.values(instructions.layout ?? {})) {
    for (const e of events) {
      if (e.control === "close") {
        open.delete(e.name);
      } else if (e.name) {
        open.add(e.name);
      }
    }
  }
  return [...open].some((name) => holdsPresentedText(game, name));
}
