import { StateEffect, StateField } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { PRINT_PROFILES } from "../../../../../sparkdown-screenplay/src/constants/PRINT_PROFILES";
import type { ScreenplayConfig } from "../../../../../sparkdown-screenplay/src/types/ScreenplayConfig";

export const setScreenplayConfig = StateEffect.define<ScreenplayConfig | undefined>();

export const setScreenplayPicks = StateEffect.define<readonly number[]>();

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

export const paperSizeOf = (config: ScreenplayConfig | undefined) =>
  config?.screenplay_print_paper_size === "a4" ? "a4" : "usletter";

const EMS_PER_INCH = 6;

const inches = (value: number) =>
  `${Math.round(value * EMS_PER_INCH * 100) / 100}em`;

const screenplayPageAttributes = EditorView.editorAttributes.compute(
  [screenplayConfigField],
  (state) => {
    const config = state.field(screenplayConfigField);
    const paperSize = paperSizeOf(config);
    const profile = PRINT_PROFILES[paperSize];
    const textWidth = profile.page_width - profile.left_margin - profile.right_margin;
    return {
      "data-scene-numbers": config?.screenplay_print_scene_numbers ?? "none",
      "data-headings-bold": config?.screenplay_print_headings_bold ? "on" : "off",
      "data-paper-size": paperSize,
      style: `--sp-text-width: ${inches(textWidth)}; --sp-margin-left: ${inches(profile.left_margin)}; --sp-margin-right: ${inches(profile.right_margin)}`,
    };
  },
);

export const screenplaySettings = (config?: ScreenplayConfig, picks: readonly number[] = []) => [
  screenplayConfigField.init(() => config),
  screenplayPicksField.init(() => new Set(picks)),
  screenplayPageAttributes,
];
