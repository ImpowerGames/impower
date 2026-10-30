import { Extension, Facet, combineConfig } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  PluginValue,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";

export interface IndentedLineWrappingConfig {
  padding?: string;
}

export const indentedLineWrappingConfig = Facet.define<
  IndentedLineWrappingConfig,
  Required<IndentedLineWrappingConfig>
>({
  combine(configs) {
    return combineConfig(configs, {
      padding: `0px`,
    });
  },
});

class IndentedLineWrappingPluginValue implements PluginValue {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = this.getDecorations(view);
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = this.getDecorations(update.view);
    }
  }

  getDecorations(view: EditorView) {
    const config = view.state.facet(indentedLineWrappingConfig);
    const decorations = [];

    const tabSize = view.state.tabSize;

    let lastLineFrom = -1;
    for (const range of view.visibleRanges) {
      for (let pos = range.from; pos <= range.to; ) {
        const line = view.state.doc.lineAt(pos);
        pos = line.to + 1;
        if (line.from === lastLineFrom) {
          continue;
        }
        lastLineFrom = line.from;
        if (line.length === 0) {
          continue;
        }

        let indentSize = 0;
        for (let ch of line.text) {
          if (ch === "\t") {
            indentSize = indentSize + tabSize;
          } else if (ch === " ") {
            indentSize = indentSize + 1;
          } else {
            break;
          }
        }

        const indentWidth = `${indentSize}ch`;
        const textIndent = `-${indentWidth}`;
        const paddingLeft = `calc(${config.padding} + ${indentWidth})`;

        const decoration = Decoration.line({
          attributes: {
            style: `text-indent: ${textIndent}; padding-left: ${paddingLeft}`,
          },
        });

        decorations.push(decoration.range(line.from, line.from));
      }
    }

    return Decoration.set(decorations, true);
  }
}

export const indentedLineWrapping = (
  config: IndentedLineWrappingConfig = {},
): Extension => {
  return [
    indentedLineWrappingConfig.of(config),
    ViewPlugin.fromClass(IndentedLineWrappingPluginValue, {
      decorations: (v) => v.decorations,
    }),
    EditorView.lineWrapping,
  ];
};
