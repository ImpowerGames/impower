import {
  EditorState,
  StateEffect,
  StateField,
  Transaction,
  TransactionSpec,
} from "@codemirror/state";
import { Decoration, DecorationSet, EditorView } from "@codemirror/view";
import { ColorInformation } from "vscode-languageserver-protocol";
import { FeatureSupport } from "../../types/FeatureSupport";
import { positionToOffset } from "../../utils/positionToOffset";
import ColorSupportWidget, {
  COLOR_SUPPORT_WIDGET_THEME,
} from "../ColorSupportWidget";

const clearColorDecorationsEffect = StateEffect.define<{}>();

const addColorDecorationEffect = StateEffect.define<{
  color: string;
  from: number;
  to: number;
}>({
  map: ({ color, from, to }, change) => ({
    color,
    from: change.mapPos(from),
    to: change.mapPos(to),
  }),
});

const setColorDecorations = (
  state: EditorState,
  colors: ColorInformation[]
): TransactionSpec => {
  const effects: StateEffect<unknown>[] = [];
  effects.push(clearColorDecorationsEffect.of({}));
  effects.push(
    ...colors.map((c) => {
      const r = c.color.red * 255;
      const g = c.color.green * 255;
      const b = c.color.blue * 255;
      const a = c.color.alpha;
      const rgb = `rgb(${r} ${g} ${b} / ${a * 100}%)`;
      return addColorDecorationEffect.of({
        color: rgb,
        from: positionToOffset(state.doc, c.range.start),
        to: positionToOffset(state.doc, c.range.end),
      });
    })
  );
  return { effects };
};

const colorDecorationsField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations: DecorationSet, tr: Transaction) {
    decorations = decorations.map(tr.changes);
    for (let e of tr.effects) {
      if (e.is(clearColorDecorationsEffect)) {
        decorations = Decoration.none;
      }
      if (e.is(addColorDecorationEffect)) {
        const color = e.value.color;
        const from = e.value.from;
        const to = e.value.to;
        const widget = Decoration.widget({
          widget: new ColorSupportWidget({
            color,
            from,
            to,
          }),
          side: 1,
        });
        decorations = decorations.update({
          add: [widget.range(from)],
        });
      }
    }
    return decorations;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export default class ColorSupport
  implements FeatureSupport<ColorInformation[]>
{
  load() {
    return [colorDecorationsField, COLOR_SUPPORT_WIDGET_THEME];
  }

  transaction(state: EditorState, colors: ColorInformation[]): TransactionSpec {
    return setColorDecorations(state, colors);
  }
}
