/**
 * Based on awesome-line-wrapping.js by dralletje
 * <https://gist.github.com/dralletje/058fe51415fe7dbac4709a65c615b52e>
 */

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
  /**
   * The amount of padding before the line.
   */
  padding?: string;
}

export const indentedLineWrappingConfig = Facet.define<
  IndentedLineWrappingConfig,
  Required<IndentedLineWrappingConfig>
>({
  combine(configs) {
    return combineConfig(configs, {
      padding: `8px`,
    });
  },
});

class IndentedLineWrappingPluginValue implements PluginValue {
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
    const config = view.state.facet(indentedLineWrappingConfig);
    const decorations = [];

    const tabSize = view.state.tabSize;

    for (let i of [...Array(view.state.doc.lines).keys()]) {
      const line = view.state.doc.line(i + 1);
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
      const textIndent = `calc(-${indentWidth} - 1px)`;
      const paddingLeft = `calc(${config.padding} + ${indentWidth})`;

      const decoration = Decoration.line({
        attributes: {
          style: `text-indent: ${textIndent}; padding-left: ${paddingLeft}`,
        },
      });

      decorations.push(decoration.range(line.from, line.from));
    }

    return Decoration.set(decorations, true);
  }
}

export const indentedLineWrapping = (
  config: IndentedLineWrappingConfig = {}
): Extension => {
  return [
    indentedLineWrappingConfig.of(config),
    ViewPlugin.fromClass(IndentedLineWrappingPluginValue, {
      decorations: (v) => v.decorations,
    }),
    EditorView.lineWrapping,
  ];
};
