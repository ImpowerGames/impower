import type { Instructions } from "../../types/Instructions";
import type { Game } from "../Game";
import type { StartingDisplayMode } from "../messages/SetStartingDisplayModeMessage";
import { TEXTSTREAM_LAYOUT } from "./InteractiveFictionPresenter";

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

const DIALOGUE_BOX_ELEMENTS: readonly string[] = ["textbox", "dialogue"];

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

export const TEXTBOX_LAYOUT = "textbox";

export function startingLayouts(
  configured: readonly unknown[],
  mode: StartingDisplayMode,
): unknown[] {
  if (mode !== TEXTSTREAM_LAYOUT || !configured.includes(TEXTBOX_LAYOUT)) {
    return [...configured];
  }
  const swapped = configured.map((name) =>
    name === TEXTBOX_LAYOUT ? TEXTSTREAM_LAYOUT : name,
  );
  return swapped.filter(
    (name, index) => name !== TEXTSTREAM_LAYOUT || swapped.indexOf(name) === index,
  );
}

function configuredInitialLayouts(
  game: Game,
  mode: StartingDisplayMode,
): unknown[] {
  const configured = game.context?.config?.["ui"]?.layouts_initial;
  return startingLayouts(
    Array.isArray(configured)
      ? configured
      : configured && typeof configured === "object"
        ? Object.values(configured)
        : [],
    mode,
  );
}

export function skippedInitialLayouts(
  game: Game,
  ui: LayoutReader = game.module.ui,
): string[] {
  const opened = initialLayouts(game, ui);
  return configuredInitialLayouts(game, game.startingDisplayMode).filter(
    (name): name is string =>
      typeof name === "string" && !!name && !opened.includes(name),
  );
}

export function initialLayouts(
  game: Game,
  ui: LayoutReader = game.module.ui,
  mode: StartingDisplayMode = game.startingDisplayMode,
): string[] {
  const opened = ["main"];
  for (const name of configuredInitialLayouts(game, mode)) {
    if (typeof name !== "string" || !name || opened.includes(name)) {
      continue;
    }
    if (
      ui.layoutHolds(name, DIALOGUE_BOX_ELEMENTS) &&
      holdsPresentedText(game, "main", ui)
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
  ui.openInitialLayouts(initialLayouts(game), settle, game.startingDisplayMode);
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
  const events = Object.values(instructions.layout ?? {}).flat();
  return game.module.ui
    .openedLayoutsAfter(events)
    .some((name) => holdsPresentedText(game, name));
}

export function opensTextLayout(
  game: Game,
  instructions: Instructions,
): boolean {
  return (
    presentsText(instructions) &&
    !textLayoutOpenAfter(game, { end: 0 }) &&
    textLayoutOpenAfter(game, instructions)
  );
}
