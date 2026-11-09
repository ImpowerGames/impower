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
  "choices",
  "choice",
];

export const UNSHOWN_TEXT_MESSAGE =
  "No open layout shows this text. Open textbox or textstream.";

export function holdsPresentedText(game: Game, layoutName: string): boolean {
  return game.module.ui.layoutHolds(layoutName, PRESENTED_TEXT_ELEMENTS);
}

export function initialLayouts(game: Game): string[] {
  const configured = game.context.config?.["ui"]?.layouts_initial;
  const names = Array.isArray(configured)
    ? configured
    : configured && typeof configured === "object"
      ? Object.values(configured)
      : [];
  const opened = ["main"];
  for (const name of names) {
    if (typeof name !== "string" || !name || opened.includes(name)) {
      continue;
    }
    if (
      holdsPresentedText(game, name) &&
      opened.some((open) => holdsPresentedText(game, open))
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
