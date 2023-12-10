import {
  EditorState,
  StateEffect,
  StateField,
  Transaction,
  TransactionSpec,
} from "@codemirror/state";
import { Decoration, DecorationSet, EditorView } from "@codemirror/view";
import { ColorInformation } from "../../../../../spark-editor-protocol/src/types";
import { FeatureSupport } from "../../types/FeatureSupport";
import { positionToOffset } from "../../utils/positionToOffset";
import ColorSupportWidget, {
  COLOR_SUPPORT_WIDGET_THEME,
} from "../ColorSupportWidget";

const updateColorDecorationEffect = StateEffect.define<
  {
    color: string;
    from: number;
    to: number;
  }[]
>({
  map: (value, change) =>
    value.map((v) => ({
      color: v.color,
      from: change.mapPos(v.from),
      to: change.mapPos(v.to),
    })),
});

const setColorDecorations = (
  state: EditorState,
  colors: ColorInformation[]
): TransactionSpec => {
  const effects: StateEffect<unknown>[] = [];
  const value = colors
    .map((c) => {
      const r = c.color.red * 255;
      const g = c.color.green * 255;
      const b = c.color.blue * 255;
      const a = c.color.alpha;
      const rgb = `rgb(${r} ${g} ${b} / ${a * 100}%)`;
      return {
        color: rgb,
        from: positionToOffset(state.doc, c.range.start),
        to: positionToOffset(state.doc, c.range.end),
      };
    })
    .sort((a, b) => a.from - b.from);
  effects.push(updateColorDecorationEffect.of(value));
  return { effects };
};

const colorDecorationsField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations: DecorationSet, tr: Transaction) {
    for (let e of tr.effects) {
      if (e.is(updateColorDecorationEffect)) {
        decorations = Decoration.set(
          e.value.map((r) =>
            Decoration.widget({
              widget: new ColorSupportWidget({
                color: r.color,
                from: r.from,
                to: r.to,
              }),
              side: 1,
            }).range(r.from)
          )
        );
        return decorations;
      }
    }
    decorations = decorations.map(tr.changes);
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
