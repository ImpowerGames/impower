/**
 * Based on awesome-line-wrapping.js by dralletje
 * <https://gist.github.com/dralletje/058fe51415fe7dbac4709a65c615b52e>
 */

import {
  Extension,
  Facet,
  RangeSetBuilder,
  combineConfig,
} from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  PluginValue,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";

const isWhitespace = (s?: string) => s && s.length > 0 && s.trim().length === 0;

const whitespaceMarkerTheme = EditorView.baseTheme({
  "&light": {
    "--whitespace-marker-color": "#00000040",
  },

  "&dark": {
    "--whitespace-marker-color": "#ffffff40",
  },

  ".cm-whitespace-marker": {
    position: "relative",
  },

  ".cm-whitespace-marker::before": {
    content: '"·"',
    position: "absolute",
    inset: 0,
    zIndex: -1,
    pointerEvents: "none",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    textAlign: "center",
    fontSize: "0.5em",
    color: "var(--whitespace-marker-color)",
    textIndent: 0,
  },
});

export interface WhitespaceMarkerConfig {}

export const whitespaceMarkerConfig = Facet.define<
  WhitespaceMarkerConfig,
  Required<WhitespaceMarkerConfig>
>({
  combine(configs) {
    return combineConfig(configs, {});
  },
});

const whitespaceMarker = Decoration.mark({
  attributes: { class: "cm-whitespace-marker" },
});

class WhitespaceMarkerPluginValue implements PluginValue {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = this.getDecorations(view);
  }

  update(update: ViewUpdate) {
    if (update.docChanged) {
      this.decorations = this.getDecorations(update.view);
    }
  }

  getDecorations(view: EditorView) {
    const builder = new RangeSetBuilder<Decoration>();
    for (let { from, to } of view.visibleRanges) {
      for (let pos = from; pos <= to; ) {
        let line = view.state.doc.lineAt(pos);
        const text = line.text;
        for (let i = 0; i < text.length; i += 1) {
          const prev = text[i - 1];
          const curr = text[i];
          const next = text[i + 1];
          const isBoundary = isWhitespace(prev) || isWhitespace(next) || !next;
          if (isWhitespace(curr) && isBoundary) {
            const pos = line.from + i;
            builder.add(pos, pos + 1, whitespaceMarker);
          }
        }
        pos = line.to + 1;
      }
    }
    return builder.finish();
  }
}

export const whitespaceMarkers = (
  config: WhitespaceMarkerConfig = {}
): Extension => {
  return [
    whitespaceMarkerTheme,
    whitespaceMarkerConfig.of(config),
    ViewPlugin.fromClass(WhitespaceMarkerPluginValue, {
      decorations: (v) => v.decorations,
    }),
  ];
};
