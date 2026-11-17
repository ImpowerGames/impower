import { StateEffect, StateField } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { ScreenplayConfig } from "../../../../../sparkdown-screenplay/src/types/ScreenplayConfig";
import { printedPageStyle } from "./screenplayGeometry";

export const setScreenplayConfig = StateEffect.define<ScreenplayConfig | undefined>();

export const setScreenplayPicks = StateEffect.define<readonly number[]>();

export const setScreenplayScenesBefore = StateEffect.define<number>();

export const screenplayConfigField = StateField.define<ScreenplayConfig | undefined>({
  create: () => undefined,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setScreenplayConfig)) {
        value = effect.value;
      }
    }
    return value;
  },
});

export const screenplayPicksField = StateField.define<ReadonlySet<number>>({
  create: () => new Set(),
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setScreenplayPicks)) {
        value = new Set(effect.value);
      }
    }
    return value;
  },
});

export const screenplayScenesBeforeField = StateField.define<number>({
  create: () => 0,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setScreenplayScenesBefore)) {
        value = effect.value;
      }
    }
    return value;
  },
});

export const paperSizeOf = (config: ScreenplayConfig | undefined) =>
  config?.screenplay_print_paper_size === "a4" ? "a4" : "usletter";

const screenplayPageAttributes = EditorView.editorAttributes.compute(
  [screenplayConfigField],
  (state) => {
    const config = state.field(screenplayConfigField);
    return {
      "data-scene-numbers": config?.screenplay_print_scene_numbers ?? "none",
      "data-headings-bold": config?.screenplay_print_headings_bold ? "on" : "off",
      "data-paper-size": paperSizeOf(config),
      style: printedPageStyle(config),
    };
  },
);

export const screenplaySettings = (config?: ScreenplayConfig, picks: readonly number[] = [], scenesBefore = 0) => [
  screenplayConfigField.init(() => config),
  screenplayPicksField.init(() => new Set(picks)),
  screenplayScenesBeforeField.init(() => scenesBefore),
  screenplayPageAttributes,
];
