import { StateEffect, StateField, type Text } from "@codemirror/state";
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import type { ScreenplayConfig } from "../../../../../sparkdown-screenplay/src/types/ScreenplayConfig";
import { PREVIEW_FONT_SIZE } from "../constants/PREVIEW_THEME";
import { printedPageStyle } from "./screenplayGeometry";

export const setScreenplayConfig = StateEffect.define<ScreenplayConfig | undefined>();

export const setScreenplayPicks = StateEffect.define<readonly number[]>();

export const setScreenplayScenesBefore = StateEffect.define<number>();

export const setScreenplayRow = StateEffect.define<number>();

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

export const screenplayRowField = StateField.define<number>({
  create: () => PREVIEW_FONT_SIZE,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setScreenplayRow)) {
        value = effect.value;
      }
    }
    return value;
  },
});

const LINE_GAP_LENGTH = 4000;

const hasGappedLine = (doc: Text) => {
  for (let number = 1; number <= doc.lines; number++) {
    if (doc.line(number).length >= LINE_GAP_LENGTH) return true;
  }
  return false;
};

export const screenplayWrapsField = StateField.define<boolean>({
  create: (state) => hasGappedLine(state.doc),
  update: (value, transaction) => (transaction.docChanged ? hasGappedLine(transaction.state.doc) : value),
});

const screenplayLineWrapping = EditorView.contentAttributes.compute([screenplayWrapsField], (state): Record<string, string> =>
  state.field(screenplayWrapsField) ? { class: "cm-lineWrapping" } : {},
);

const screenplayRowMeasure = ViewPlugin.fromClass(
  class {
    constructor(readonly view: EditorView) {
      this.measure();
    }

    update(update: ViewUpdate) {
      if (update.geometryChanged) this.measure();
    }

    measure() {
      this.view.requestMeasure({
        key: this,
        read: (view) => view.defaultLineHeight,
        write: (row, view) => {
          if (row > 0 && row !== view.state.field(screenplayRowField)) {
            queueMicrotask(() => {
              if (row !== view.state.field(screenplayRowField)) view.dispatch({ effects: setScreenplayRow.of(row) });
            });
          }
        },
      });
    }
  },
);

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
  screenplayRowField,
  screenplayRowMeasure,
  screenplayWrapsField,
  screenplayLineWrapping,
  screenplayPageAttributes,
];
