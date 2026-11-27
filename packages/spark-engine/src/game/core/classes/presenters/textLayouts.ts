import { LayoutVerb } from "@impower/sparkdown/language/sparkdown.layout-verbs";
import type { LayoutInstruction } from "../../types/Instruction";
import type { Instructions } from "../../types/Instructions";
import type { Game } from "../Game";
import type { StartingDisplayMode } from "../messages/SetStartingDisplayModeMessage";
import { SPEAKER_TARGETS, TEXTSTREAM_LAYOUT } from "./InteractiveFictionPresenter";

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

const DIALOGUE_BOX_ELEMENTS: readonly string[] = ["textbox", "dialogue"];

const MENU_ELEMENT = "choice";

export const MENU_LAYOUT = "choices";

type LayoutReader = Pick<Game["module"]["ui"], "layoutHolds">;

export function holdsPresentedText(
  game: Game,
  layoutName: string,
  ui: LayoutReader = game.module.ui,
): boolean {
  return ui.layoutHolds(layoutName, PRESENTED_TEXT_ELEMENTS);
}

export const TEXTBOX_SCREEN = "textbox";

export function startingLayouts(
  configured: readonly unknown[],
  mode: StartingDisplayMode,
): unknown[] {
  if (mode !== TEXTSTREAM_LAYOUT || !configured.includes(TEXTBOX_SCREEN)) {
    return [...configured];
  }
  const swapped = configured.map((name) =>
    name === TEXTBOX_SCREEN ? TEXTSTREAM_LAYOUT : name,
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

export function initialLayouts(
  game: Game,
  mode: StartingDisplayMode = game.startingDisplayMode,
): string[] {
  const ui = game.module.ui;
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
  const names = initialLayouts(game);
  ui.openInitialLayouts(
    names,
    settle,
    game.startingDisplayMode,
    ui.isScreen(TEXTBOX_SCREEN) && !names.includes(TEXTBOX_SCREEN)
      ? [TEXTBOX_SCREEN]
      : [],
  );
}

export function presentsText(instructions: Instructions): boolean {
  return (
    Object.keys(instructions.text ?? {}).length > 0 ||
    (instructions.choices?.length ?? 0) > 0
  );
}

function elementName(target: string): string {
  return target.split("#")[0]!.split(" ")[0]!;
}

function beatTargets(instructions: Instructions): string[] {
  return [
    ...Object.keys(instructions.text ?? {}),
    ...(instructions.choices ?? []),
  ].map(elementName);
}

export function layoutEvents(instructions: Instructions): LayoutInstruction[] {
  return Object.values(instructions.layout ?? {}).flat();
}

export function textLayoutOpenAfter(
  game: Game,
  instructions: Instructions,
): boolean {
  const ui = game.module.ui;
  const events = layoutEvents(instructions);
  if (
    ui.isScreen(TEXTBOX_SCREEN) &&
    !ui.screensClosedAfter(events).includes(TEXTBOX_SCREEN)
  ) {
    return true;
  }
  const targets = [...PRESENTED_TEXT_ELEMENTS, ...beatTargets(instructions)];
  return ui
    .openedLayoutsAfter(events)
    .some((name) => ui.layoutHolds(name, targets));
}

export function opensTextLayout(
  game: Game,
  instructions: Instructions,
): boolean {
  if (!presentsText(instructions)) {
    return false;
  }
  const ui = game.module.ui;
  const before = ui.openedLayoutsAfter([]);
  const after = ui.openedLayoutsAfter(layoutEvents(instructions));
  const holds = (names: string[], target: string) =>
    names.some((name) => ui.layoutHolds(name, [target]));
  return beatTargets(instructions).some(
    (target) => !holds(before, target) && holds(after, target),
  );
}

function showsText(instructions: Instructions): boolean {
  return (
    (instructions.choices?.length ?? 0) > 0 ||
    Object.values(instructions.text ?? {}).some((events) =>
      events.some((event) => event.text.trim().length > 0),
    )
  );
}

function takesTime(instructions: Instructions): boolean {
  return Boolean(
    instructions.text ||
      instructions.choices?.length ||
      instructions.audio ||
      instructions.load ||
      instructions.cutscene ||
      Number(instructions.end) > 0,
  );
}

interface TextKind {
  element: string;
  layout: string;
}

const MENU_KIND: TextKind = { element: MENU_ELEMENT, layout: MENU_LAYOUT };

function lineKind(instructions: Instructions): TextKind | undefined {
  const line = Object.keys(instructions.text ?? {}).find(
    (target) =>
      !SPEAKER_TARGETS.includes(target) && !target.startsWith("choice "),
  );
  if (!line) {
    return undefined;
  }
  const name = elementName(line);
  return { element: name, layout: name };
}

function beatKinds(instructions: Instructions): TextKind[] {
  if (!showsText(instructions)) {
    return [];
  }
  const line = lineKind(instructions);
  return [
    ...(line ? [line] : []),
    ...((instructions.choices?.length ?? 0) > 0 ? [MENU_KIND] : []),
  ];
}

function opensByItself(
  game: Game,
  kind: string,
  closedScreens: readonly string[],
): boolean {
  const layout = game.program?.sparkle?.layouts?.[kind];
  return Boolean(
    layout &&
      kind !== "main" &&
      kind !== TEXTSTREAM_LAYOUT &&
      !(layout.screen && closedScreens.includes(layout.screen)),
  );
}

function isMenu(instructions: Instructions): boolean {
  const kinds = beatKinds(instructions);
  return kinds.length === 1 && kinds[0] === MENU_KIND;
}

export function keptThroughMenu(
  game: Game,
  instructions: Instructions,
  targets: readonly string[],
): string[] {
  if (!isMenu(instructions)) {
    return [];
  }
  const ui = game.module.ui;
  const open = ui.openedLayoutsAfter(layoutEvents(instructions));
  if (open.includes(TEXTSTREAM_LAYOUT)) {
    return [];
  }
  const menus = open.filter((name) => ui.layoutHolds(name, [MENU_ELEMENT]));
  return targets.filter(
    (target) =>
      !menus.some((name) => ui.layoutHolds(name, [elementName(target)])),
  );
}

export function menuLeavesWithItsLayout(game: Game): boolean {
  return game.module.ui.autoLayoutsAfter([]).includes(MENU_LAYOUT);
}

export function closeMenuAtEnd(game: Game, instant: boolean): void {
  if (menuLeavesWithItsLayout(game)) {
    void game.module.ui.applyLayoutInstructions(
      [{ control: LayoutVerb.close, name: MENU_LAYOUT, auto: true }],
      instant,
    );
  }
}

export function routeLine(
  game: Game,
  instructions: Instructions,
  prior: readonly LayoutInstruction[] = [],
): Instructions {
  const ui = game.module.ui;
  if (!game.program?.sparkle?.layouts) {
    return instructions;
  }
  const events = [...prior, ...layoutEvents(instructions)];
  const autos = ui.autoLayoutsAfter(events);
  const kinds = beatKinds(instructions);
  const routed: LayoutInstruction[] = [];
  const close = (name: string) =>
    routed.push({ control: LayoutVerb.close, name, auto: true });
  if (kinds.length === 0) {
    const closesBox = !instructions.extended && takesTime(instructions);
    for (const auto of autos) {
      if (closesBox || auto === MENU_LAYOUT) {
        close(auto);
      }
    }
  } else {
    const open = ui.openedLayoutsAfter(events);
    const closedScreens = ui.screensClosedAfter(events);
    const holdersOf = (kind: TextKind) =>
      open.includes(TEXTSTREAM_LAYOUT)
        ? [TEXTSTREAM_LAYOUT]
        : open.filter((name) => ui.layoutHolds(name, [kind.element]));
    const holders = new Set(kinds.flatMap(holdersOf));
    const menuOnly = isMenu(instructions);
    for (const auto of autos) {
      if (!holders.has(auto) && (!menuOnly || auto === MENU_LAYOUT)) {
        close(auto);
      }
    }
    for (const kind of kinds) {
      if (
        holdersOf(kind).length === 0 &&
        !open.includes(kind.layout) &&
        opensByItself(game, kind.layout, closedScreens)
      ) {
        routed.push({ control: LayoutVerb.open, name: kind.layout, auto: true });
      }
    }
  }
  if (routed.length === 0) {
    return instructions;
  }
  const key = routed.at(-1)!.name;
  const layout = { ...instructions.layout };
  layout[key] = [...(layout[key] ?? []), ...routed];
  return { ...instructions, layout };
}
